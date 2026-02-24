import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
import {
  sendMediaViaWaha,
  sendPollViaWaha,
  sendReactionViaWaha,
  sendTextViaWaha,
} from "./client.js";

const account = {
  accountId: "default",
  transport: "waha",
  waha: { baseUrl: "http://waha.local", apiKey: "token", session: "default" },
} as unknown as ResolvedWhatsAppAccount;

describe("waha client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends text via sendText endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "wamid.123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await sendTextViaWaha(account, "+1555", "hello");
    expect(result).toEqual({ messageId: "wamid.123" });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/sendText");
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      session: "default",
      chatId: "1555@c.us",
      text: "hello",
    });
  });

  it("sends image media via sendImage endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messageId: "m1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await sendMediaViaWaha(
      account,
      "120363401234567890@g.us",
      "caption",
      Buffer.from("img"),
      "image/jpeg",
      "photo.jpg",
    );
    expect(result).toEqual({ messageId: "m1" });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/sendImage");
    const body = JSON.parse(String(requestInit.body));
    expect(body.chatId).toBe("120363401234567890@g.us");
    expect(body.file.filename).toBe("photo.jpg");
  });

  it("sends polls via sendPoll endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: { _serialized: "poll123" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await sendPollViaWaha(account, "+1555", {
      question: "Lunch?",
      options: ["Pizza", "Sushi"],
      maxSelections: 2,
    });
    expect(result).toEqual({ messageId: "poll123" });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/sendPoll");
    const body = JSON.parse(String(requestInit.body));
    expect(body.poll).toMatchObject({
      name: "Lunch?",
      options: ["Pizza", "Sushi"],
      multipleAnswers: true,
    });
  });

  it("sends audio via sendVoice endpoint with convert=true for non-opus", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "wamid.audio" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await sendMediaViaWaha(
      account,
      "+1555",
      "",
      Buffer.from("audio"),
      "audio/mpeg",
      "voice.mp3",
    );
    expect(result).toEqual({ messageId: "wamid.audio" });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/sendVoice");
    const body = JSON.parse(String(requestInit.body));
    expect(body.convert).toBe(true);
    expect(body.file.mimetype).toBe("audio/mpeg");
  });

  it("sends audio via sendVoice endpoint with convert=false for opus", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "wamid.opus" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await sendMediaViaWaha(account, "+1555", "", Buffer.from("audio"), "audio/ogg; codecs=opus");
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.convert).toBe(false);
  });

  it("sends video via sendVideo endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "wamid.vid" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await sendMediaViaWaha(
      account,
      "+1555",
      "clip",
      Buffer.from("video"),
      "video/mp4",
      "clip.mp4",
    );
    expect(result).toEqual({ messageId: "wamid.vid" });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/sendVideo");
    const body = JSON.parse(String(requestInit.body));
    expect(body.caption).toBe("clip");
    expect(body.file.filename).toBe("clip.mp4");
  });

  it("sends document via sendFile endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "wamid.doc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await sendMediaViaWaha(
      account,
      "+1555",
      "here is the pdf",
      Buffer.from("pdf"),
      "application/pdf",
      "report.pdf",
    );
    expect(result).toEqual({ messageId: "wamid.doc" });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/sendFile");
    const body = JSON.parse(String(requestInit.body));
    expect(body.caption).toBe("here is the pdf");
    expect(body.file.filename).toBe("report.pdf");
  });

  it("sends reactions via reaction endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await sendReactionViaWaha(account, "wamid.1", "✅");
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://waha.local/api/reaction");
    expect(requestInit.method).toBe("PUT");
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      session: "default",
      messageId: "wamid.1",
      reaction: "✅",
    });
  });
});
