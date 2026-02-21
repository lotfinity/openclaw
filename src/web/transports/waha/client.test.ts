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
