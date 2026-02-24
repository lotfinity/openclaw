import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { sendMessageTelegram } from "../telegram/send.js";

type WebsiteAssistConfig = {
  enabled?: boolean;
  botToken?: string;
  relayKey?: string;
  telegramTo?: string;
  nodeTag?: string;
  autoTopic?: boolean;
  topicPrefix?: string;
};

type WebsiteAssistRequestBody = {
  text?: unknown;
  relayKey?: unknown;
  sourceUrl?: unknown;
  visitorId?: unknown;
  nodeId?: unknown;
  to?: unknown;
  conversationId?: unknown;
  mediaDataUrl?: unknown;
  mediaFileName?: unknown;
  mediaMimeType?: unknown;
};

type WebsiteAssistMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  source: "website" | "telegram" | "api";
};

type WebsiteAssistConversation = {
  messages: WebsiteAssistMessage[];
};

type TelegramPollState = {
  offset: number;
  lastPollAt: number;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    message_thread_id?: number;
    text?: string;
    caption?: string;
    chat?: { id?: number | string };
    from?: { is_bot?: boolean };
    reply_to_message?: { message_id?: number };
  };
};

const GATEWAY_STARTED_AT = new Date();

const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_TRACKED_SENT_MESSAGES = 10_000;
const MAX_TRACKED_UPDATES = 5_000;
const TELEGRAM_REPLY_POLL_INTERVAL_MS = 3_000;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const conversations = new Map<string, WebsiteAssistConversation>();
const sentMessageConversationIndex = new Map<string, string>();
const threadConversationIndex = new Map<string, string>();
const conversationThreadIndex = new Map<string, number>();
const telegramPollStateByToken = new Map<string, TelegramPollState>();
const seenTelegramUpdateIds: number[] = [];
const seenTelegramUpdateSet = new Set<number>();

// Persistent topic index — survives gateway restarts.
// Keyed by conversationId, value is { chatId, threadId }.
type PersistedTopicEntry = { chatId: string; threadId: number };
const TOPIC_INDEX_PATH = path.join(os.homedir(), ".openclaw", "website-assist-topic-index.json");
let topicIndexLoadPromise: Promise<void> | null = null;

function ensureTopicIndexLoaded(): Promise<void> {
  if (!topicIndexLoadPromise) {
    topicIndexLoadPromise = (async () => {
      try {
        const raw = await fs.readFile(TOPIC_INDEX_PATH, "utf-8");
        const data = JSON.parse(raw) as Record<string, PersistedTopicEntry>;
        if (data && typeof data === "object") {
          for (const [conversationId, entry] of Object.entries(data)) {
            if (
              entry &&
              typeof entry.chatId === "string" &&
              typeof entry.threadId === "number" &&
              Number.isFinite(entry.threadId)
            ) {
              conversationThreadIndex.set(conversationId, entry.threadId);
              threadConversationIndex.set(threadKey(entry.chatId, entry.threadId), conversationId);
            }
          }
        }
      } catch {
        // File doesn't exist yet or is invalid — start fresh.
      }
    })();
  }
  return topicIndexLoadPromise;
}

async function persistTopicIndex(): Promise<void> {
  try {
    const dir = path.dirname(TOPIC_INDEX_PATH);
    await fs.mkdir(dir, { recursive: true });
    const data: Record<string, PersistedTopicEntry> = {};
    // Rebuild from threadConversationIndex so we have both chatId and threadId.
    for (const [key, conversationId] of threadConversationIndex) {
      const colonIdx = key.lastIndexOf(":");
      if (colonIdx === -1) {
        continue;
      }
      const chatId = key.slice(0, colonIdx);
      const threadIdRaw = Number.parseInt(key.slice(colonIdx + 1), 10);
      if (chatId && Number.isFinite(threadIdRaw)) {
        data[conversationId] = { chatId, threadId: threadIdRaw };
      }
    }
    await fs.writeFile(TOPIC_INDEX_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Non-fatal — will retry on next write.
  }
}

function getLocalIpAddresses(): string[] {
  const addresses: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    if (!iface) {
      continue;
    }
    for (const entry of iface) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function buildSessionStartMessage(params: {
  nodeTag: string;
  conversationId: string;
  sourceUrl: string;
  visitorId: string;
  nodeId: string;
}): string {
  const ips = getLocalIpAddresses();
  const hostname = os.hostname();
  const lines = [
    "Session started",
    `Node: ${params.nodeTag}`,
    `Conversation: ${params.conversationId}`,
    params.nodeId ? `Source node: ${params.nodeId}` : "",
    params.sourceUrl ? `Page: ${params.sourceUrl}` : "",
    params.visitorId ? `Visitor: ${params.visitorId}` : "",
    `Gateway: ${hostname}${ips.length > 0 ? ` (${ips.join(", ")})` : ""}`,
    `Started: ${GATEWAY_STARTED_AT.toISOString()}`,
    `Session at: ${new Date().toISOString()}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-OpenClaw-Relay-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
  }
  res.end(JSON.stringify(body));
}

function readHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }
  return String(value ?? "").trim();
}

async function readJsonBody(req: IncomingMessage): Promise<WebsiteAssistRequestBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }
  const parsed = JSON.parse(raw) as WebsiteAssistRequestBody;
  return parsed && typeof parsed === "object" ? parsed : {};
}

function asNonEmptyString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function resolveConversationId(raw: unknown, fallbackPrefix: string): string {
  const value = asNonEmptyString(raw);
  if (value) {
    return value.slice(0, 120);
  }
  return `${fallbackPrefix}:${randomUUID()}`;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
    );
  }
  return false;
}

function envNonEmpty(...keys: string[]): string {
  for (const key of keys) {
    const value = asNonEmptyString(process.env[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function envBoolean(...keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (!(key in process.env)) {
      continue;
    }
    return isTruthy(process.env[key]);
  }
  return undefined;
}

function resolveWebsiteAssistConfig(raw: WebsiteAssistConfig): WebsiteAssistConfig {
  const botToken =
    asNonEmptyString(raw.botToken) ||
    envNonEmpty("OPENCLAW_WEBSITE_ASSIST_BOT_TOKEN", "WEBSITE_ASSIST_BOT_TOKEN");
  const telegramTo =
    asNonEmptyString(raw.telegramTo) ||
    envNonEmpty("OPENCLAW_WEBSITE_ASSIST_TELEGRAM_TO", "WEBSITE_ASSIST_TELEGRAM_TO");
  const relayKey =
    asNonEmptyString(raw.relayKey) ||
    envNonEmpty("OPENCLAW_WEBSITE_ASSIST_RELAY_KEY", "WEBSITE_ASSIST_RELAY_KEY");
  const nodeTag =
    asNonEmptyString(raw.nodeTag) ||
    envNonEmpty("OPENCLAW_WEBSITE_ASSIST_NODE_TAG", "WEBSITE_ASSIST_NODE_TAG") ||
    "website-assist";
  const topicPrefix =
    asNonEmptyString(raw.topicPrefix) ||
    envNonEmpty("OPENCLAW_WEBSITE_ASSIST_TOPIC_PREFIX", "WEBSITE_ASSIST_TOPIC_PREFIX") ||
    "assist";

  const autoTopicEnv = envBoolean(
    "OPENCLAW_WEBSITE_ASSIST_AUTO_TOPIC",
    "WEBSITE_ASSIST_AUTO_TOPIC",
  );
  const autoTopic = typeof raw.autoTopic === "boolean" ? raw.autoTopic : autoTopicEnv === true;

  const enabledEnv = envBoolean("OPENCLAW_WEBSITE_ASSIST_ENABLED", "WEBSITE_ASSIST_ENABLED");
  const enabled =
    typeof raw.enabled === "boolean"
      ? raw.enabled
      : typeof enabledEnv === "boolean"
        ? enabledEnv
        : Boolean(botToken && telegramTo);

  return {
    enabled,
    botToken,
    telegramTo,
    relayKey,
    nodeTag,
    autoTopic,
    topicPrefix,
  };
}

function getConversation(id: string): WebsiteAssistConversation {
  let convo = conversations.get(id);
  if (!convo) {
    convo = { messages: [] };
    conversations.set(id, convo);
  }
  return convo;
}

function sentMessageKey(chatId: string, messageId: number | string): string {
  return `${chatId}:${String(messageId)}`;
}

function threadKey(chatId: string, threadId: number): string {
  return `${chatId}:${threadId}`;
}

function rememberSentMessage(chatId: string, messageId: number | string, conversationId: string) {
  const key = sentMessageKey(chatId, messageId);
  if (sentMessageConversationIndex.has(key)) {
    sentMessageConversationIndex.delete(key);
  }
  sentMessageConversationIndex.set(key, conversationId);
  if (sentMessageConversationIndex.size > MAX_TRACKED_SENT_MESSAGES) {
    const removeCount = sentMessageConversationIndex.size - MAX_TRACKED_SENT_MESSAGES;
    let removed = 0;
    for (const firstKey of sentMessageConversationIndex.keys()) {
      sentMessageConversationIndex.delete(firstKey);
      removed += 1;
      if (removed >= removeCount) {
        break;
      }
    }
  }
}

function rememberSeenUpdate(updateId: number) {
  if (seenTelegramUpdateSet.has(updateId)) {
    return;
  }
  seenTelegramUpdateSet.add(updateId);
  seenTelegramUpdateIds.push(updateId);
  if (seenTelegramUpdateIds.length > MAX_TRACKED_UPDATES) {
    const removeCount = seenTelegramUpdateIds.length - MAX_TRACKED_UPDATES;
    const removed = seenTelegramUpdateIds.splice(0, removeCount);
    for (const oldId of removed) {
      seenTelegramUpdateSet.delete(oldId);
    }
  }
}

async function telegramApiPost<T>(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as { ok?: boolean; description?: string; result?: T };
  if (!response.ok || json.ok !== true) {
    throw new Error(String(json.description ?? `Telegram API ${method} failed`));
  }
  return json.result as T;
}

type CreateForumTopicResult = { threadId: number; isNew: boolean };

async function createForumTopicIfEnabled(params: {
  assistCfg: WebsiteAssistConfig;
  botToken: string;
  target: string;
  conversationId: string;
}): Promise<CreateForumTopicResult | undefined> {
  if (!isTruthy(params.assistCfg.autoTopic)) {
    return undefined;
  }
  if (!/^-100\d+$/.test(params.target)) {
    return undefined;
  }
  await ensureTopicIndexLoaded();
  const existingThreadId = conversationThreadIndex.get(params.conversationId);
  if (typeof existingThreadId === "number") {
    return { threadId: existingThreadId, isNew: false };
  }
  const prefix = asNonEmptyString(params.assistCfg.topicPrefix) || "assist";
  const topicName = `${prefix}-${params.conversationId.slice(-8)}`;
  try {
    const created = await telegramApiPost<{ message_thread_id?: number }>(
      params.botToken,
      "createForumTopic",
      {
        chat_id: params.target,
        name: topicName,
      },
    );
    const threadId = created?.message_thread_id;
    if (typeof threadId === "number" && Number.isFinite(threadId)) {
      conversationThreadIndex.set(params.conversationId, threadId);
      threadConversationIndex.set(threadKey(params.target, threadId), params.conversationId);
      await persistTopicIndex();
      return { threadId, isNew: true };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function pollTelegramReplies(botToken: string): Promise<void> {
  const now = Date.now();
  const state = telegramPollStateByToken.get(botToken) ?? { offset: 0, lastPollAt: 0 };
  if (now - state.lastPollAt < TELEGRAM_REPLY_POLL_INTERVAL_MS) {
    return;
  }
  state.lastPollAt = now;
  telegramPollStateByToken.set(botToken, state);

  let updates: TelegramUpdate[] = [];
  try {
    updates = await telegramApiPost<TelegramUpdate[]>(botToken, "getUpdates", {
      offset: state.offset,
      timeout: 0,
      allowed_updates: ["message"],
    });
  } catch {
    return;
  }

  for (const update of updates) {
    const updateId = update.update_id;
    if (typeof updateId === "number" && Number.isFinite(updateId)) {
      if (seenTelegramUpdateSet.has(updateId)) {
        continue;
      }
      rememberSeenUpdate(updateId);
      state.offset = Math.max(state.offset, updateId + 1);
    }

    const message = update.message;
    if (!message || message.from?.is_bot) {
      continue;
    }
    const chatId = asNonEmptyString(message.chat?.id);
    if (!chatId) {
      continue;
    }

    let conversationId = "";
    const replyToMessageId = message.reply_to_message?.message_id;
    if (typeof replyToMessageId === "number" && Number.isFinite(replyToMessageId)) {
      conversationId =
        sentMessageConversationIndex.get(sentMessageKey(chatId, replyToMessageId)) ?? "";
    }
    if (!conversationId) {
      const threadId = message.message_thread_id;
      if (typeof threadId === "number" && Number.isFinite(threadId)) {
        conversationId = threadConversationIndex.get(threadKey(chatId, threadId)) ?? "";
      }
    }
    if (!conversationId) {
      continue;
    }

    const text = asNonEmptyString(message.text) || asNonEmptyString(message.caption);
    if (!text) {
      continue;
    }
    appendConversationMessage(conversationId, "assistant", text, "telegram");

    const messageId = message.message_id;
    if (typeof messageId === "number" && Number.isFinite(messageId)) {
      rememberSentMessage(chatId, messageId, conversationId);
    }
    const threadId = message.message_thread_id;
    if (typeof threadId === "number" && Number.isFinite(threadId)) {
      threadConversationIndex.set(threadKey(chatId, threadId), conversationId);
    }
  }
}

function appendConversationMessage(
  conversationId: string,
  role: "user" | "assistant",
  text: string,
  source: "website" | "telegram" | "api",
) {
  const convo = getConversation(conversationId);
  convo.messages.push({
    id: randomUUID(),
    role,
    text,
    source,
    createdAt: Date.now(),
  });
  if (convo.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    convo.messages.splice(0, convo.messages.length - MAX_MESSAGES_PER_CONVERSATION);
  }
}

function resolveRelayKeyFromRequest(body: WebsiteAssistRequestBody, req: IncomingMessage): string {
  return asNonEmptyString(body.relayKey) || readHeader(req, "x-openclaw-relay-key") || "";
}

function enforceRelayKey(
  req: IncomingMessage,
  body: WebsiteAssistRequestBody,
  configuredRelayKey: string,
): { ok: true } | { ok: false; error: string } {
  if (!configuredRelayKey) {
    return { ok: true };
  }
  const providedKey = resolveRelayKeyFromRequest(body, req);
  if (!providedKey || providedKey !== configuredRelayKey) {
    return { ok: false, error: "Invalid relay key." };
  }
  return { ok: true };
}

function buildRelayMessage(params: {
  text: string;
  nodeTag: string;
  sourceUrl: string;
  visitorId: string;
  nodeId: string;
  conversationId: string;
}) {
  const lines = [
    "Website assist request",
    `Node: ${params.nodeTag}`,
    `Conversation: ${params.conversationId}`,
    params.nodeId ? `Source node: ${params.nodeId}` : "",
    params.sourceUrl ? `Page: ${params.sourceUrl}` : "",
    params.visitorId ? `Visitor: ${params.visitorId}` : "",
    "",
    params.text,
  ].filter(Boolean);
  return lines.join("\n");
}

function sanitizeMediaFileName(raw: string, fallbackExt: string): string {
  const base = raw.trim().split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (cleaned.length >= 3) {
    return cleaned;
  }
  return `upload-${Date.now()}${fallbackExt}`;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "video/mp4":
      return ".mp4";
    default:
      return ".bin";
  }
}

function decodeMediaDataUrl(raw: unknown): { buffer: Buffer; mimeType: string } | null {
  const value = asNonEmptyString(raw);
  if (!value) {
    return null;
  }
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value);
  if (!match) {
    return null;
  }
  const mimeType = asNonEmptyString(match[1]).toLowerCase();
  const payload = match[2] ?? "";
  const buffer = Buffer.from(payload, "base64");
  if (!mimeType || !buffer.length) {
    return null;
  }
  return { buffer, mimeType };
}

async function persistWebsiteAssistMedia(params: {
  mediaBuffer: Buffer;
  mimeType: string;
  requestedFileName: string;
}): Promise<string> {
  const mediaRoot = path.join(os.homedir(), ".openclaw", "media", "website-assist");
  await fs.mkdir(mediaRoot, { recursive: true });
  const ext = extensionForMimeType(params.mimeType);
  const preferred = sanitizeMediaFileName(params.requestedFileName, ext);
  const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}-${preferred}`;
  const filePath = path.join(mediaRoot, uniqueName);
  await fs.writeFile(filePath, params.mediaBuffer);
  return filePath;
}

async function handleMessagesGet(
  url: URL,
  res: ServerResponse,
  assistCfg: WebsiteAssistConfig,
): Promise<boolean> {
  const conversationId = asNonEmptyString(url.searchParams.get("conversationId"));
  if (!conversationId) {
    sendJson(res, 400, { ok: false, error: "Missing conversationId query parameter." });
    return true;
  }
  if (isTruthy(url.searchParams.get("poll"))) {
    const botToken = asNonEmptyString(assistCfg.botToken);
    if (botToken) {
      await pollTelegramReplies(botToken);
    }
  }
  const afterRaw = url.searchParams.get("after");
  const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
  const safeAfter = Number.isFinite(after) && after >= 0 ? after : 0;
  const convo = getConversation(conversationId);
  const messages = convo.messages.slice(safeAfter);
  sendJson(res, 200, {
    ok: true,
    conversationId,
    nextCursor: convo.messages.length,
    messages,
  });
  return true;
}

function handleReplyPost(
  req: IncomingMessage,
  res: ServerResponse,
  body: WebsiteAssistRequestBody,
  configuredRelayKey: string,
): boolean {
  const relayKeyCheck = enforceRelayKey(req, body, configuredRelayKey);
  if (!relayKeyCheck.ok) {
    sendJson(res, 401, { ok: false, error: relayKeyCheck.error });
    return true;
  }
  const text = asNonEmptyString(body.text);
  if (!text) {
    sendJson(res, 400, { ok: false, error: "Missing text." });
    return true;
  }
  const conversationId = asNonEmptyString(body.conversationId);
  if (!conversationId) {
    sendJson(res, 400, { ok: false, error: "Missing conversationId." });
    return true;
  }
  appendConversationMessage(conversationId, "assistant", text, "telegram");
  sendJson(res, 200, { ok: true, status: "queued", conversationId });
  return true;
}

async function handleTelegramPost(
  req: IncomingMessage,
  res: ServerResponse,
  body: WebsiteAssistRequestBody,
  assistCfg: WebsiteAssistConfig,
): Promise<boolean> {
  const relayKeyCheck = enforceRelayKey(req, body, asNonEmptyString(assistCfg.relayKey));
  if (!relayKeyCheck.ok) {
    sendJson(res, 401, { ok: false, error: relayKeyCheck.error });
    return true;
  }

  const text = asNonEmptyString(body.text);
  if (!text) {
    sendJson(res, 400, { ok: false, error: "Missing text." });
    return true;
  }

  const target = asNonEmptyString(body.to) || asNonEmptyString(assistCfg.telegramTo);
  if (!target) {
    sendJson(res, 400, {
      ok: false,
      error: "Missing telegram target. Set channels.websiteassist.telegramTo or send { to }.",
    });
    return true;
  }
  const botToken = asNonEmptyString(assistCfg.botToken);
  if (!botToken) {
    sendJson(res, 400, {
      ok: false,
      error: "Missing bot token. Set channels.websiteassist.botToken.",
    });
    return true;
  }

  const conversationId = resolveConversationId(
    body.conversationId,
    asNonEmptyString(body.visitorId) || "website",
  );
  appendConversationMessage(conversationId, "user", text, "website");

  const nodeTag = asNonEmptyString(assistCfg.nodeTag) || "website-assist";
  const sourceUrl = asNonEmptyString(body.sourceUrl);
  const visitorId = asNonEmptyString(body.visitorId);
  const nodeId = asNonEmptyString(body.nodeId);
  const topicResult = await createForumTopicIfEnabled({
    assistCfg,
    botToken,
    target,
    conversationId,
  });
  const messageThreadId = topicResult?.threadId;

  if (topicResult?.isNew) {
    try {
      await sendMessageTelegram(
        target,
        buildSessionStartMessage({ nodeTag, conversationId, sourceUrl, visitorId, nodeId }),
        { token: botToken, messageThreadId },
      );
    } catch {
      // Non-fatal — best effort.
    }
  }

  const relayMessage = buildRelayMessage({
    text,
    nodeTag,
    sourceUrl,
    visitorId,
    nodeId,
    conversationId,
  });

  try {
    const sent = await sendMessageTelegram(target, relayMessage, {
      token: botToken,
      ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
    });
    const sentChatId = asNonEmptyString(sent.chatId);
    const sentMessageIdRaw = Number.parseInt(String(sent.messageId), 10);
    if (sentChatId && Number.isFinite(sentMessageIdRaw)) {
      rememberSentMessage(sentChatId, sentMessageIdRaw, conversationId);
      if (typeof messageThreadId === "number") {
        threadConversationIndex.set(threadKey(sentChatId, messageThreadId), conversationId);
      }
    }
    sendJson(res, 200, {
      ok: true,
      status: "forwarded",
      conversationId,
      telegram: {
        chatId: sent.chatId,
        messageId: sent.messageId,
      },
    });
    return true;
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      error: `Telegram forward failed: ${String(err)}`,
    });
    return true;
  }
}

async function handleMediaPost(
  req: IncomingMessage,
  res: ServerResponse,
  body: WebsiteAssistRequestBody,
  assistCfg: WebsiteAssistConfig,
): Promise<boolean> {
  const relayKeyCheck = enforceRelayKey(req, body, asNonEmptyString(assistCfg.relayKey));
  if (!relayKeyCheck.ok) {
    sendJson(res, 401, { ok: false, error: relayKeyCheck.error });
    return true;
  }

  const target = asNonEmptyString(body.to) || asNonEmptyString(assistCfg.telegramTo);
  if (!target) {
    sendJson(res, 400, {
      ok: false,
      error: "Missing telegram target. Set channels.websiteassist.telegramTo or send { to }.",
    });
    return true;
  }

  const botToken = asNonEmptyString(assistCfg.botToken);
  if (!botToken) {
    sendJson(res, 400, {
      ok: false,
      error: "Missing bot token. Set channels.websiteassist.botToken.",
    });
    return true;
  }

  const decoded = decodeMediaDataUrl(body.mediaDataUrl);
  if (!decoded) {
    sendJson(res, 400, { ok: false, error: "Missing or invalid mediaDataUrl." });
    return true;
  }
  if (decoded.buffer.length > MAX_MEDIA_BYTES) {
    sendJson(res, 413, {
      ok: false,
      error: `Media too large (max ${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))}MB).`,
    });
    return true;
  }

  const conversationId = resolveConversationId(
    body.conversationId,
    asNonEmptyString(body.visitorId) || "website",
  );
  const text = asNonEmptyString(body.text);
  const displayFileName = sanitizeMediaFileName(
    asNonEmptyString(body.mediaFileName) || "upload",
    extensionForMimeType(decoded.mimeType),
  );
  const localMediaText = text
    ? `[media] ${displayFileName}\n${text}`
    : `[media] ${displayFileName}`;
  appendConversationMessage(conversationId, "user", localMediaText, "website");

  const filePath = await persistWebsiteAssistMedia({
    mediaBuffer: decoded.buffer,
    mimeType: decoded.mimeType,
    requestedFileName: displayFileName,
  });
  const nodeTag = asNonEmptyString(assistCfg.nodeTag) || "website-assist";
  const sourceUrl = asNonEmptyString(body.sourceUrl);
  const visitorId = asNonEmptyString(body.visitorId);
  const nodeId = asNonEmptyString(body.nodeId);
  const topicResult = await createForumTopicIfEnabled({
    assistCfg,
    botToken,
    target,
    conversationId,
  });
  const messageThreadId = topicResult?.threadId;

  if (topicResult?.isNew) {
    try {
      await sendMessageTelegram(
        target,
        buildSessionStartMessage({ nodeTag, conversationId, sourceUrl, visitorId, nodeId }),
        { token: botToken, messageThreadId },
      );
    } catch {
      // Non-fatal — best effort.
    }
  }

  const captionText = text || `Media from ${nodeTag}`;
  const relayMessage = buildRelayMessage({
    text: captionText,
    nodeTag,
    sourceUrl,
    visitorId,
    nodeId,
    conversationId,
  });

  try {
    const sent = await sendMessageTelegram(target, relayMessage, {
      token: botToken,
      mediaUrl: filePath,
      ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
    });
    const sentChatId = asNonEmptyString(sent.chatId);
    const sentMessageIdRaw = Number.parseInt(String(sent.messageId), 10);
    if (sentChatId && Number.isFinite(sentMessageIdRaw)) {
      rememberSentMessage(sentChatId, sentMessageIdRaw, conversationId);
      if (typeof messageThreadId === "number") {
        threadConversationIndex.set(threadKey(sentChatId, messageThreadId), conversationId);
      }
    }
    sendJson(res, 200, {
      ok: true,
      status: "forwarded",
      conversationId,
      telegram: {
        chatId: sent.chatId,
        messageId: sent.messageId,
      },
    });
    return true;
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      error: `Telegram media forward failed: ${String(err)}`,
    });
    return true;
  }
}

export async function handleWebsiteAssistTelegramHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (
    url.pathname !== "/api/website-assist/telegram" &&
    url.pathname !== "/api/website-assist/media" &&
    url.pathname !== "/api/website-assist/reply" &&
    url.pathname !== "/api/website-assist/messages"
  ) {
    return false;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204, { ok: true });
    return true;
  }

  const config = loadConfig();
  const assistCfg = resolveWebsiteAssistConfig(
    (config.channels?.websiteassist ?? {}) as WebsiteAssistConfig,
  );
  if (assistCfg.enabled !== true) {
    sendJson(res, 403, { ok: false, error: "Website assist relay is disabled." });
    return true;
  }

  if (url.pathname === "/api/website-assist/messages") {
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: "Method not allowed. Use GET." });
      return true;
    }
    return await handleMessagesGet(url, res, assistCfg);
  }

  let body: WebsiteAssistRequestBody = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
    return true;
  }

  if (url.pathname === "/api/website-assist/reply") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
      return true;
    }
    return handleReplyPost(req, res, body, asNonEmptyString(assistCfg.relayKey));
  }

  if (url.pathname === "/api/website-assist/media") {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
      return true;
    }
    return await handleMediaPost(req, res, body, assistCfg);
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
    return true;
  }
  return await handleTelegramPost(req, res, body, assistCfg);
}
