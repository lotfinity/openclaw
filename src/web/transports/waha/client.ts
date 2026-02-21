import type { ResolvedWhatsAppAccount } from "../../accounts.js";
import { toWhatsappJid } from "../../../utils.js";

type WahaMessageResult = {
  messageId: string;
};

type WahaRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

type WahaEndpoint = {
  baseUrl: string;
  apiKey?: string;
  session: string;
};

function resolveWahaEndpoint(account: ResolvedWhatsAppAccount): WahaEndpoint {
  const baseUrl = account.waha?.baseUrl?.trim();
  if (!baseUrl) {
    throw new Error(
      `WAHA transport selected for account "${account.accountId}" but channels.whatsapp.waha.baseUrl is missing.`,
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey: account.waha?.apiKey?.trim() || undefined,
    session: account.waha?.session?.trim() || "default",
  };
}

function toWahaChatId(to: string): string {
  const jid = toWhatsappJid(to);
  if (jid.endsWith("@s.whatsapp.net")) {
    return `${jid.slice(0, -"@s.whatsapp.net".length)}@c.us`;
  }
  return jid;
}

function joinUrl(baseUrl: string, path: string): string {
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanedPath}`;
}

function pickMessageId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "unknown";
  }
  const directCandidates = [
    (payload as { id?: unknown }).id,
    (payload as { messageId?: unknown }).messageId,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  const nested = (payload as { id?: { _serialized?: unknown } }).id?._serialized;
  if (typeof nested === "string" && nested.trim()) {
    return nested;
  }
  return "unknown";
}

async function wahaRequest(
  account: ResolvedWhatsAppAccount,
  path: string,
  opts: WahaRequestOptions,
) {
  const endpoint = resolveWahaEndpoint(account);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (endpoint.apiKey) {
    headers["X-Api-Key"] = endpoint.apiKey;
  }
  const response = await fetch(joinUrl(endpoint.baseUrl, path), {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    const suffix = detail.trim() ? ` ${detail.trim()}` : "";
    throw new Error(`WAHA request failed (${response.status} ${response.statusText})${suffix}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function sendTextViaWaha(
  account: ResolvedWhatsAppAccount,
  to: string,
  text: string,
): Promise<WahaMessageResult> {
  const endpoint = resolveWahaEndpoint(account);
  const payload = await wahaRequest(account, "/api/sendText", {
    method: "POST",
    body: {
      session: endpoint.session,
      chatId: toWahaChatId(to),
      text,
    },
  });
  return { messageId: pickMessageId(payload) };
}

export async function sendMediaViaWaha(
  account: ResolvedWhatsAppAccount,
  to: string,
  text: string,
  mediaBuffer: Buffer,
  mediaType: string,
  fileName?: string,
): Promise<WahaMessageResult> {
  const endpoint = resolveWahaEndpoint(account);
  const chatId = toWahaChatId(to);
  const file = {
    mimetype: mediaType,
    filename: fileName ?? "file",
    data: mediaBuffer.toString("base64"),
  };
  if (mediaType.startsWith("image/")) {
    const payload = await wahaRequest(account, "/api/sendImage", {
      method: "POST",
      body: { session: endpoint.session, chatId, file, caption: text || undefined },
    });
    return { messageId: pickMessageId(payload) };
  }
  if (mediaType.startsWith("audio/")) {
    const convert = !mediaType.toLowerCase().includes("opus");
    const payload = await wahaRequest(account, "/api/sendVoice", {
      method: "POST",
      body: { session: endpoint.session, chatId, file, convert },
    });
    return { messageId: pickMessageId(payload) };
  }
  if (mediaType.startsWith("video/")) {
    const payload = await wahaRequest(account, "/api/sendVideo", {
      method: "POST",
      body: {
        session: endpoint.session,
        chatId,
        file,
        caption: text || undefined,
        convert: false,
      },
    });
    return { messageId: pickMessageId(payload) };
  }
  const payload = await wahaRequest(account, "/api/sendFile", {
    method: "POST",
    body: { session: endpoint.session, chatId, file, caption: text || undefined },
  });
  return { messageId: pickMessageId(payload) };
}

export async function sendPollViaWaha(
  account: ResolvedWhatsAppAccount,
  to: string,
  poll: { question: string; options: string[]; maxSelections?: number },
): Promise<WahaMessageResult> {
  const endpoint = resolveWahaEndpoint(account);
  const payload = await wahaRequest(account, "/api/sendPoll", {
    method: "POST",
    body: {
      session: endpoint.session,
      chatId: toWahaChatId(to),
      poll: {
        name: poll.question,
        options: poll.options,
        multipleAnswers: (poll.maxSelections ?? 1) > 1,
      },
    },
  });
  return { messageId: pickMessageId(payload) };
}

export async function sendReactionViaWaha(
  account: ResolvedWhatsAppAccount,
  messageId: string,
  emoji: string,
): Promise<void> {
  const endpoint = resolveWahaEndpoint(account);
  await wahaRequest(account, "/api/reaction", {
    method: "PUT",
    body: {
      session: endpoint.session,
      messageId,
      reaction: emoji,
    },
  });
}
