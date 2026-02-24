import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebsiteAssistTelegramHttpRequest } from "./website-assist-telegram.js";

const loadConfigMock = vi.fn();
const sendMessageTelegramMock = vi.fn();

vi.mock("../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
}));

vi.mock("../telegram/send.js", () => ({
  sendMessageTelegram: (...args: unknown[]) => sendMessageTelegramMock(...args),
}));

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMB9oNcam0AAAAASUVORK5CYII=";

function createResponseMock(): {
  res: ServerResponse;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const setHeader = vi.fn();
  const end = vi.fn();
  const res = {
    statusCode: 200,
    setHeader,
    end,
  } as unknown as ServerResponse;
  return { res, setHeader, end };
}

function createJsonRequest(url: string, body: unknown, relayKey?: string): IncomingMessage {
  const raw = JSON.stringify(body);
  return Object.assign(Readable.from([raw]), {
    method: "POST",
    url,
    headers: relayKey ? { "x-openclaw-relay-key": relayKey } : {},
  }) as IncomingMessage;
}

function createGetRequest(url: string): IncomingMessage {
  return Object.assign(Readable.from([]), {
    method: "GET",
    url,
    headers: {},
  }) as IncomingMessage;
}

describe("handleWebsiteAssistTelegramHttpRequest", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...savedEnv };
    loadConfigMock.mockReset();
    sendMessageTelegramMock.mockReset();
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it("returns false for non-matching path", async () => {
    const { res } = createResponseMock();
    const handled = await handleWebsiteAssistTelegramHttpRequest(
      { method: "POST", url: "/api/other" } as IncomingMessage,
      res,
    );
    expect(handled).toBe(false);
  });

  it("rejects when feature is disabled", async () => {
    loadConfigMock.mockReturnValue({ channels: { websiteassist: { enabled: false } } });
    const { res, end } = createResponseMock();
    const req = createJsonRequest("/api/website-assist/telegram", { text: "hello" });
    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain("disabled");
  });

  it("forwards message to telegram when configured", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          botToken: "bot-token-1",
          relayKey: "k1",
          telegramTo: "-100123",
          nodeTag: "node-a",
        },
      },
    });
    sendMessageTelegramMock.mockResolvedValue({
      chatId: "-100123",
      messageId: "42",
    });
    const { res, end } = createResponseMock();
    const req = createJsonRequest(
      "/api/website-assist/telegram",
      {
        text: "Need onboarding help",
        sourceUrl: "https://site.example/help",
        visitorId: "v-123",
        conversationId: "c-1",
      },
      "k1",
    );

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(sendMessageTelegramMock).toHaveBeenCalledTimes(1);
    expect(sendMessageTelegramMock.mock.calls[0]?.[2]).toMatchObject({ token: "bot-token-1" });
    const sentText = String(sendMessageTelegramMock.mock.calls[0]?.[1] ?? "");
    expect(sentText).toContain("Need onboarding help");
    expect(sentText).toContain("node-a");
    expect(sentText).toContain("Conversation: c-1");
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain('"ok":true');
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain('"conversationId":"c-1"');
  });

  it("accepts numeric telegramTo from config", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          botToken: "bot-token-1",
          telegramTo: 1003788079418,
        },
      },
    });
    sendMessageTelegramMock.mockResolvedValue({
      chatId: "1003788079418",
      messageId: "42",
    });
    const { res } = createResponseMock();
    const req = createJsonRequest("/api/website-assist/telegram", {
      text: "Numeric target test",
      conversationId: "c-num",
    });

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(sendMessageTelegramMock).toHaveBeenCalledTimes(1);
    expect(sendMessageTelegramMock.mock.calls[0]?.[0]).toBe("1003788079418");
  });

  it("rejects bad relay key", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          botToken: "bot-token-1",
          relayKey: "expected",
          telegramTo: "-100123",
        },
      },
    });
    const { res, end } = createResponseMock();
    const req = createJsonRequest("/api/website-assist/telegram", {
      text: "hello",
      relayKey: "wrong",
    });

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(sendMessageTelegramMock).not.toHaveBeenCalled();
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain("Invalid relay key");
  });

  it("accepts reply posts and exposes them via messages polling", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          botToken: "bot-token-1",
          relayKey: "r1",
          telegramTo: "-100123",
        },
      },
    });

    const { res: sendRes } = createResponseMock();
    const sendReq = createJsonRequest(
      "/api/website-assist/telegram",
      {
        text: "hello from website",
        conversationId: "conv-77",
      },
      "r1",
    );
    sendMessageTelegramMock.mockResolvedValue({
      chatId: "-100123",
      messageId: "1",
    });
    await handleWebsiteAssistTelegramHttpRequest(sendReq, sendRes);

    const { res: replyRes } = createResponseMock();
    const replyReq = createJsonRequest(
      "/api/website-assist/reply",
      {
        conversationId: "conv-77",
        text: "hello from bot",
      },
      "r1",
    );
    const replyHandled = await handleWebsiteAssistTelegramHttpRequest(replyReq, replyRes);
    expect(replyHandled).toBe(true);
    expect(replyRes.statusCode).toBe(200);

    const { res: messagesRes, end: messagesEnd } = createResponseMock();
    const messagesReq = createGetRequest("/api/website-assist/messages?conversationId=conv-77");
    const messagesHandled = await handleWebsiteAssistTelegramHttpRequest(messagesReq, messagesRes);
    expect(messagesHandled).toBe(true);
    expect(messagesRes.statusCode).toBe(200);
    const payloadRaw = String(messagesEnd.mock.calls[0]?.[0] ?? "");
    expect(payloadRaw).toContain('"conversationId":"conv-77"');
    expect(payloadRaw).toContain("hello from website");
    expect(payloadRaw).toContain("hello from bot");
  });

  it("rejects send when websiteassist bot token is missing", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          relayKey: "k1",
          telegramTo: "-100123",
        },
      },
    });
    const { res, end } = createResponseMock();
    const req = createJsonRequest(
      "/api/website-assist/telegram",
      {
        text: "Need onboarding help",
        conversationId: "c-no-token",
      },
      "k1",
    );

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain("Missing bot token");
    expect(sendMessageTelegramMock).not.toHaveBeenCalled();
  });

  it("uses environment defaults when config values are missing", async () => {
    process.env.OPENCLAW_WEBSITE_ASSIST_BOT_TOKEN = "env-bot-token";
    process.env.OPENCLAW_WEBSITE_ASSIST_TELEGRAM_TO = "-100999";
    process.env.OPENCLAW_WEBSITE_ASSIST_ENABLED = "true";
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {},
      },
    });
    sendMessageTelegramMock.mockResolvedValue({
      chatId: "-100999",
      messageId: "7",
    });
    const { res } = createResponseMock();
    const req = createJsonRequest("/api/website-assist/telegram", {
      text: "env fallback test",
      conversationId: "env-c-1",
    });

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(sendMessageTelegramMock).toHaveBeenCalledTimes(1);
    expect(sendMessageTelegramMock.mock.calls[0]?.[0]).toBe("-100999");
    expect(sendMessageTelegramMock.mock.calls[0]?.[2]).toMatchObject({ token: "env-bot-token" });
  });

  it("forwards media to telegram when configured", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          botToken: "bot-token-1",
          relayKey: "k1",
          telegramTo: "-100123",
          nodeTag: "node-a",
        },
      },
    });
    sendMessageTelegramMock.mockResolvedValue({
      chatId: "-100123",
      messageId: "52",
    });
    const { res, end } = createResponseMock();
    const req = createJsonRequest(
      "/api/website-assist/media",
      {
        mediaDataUrl: ONE_PIXEL_PNG,
        mediaFileName: "screen.png",
        text: "See attached",
        conversationId: "c-media-1",
      },
      "k1",
    );

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(sendMessageTelegramMock).toHaveBeenCalledTimes(1);
    const sendOpts = sendMessageTelegramMock.mock.calls[0]?.[2] as
      | { token?: string; mediaUrl?: string }
      | undefined;
    expect(sendOpts?.token).toBe("bot-token-1");
    expect(typeof sendOpts?.mediaUrl).toBe("string");
    expect(String(sendOpts?.mediaUrl ?? "")).toContain(".openclaw/media/website-assist/");
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain('"conversationId":"c-media-1"');
    if (sendOpts?.mediaUrl) {
      await fs.unlink(sendOpts.mediaUrl).catch(() => {});
    }
  });

  it("rejects media upload with invalid data url", async () => {
    loadConfigMock.mockReturnValue({
      channels: {
        websiteassist: {
          enabled: true,
          botToken: "bot-token-1",
          relayKey: "k1",
          telegramTo: "-100123",
        },
      },
    });
    const { res, end } = createResponseMock();
    const req = createJsonRequest(
      "/api/website-assist/media",
      {
        mediaDataUrl: "not-a-data-url",
      },
      "k1",
    );

    const handled = await handleWebsiteAssistTelegramHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(sendMessageTelegramMock).not.toHaveBeenCalled();
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain("mediaDataUrl");
  });
});
