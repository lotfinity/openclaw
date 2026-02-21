import type { AnyMessageContent } from "@whiskeysockets/baileys";
import WebSocket from "ws";
import type { ActiveWebListener } from "../active-listener.js";
import type { WebInboundMessage, WebListenerCloseReason } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { getChildLogger } from "../../logging/logger.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { saveMediaBuffer } from "../../media/store.js";
import { normalizeE164 } from "../../utils.js";
import { resolveWhatsAppAccount } from "../accounts.js";
import {
  sendMediaViaWaha,
  sendPollViaWaha,
  sendReactionViaWaha,
  sendTextViaWaha,
} from "../transports/waha/client.js";
import { buildWahaWsCandidates, connectWahaWebSocket } from "../transports/waha/ws.js";
import { checkInboundAccessControl } from "./access-control.js";
import { isRecentInboundMessage } from "./dedupe.js";

type WahaEventEnvelope = {
  event?: string;
  payload?: Record<string, unknown>;
  session?: string;
  engine?: string;
};

function toNormalizedDirectId(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith("@c.us")) {
    return normalizeE164(trimmed.slice(0, -"@c.us".length));
  }
  if (trimmed.endsWith("@s.whatsapp.net")) {
    return normalizeE164(trimmed.slice(0, -"@s.whatsapp.net".length));
  }
  return normalizeE164(trimmed);
}

function resolveChatKind(chatId: string): "group" | "direct" {
  return chatId.toLowerCase().endsWith("@g.us") ? "group" : "direct";
}

function readString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input : undefined;
}

function readNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeTimestampMs(value: unknown): number | undefined {
  const parsed = readNumber(value);
  if (!parsed) {
    return undefined;
  }
  if (parsed > 1_000_000_000_000) {
    return parsed;
  }
  return parsed * 1000;
}

async function maybeLoadWahaMedia(
  payload: Record<string, unknown>,
  maxMb: number,
  apiKey?: string,
) {
  const media = payload.media as Record<string, unknown> | undefined;
  const mimetype = readString(media?.mimetype) ?? readString(payload.mimetype);
  const fileName = readString(media?.filename) ?? readString(payload.filename);
  const dataBase64 = readString(media?.data) ?? readString(payload.data);
  let buffer: Buffer | null = null;
  if (dataBase64) {
    try {
      buffer = Buffer.from(dataBase64, "base64");
    } catch {
      buffer = null;
    }
  } else {
    const mediaUrl = readString(media?.url) ?? readString(payload.mediaUrl);
    if (mediaUrl) {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["X-Api-Key"] = apiKey;
      }
      const response = await fetch(mediaUrl, { headers });
      if (response.ok) {
        const arr = await response.arrayBuffer();
        buffer = Buffer.from(arr);
      }
    }
  }
  if (!buffer) {
    return null;
  }
  const saved = await saveMediaBuffer(buffer, mimetype, "inbound", maxMb * 1024 * 1024, fileName);
  return {
    mediaPath: saved.path,
    mediaType: mimetype,
    mediaFileName: fileName,
  };
}

export async function monitorWahaInbox(options: {
  verbose: boolean;
  accountId: string;
  authDir: string;
  onMessage: (msg: WebInboundMessage) => Promise<void>;
  mediaMaxMb?: number;
  sendReadReceipts?: boolean;
  debounceMs?: number;
  shouldDebounce?: (msg: WebInboundMessage) => boolean;
}) {
  const cfg = loadConfig();
  const account = resolveWhatsAppAccount({ cfg, accountId: options.accountId });
  const baseUrl = account.waha?.baseUrl?.trim();
  if (!baseUrl) {
    throw new Error(
      `WAHA transport selected for account "${account.accountId}" but channels.whatsapp.waha.baseUrl is missing.`,
    );
  }

  const apiKey = account.waha?.apiKey?.trim() || undefined;
  const session = account.waha?.session?.trim() || "default";

  const inboundLogger = getChildLogger({ module: "waha-inbound", accountId: account.accountId });
  const inboundConsoleLog = createSubsystemLogger("gateway/channels/whatsapp").child("inbound");

  let onCloseResolve: ((reason: WebListenerCloseReason) => void) | null = null;
  const onClose = new Promise<WebListenerCloseReason>((resolve) => {
    onCloseResolve = resolve;
  });
  const resolveClose = (reason: WebListenerCloseReason) => {
    if (!onCloseResolve) {
      return;
    }
    const resolver = onCloseResolve;
    onCloseResolve = null;
    resolver(reason);
  };

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  const ws = await connectWahaWebSocket(buildWahaWsCandidates(baseUrl), {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    queryParams: [
      ["session", session],
      ["events", "message"],
      ["events", "session.status"],
      ...(apiKey ? ([["x-api-key", apiKey]] as Array<[string, string]>) : []),
    ],
  });
  ws.on("error", (err) => {
    inboundLogger.error({ error: String(err) }, "WAHA websocket error");
  });

  ws.on("close", (code) => {
    resolveClose({ status: code, isLoggedOut: false, error: `waha websocket closed (${code})` });
  });

  ws.on("message", async (data) => {
    let eventEnvelope: WahaEventEnvelope | null = null;
    try {
      eventEnvelope = JSON.parse(String(data)) as WahaEventEnvelope;
    } catch {
      return;
    }
    if (!eventEnvelope || typeof eventEnvelope !== "object") {
      return;
    }
    if (eventEnvelope.event === "session.status") {
      const status = readString(eventEnvelope.payload?.status);
      if (status && (status.toUpperCase() === "FAILED" || status.toUpperCase() === "STOPPED")) {
        resolveClose({
          status: 499,
          isLoggedOut: false,
          error: `waha session status ${status}`,
        });
      }
      return;
    }
    if (eventEnvelope.event !== "message") {
      return;
    }
    const payload = eventEnvelope.payload ?? {};
    const id =
      readString(payload.id) ?? readString((payload.id as { _serialized?: string })?._serialized);
    const chatId = readString(payload.chatId) ?? readString(payload.from) ?? readString(payload.to);
    if (!chatId) {
      return;
    }
    const isGroup = resolveChatKind(chatId) === "group";
    const fromMe = Boolean(payload.fromMe);
    const body = readString(payload.body) ?? readString(payload.text) ?? "";
    const participant = readString(payload.participant) ?? readString(payload.author);
    const senderE164 = participant
      ? toNormalizedDirectId(participant)
      : isGroup
        ? null
        : toNormalizedDirectId(chatId);
    const from = isGroup ? chatId : (toNormalizedDirectId(chatId) ?? chatId);

    if (id) {
      const dedupeKey = `${account.accountId}:${chatId}:${id}`;
      if (isRecentInboundMessage(dedupeKey)) {
        return;
      }
    }

    const access = await checkInboundAccessControl({
      accountId: account.accountId,
      from,
      selfE164: null,
      senderE164,
      group: isGroup,
      pushName: readString(payload.notifyName) ?? readString(payload.pushName),
      isFromMe: fromMe,
      messageTimestampMs: normalizeTimestampMs(payload.timestamp),
      connectedAtMs: Date.now() - 5000,
      sock: {
        sendMessage: async (jid, content) => {
          const text = readString((content as { text?: unknown }).text);
          if (text) {
            await sendTextViaWaha(account, jid, text);
          }
        },
      },
      remoteJid: chatId,
    });
    if (!access.allowed) {
      return;
    }

    const messageBody = body || "<media>";
    const maxMb =
      typeof options.mediaMaxMb === "number" && options.mediaMaxMb > 0 ? options.mediaMaxMb : 50;
    let media: { mediaPath?: string; mediaType?: string; mediaFileName?: string } | null = null;
    try {
      if (Boolean(payload.hasMedia) || payload.media) {
        media = await maybeLoadWahaMedia(payload, maxMb, apiKey);
      }
    } catch (err) {
      inboundLogger.warn({ error: String(err) }, "failed loading WAHA media");
    }

    const reply = async (text: string) => {
      await sendTextViaWaha(account, chatId, text);
    };
    const sendMedia = async (content: AnyMessageContent) => {
      if ((content as { text?: string }).text) {
        await sendTextViaWaha(account, chatId, String((content as { text?: string }).text));
        return;
      }
      if ((content as { image?: Buffer; caption?: string; mimetype?: string }).image) {
        const payload = content as { image: Buffer; caption?: string; mimetype?: string };
        await sendMediaViaWaha(
          account,
          chatId,
          payload.caption ?? "",
          payload.image,
          payload.mimetype ?? "image/jpeg",
          "image",
        );
        return;
      }
      if ((content as { video?: Buffer; caption?: string; mimetype?: string }).video) {
        const payload = content as { video: Buffer; caption?: string; mimetype?: string };
        await sendMediaViaWaha(
          account,
          chatId,
          payload.caption ?? "",
          payload.video,
          payload.mimetype ?? "video/mp4",
          "video",
        );
        return;
      }
      if ((content as { audio?: Buffer; mimetype?: string }).audio) {
        const payload = content as { audio: Buffer; mimetype?: string };
        await sendMediaViaWaha(
          account,
          chatId,
          "",
          payload.audio,
          payload.mimetype ?? "audio/ogg; codecs=opus",
          "audio",
        );
        return;
      }
      if (
        (content as { document?: Buffer; caption?: string; mimetype?: string; fileName?: string })
          .document
      ) {
        const payload = content as {
          document: Buffer;
          caption?: string;
          mimetype?: string;
          fileName?: string;
        };
        await sendMediaViaWaha(
          account,
          chatId,
          payload.caption ?? "",
          payload.document,
          payload.mimetype ?? "application/octet-stream",
          payload.fileName ?? "file",
        );
      }
    };

    const inboundMessage: WebInboundMessage = {
      id: id ?? undefined,
      from,
      conversationId: from,
      to: "me",
      accountId: access.resolvedAccountId,
      body: messageBody,
      pushName: readString(payload.notifyName) ?? readString(payload.pushName),
      timestamp: normalizeTimestampMs(payload.timestamp),
      chatType: isGroup ? "group" : "direct",
      chatId,
      senderJid: participant,
      senderE164: senderE164 ?? undefined,
      senderName: readString(payload.notifyName) ?? readString(payload.pushName),
      sendComposing: async () => undefined,
      reply,
      sendMedia,
      mediaPath: media?.mediaPath,
      mediaType: media?.mediaType,
      mediaFileName: media?.mediaFileName,
    };
    try {
      await options.onMessage(inboundMessage);
    } catch (err) {
      inboundLogger.error({ error: String(err) }, "failed handling inbound WAHA message");
      inboundConsoleLog.error(`Failed handling inbound WAHA message: ${String(err)}`);
    }
  });

  const listener: ActiveWebListener & {
    onClose: Promise<WebListenerCloseReason>;
    signalClose: (reason?: WebListenerCloseReason) => void;
  } = {
    close: async () => {
      try {
        ws.removeAllListeners();
        ws.close();
      } catch {
        // ignore
      }
    },
    onClose,
    signalClose: (reason?: WebListenerCloseReason) => {
      resolveClose(reason ?? { status: undefined, isLoggedOut: false, error: "closed" });
    },
    sendMessage: async (
      to: string,
      text: string,
      mediaBuffer?: Buffer,
      mediaType?: string,
      sendOptions?: { fileName?: string },
    ) => {
      const result =
        mediaBuffer && mediaType
          ? await sendMediaViaWaha(account, to, text, mediaBuffer, mediaType, sendOptions?.fileName)
          : await sendTextViaWaha(account, to, text);
      return { messageId: result.messageId };
    },
    sendPoll: async (
      to: string,
      poll: { question: string; options: string[]; maxSelections?: number },
    ) => {
      const result = await sendPollViaWaha(account, to, poll);
      return { messageId: result.messageId };
    },
    sendReaction: async (chatJid: string, messageId: string, emoji: string) => {
      void chatJid;
      await sendReactionViaWaha(account, messageId, emoji);
    },
    sendComposingTo: async () => undefined,
  };

  return listener;
}
