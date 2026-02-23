import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

const loadConfigMock = vi.fn(() => ({}));
vi.mock("../../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
}));

vi.mock("./access-control.js", () => ({
  checkInboundAccessControl: vi.fn(async (params: { accountId: string }) => ({
    allowed: true,
    isSelfChat: false,
    resolvedAccountId: params.accountId,
  })),
}));

vi.mock("../../media/store.js", () => ({
  saveMediaBuffer: vi.fn(async (_buf: Buffer, mimetype?: string) => ({
    path: `/tmp/media-test.${mimetype?.split("/")[1] ?? "bin"}`,
    id: "test-media-id",
    size: 4,
    contentType: mimetype ?? "application/octet-stream",
  })),
}));

// Shared helper: spin up a WS server, send one event, collect inbound messages
async function runWsTest(
  eventPayload: unknown,
  baseUrlOverride?: string,
): Promise<{ messages: Array<{ from: string; body: string; raw: unknown }>; port: number }> {
  const server = new WebSocketServer({ port: 0 });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = baseUrlOverride ?? `http://127.0.0.1:${port}`;

  loadConfigMock.mockReturnValue({
    channels: {
      whatsapp: {
        transport: "waha",
        waha: { baseUrl, session: "default" },
      },
    },
  });

  const messages: Array<{ from: string; body: string; raw: unknown }> = [];

  server.on("connection", (socket) => {
    setTimeout(() => {
      socket.send(JSON.stringify(eventPayload));
    }, 60);
  });

  const { monitorWahaInbox } = await import("./waha-monitor.js");
  const listener = await monitorWahaInbox({
    verbose: false,
    accountId: "default",
    authDir: "",
    onMessage: async (msg) => {
      messages.push({ from: msg.from, body: msg.body, raw: msg });
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 160));
  await listener.close?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  return { messages, port };
}

describe("monitorWahaInbox", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // --- text ---

  it("parses inbound WAHA message events", async () => {
    const { messages } = await runWsTest({
      event: "message",
      payload: {
        id: "wamid.1",
        chatId: "15551234567@c.us",
        body: "hello",
        fromMe: false,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(messages).toEqual([expect.objectContaining({ from: "+15551234567", body: "hello" })]);
  });

  it("parses inbound WAHA message.any events", async () => {
    const { messages } = await runWsTest({
      event: "message.any",
      payload: {
        id: "wamid.1any",
        chatId: "15551234567@c.us",
        body: "hello-any",
        fromMe: false,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(messages).toEqual([
      expect.objectContaining({ from: "+15551234567", body: "hello-any" }),
    ]);
  });

  // --- inbound media ---

  it("parses inbound image message with base64 data", async () => {
    const { messages } = await runWsTest({
      event: "message",
      payload: {
        id: "wamid.img",
        chatId: "15551234567@c.us",
        body: "",
        fromMe: false,
        hasMedia: true,
        media: {
          mimetype: "image/jpeg",
          filename: "photo.jpg",
          data: Buffer.from("fakejpeg").toString("base64"),
        },
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(messages).toHaveLength(1);
    const msg = messages[0].raw as Record<string, unknown>;
    expect(msg.mediaType).toBe("image/jpeg");
    expect(msg.mediaFileName).toBe("photo.jpg");
    expect(typeof msg.mediaPath).toBe("string");
    expect(messages[0].body).toBe("<media:image>");
  });

  it("parses inbound voice/audio message with base64 data", async () => {
    const { messages } = await runWsTest({
      event: "message",
      payload: {
        id: "wamid.voice",
        chatId: "15551234567@c.us",
        body: "",
        fromMe: false,
        hasMedia: true,
        media: {
          mimetype: "audio/ogg; codecs=opus",
          filename: "voice.ogg",
          data: Buffer.from("fakeogg").toString("base64"),
        },
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(messages).toHaveLength(1);
    const msg = messages[0].raw as Record<string, unknown>;
    expect(msg.mediaType).toBe("audio/ogg; codecs=opus");
    expect(msg.mediaPath).toBeTruthy();
    expect(messages[0].body).toBe("<media:audio>");
  });

  it("parses inbound media message via URL (fetches from WAHA server)", async () => {
    const mediaBase64 = Buffer.from("fakepng").toString("base64");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/media/")) {
        return new Response(Buffer.from(mediaBase64, "base64"), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      // WebSocket upgrade — should not hit fetch
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const server = new WebSocketServer({ port: 0 });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      loadConfigMock.mockReturnValue({
        channels: {
          whatsapp: {
            transport: "waha",
            waha: { baseUrl, session: "default" },
          },
        },
      });

      const messages: Array<{ from: string; body: string; raw: unknown }> = [];

      server.on("connection", (socket) => {
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              event: "message",
              payload: {
                id: "wamid.urlmedia",
                chatId: "15551234567@c.us",
                body: "",
                fromMe: false,
                hasMedia: true,
                media: {
                  mimetype: "image/png",
                  filename: "remote.png",
                  url: "/media/remote.png",
                },
                timestamp: Math.floor(Date.now() / 1000),
              },
            }),
          );
        }, 60);
      });

      const { monitorWahaInbox } = await import("./waha-monitor.js");
      const listener = await monitorWahaInbox({
        verbose: false,
        accountId: "default",
        authDir: "",
        onMessage: async (msg) => {
          messages.push({ from: msg.from, body: msg.body, raw: msg });
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 160));
      await listener.close?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      expect(messages).toHaveLength(1);
      const msg = messages[0].raw as Record<string, unknown>;
      expect(msg.mediaType).toBe("image/png");
      expect(msg.mediaPath).toBeTruthy();
      expect(messages[0].body).toBe("<media:image>");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rewrites WAHA media URL host/port to configured base URL host/port", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes("/media/rewrite.png")) {
        return new Response("not found", { status: 404 });
      }
      // The rewritten URL should target the active WAHA base (ephemeral WS server port), not :3000.
      if (url.includes(":3000/")) {
        return new Response("wrong host", { status: 502, statusText: "Bad Gateway" });
      }
      return new Response(Buffer.from("pngbytes"), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    try {
      const server = new WebSocketServer({ port: 0 });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      loadConfigMock.mockReturnValue({
        channels: {
          whatsapp: {
            transport: "waha",
            waha: { baseUrl, session: "default" },
          },
        },
      });

      const messages: Array<{ from: string; body: string; raw: unknown }> = [];
      server.on("connection", (socket) => {
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              event: "message",
              payload: {
                id: "wamid.urlmedia.rewrite",
                chatId: "15551234567@c.us",
                body: "",
                fromMe: false,
                hasMedia: true,
                media: {
                  mimetype: "image/png",
                  filename: "rewrite.png",
                  url: "http://127.0.0.1:3000/media/rewrite.png",
                },
                timestamp: Math.floor(Date.now() / 1000),
              },
            }),
          );
        }, 60);
      });

      const { monitorWahaInbox } = await import("./waha-monitor.js");
      const listener = await monitorWahaInbox({
        verbose: false,
        accountId: "default",
        authDir: "",
        onMessage: async (msg) => {
          messages.push({ from: msg.from, body: msg.body, raw: msg });
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 160));
      await listener.close?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      expect(messages).toHaveLength(1);
      const msg = messages[0].raw as Record<string, unknown>;
      expect(msg.mediaType).toBe("image/png");
      expect(msg.mediaPath).toBeTruthy();
      expect(messages[0].body).toBe("<media:image>");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("pins /api/files media URLs to configured WAHA base host", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes("/api/files/default/some-audio.oga")) {
        return new Response("not found", { status: 404 });
      }
      // Must be rewritten away from :3000 to the configured base host/port.
      if (url.includes(":3000/")) {
        return new Response("wrong host", { status: 502, statusText: "Bad Gateway" });
      }
      return new Response(Buffer.from("oggbytes"), {
        status: 200,
        headers: { "content-type": "audio/ogg" },
      });
    }) as unknown as typeof fetch;

    try {
      const server = new WebSocketServer({ port: 0 });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      loadConfigMock.mockReturnValue({
        channels: {
          whatsapp: {
            transport: "waha",
            waha: { baseUrl, session: "default" },
          },
        },
      });

      const messages: Array<{ from: string; body: string; raw: unknown }> = [];
      server.on("connection", (socket) => {
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              event: "message",
              payload: {
                id: "wamid.urlmedia.files",
                chatId: "15551234567@c.us",
                body: "",
                fromMe: false,
                hasMedia: true,
                media: {
                  mimetype: "audio/ogg; codecs=opus",
                  filename: "some-audio.oga",
                  url: "https://waha3.lotfinity.tech:3000/api/files/default/some-audio.oga",
                },
                timestamp: Math.floor(Date.now() / 1000),
              },
            }),
          );
        }, 60);
      });

      const { monitorWahaInbox } = await import("./waha-monitor.js");
      const listener = await monitorWahaInbox({
        verbose: false,
        accountId: "default",
        authDir: "",
        onMessage: async (msg) => {
          messages.push({ from: msg.from, body: msg.body, raw: msg });
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 160));
      await listener.close?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      expect(messages).toHaveLength(1);
      const msg = messages[0].raw as Record<string, unknown>;
      expect(msg.mediaType).toBe("audio/ogg; codecs=opus");
      expect(msg.mediaPath).toBeTruthy();
      expect(messages[0].body).toBe("<media:audio>");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves media type when WAHA media URL fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/media/")) {
        return new Response("missing", { status: 502, statusText: "Bad Gateway" });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const { messages } = await runWsTest({
        event: "message",
        payload: {
          id: "wamid.urlmedia.fail",
          chatId: "15551234567@c.us",
          body: "",
          fromMe: false,
          hasMedia: true,
          media: {
            mimetype: "image/png",
            filename: "broken.png",
            url: "/media/broken.png",
          },
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
      expect(messages).toHaveLength(1);
      const msg = messages[0].raw as Record<string, unknown>;
      expect(msg.mediaType).toBe("image/png");
      expect(msg.mediaFileName).toBe("broken.png");
      expect(msg.mediaPath).toBeUndefined();
      expect(messages[0].body).toBe("<media:image>");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- poll_vote ---

  it("parses inbound poll_vote event", async () => {
    const { messages } = await runWsTest({
      event: "poll_vote",
      payload: {
        voter: "15551234567@c.us",
        chatId: "15551234567@c.us",
        poll: { name: "Lunch?" },
        vote: { selectedOptions: [{ name: "Pizza" }, { name: "Sushi" }] },
      },
    });
    expect(messages).toHaveLength(1);
    const msg = messages[0].raw as Record<string, unknown>;
    const pollVote = msg.pollVote as { question: string; selectedOptions: string[] };
    expect(pollVote.question).toBe("Lunch?");
    expect(pollVote.selectedOptions).toEqual(["Pizza", "Sushi"]);
    expect(messages[0].body).toBe("[poll vote] Pizza, Sushi");
    expect(messages[0].from).toBe("+15551234567");
  });

  it("parses inbound poll.vote event", async () => {
    const { messages } = await runWsTest({
      event: "poll.vote",
      payload: {
        voter: "15551234567@c.us",
        chatId: "15551234567@c.us",
        poll: { name: "Lunch?" },
        vote: { selectedOptions: [{ name: "Pizza" }, { name: "Sushi" }] },
      },
    });
    expect(messages).toHaveLength(1);
    const msg = messages[0].raw as Record<string, unknown>;
    const pollVote = msg.pollVote as { question: string; selectedOptions: string[] };
    expect(pollVote.question).toBe("Lunch?");
    expect(pollVote.selectedOptions).toEqual(["Pizza", "Sushi"]);
    expect(messages[0].body).toBe("[poll vote] Pizza, Sushi");
    expect(messages[0].from).toBe("+15551234567");
  });

  // --- message.reaction ---

  it("parses inbound message.reaction event", async () => {
    const { messages } = await runWsTest({
      event: "message.reaction",
      payload: {
        from: "15551234567@c.us",
        chatId: "15551234567@c.us",
        fromMe: false,
        reaction: { text: "👍", msgId: "wamid.original" },
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(messages).toHaveLength(1);
    const msg = messages[0].raw as Record<string, unknown>;
    const reaction = msg.reaction as { emoji: string; reactedToMessageId: string };
    expect(reaction.emoji).toBe("👍");
    expect(reaction.reactedToMessageId).toBe("wamid.original");
    expect(messages[0].body).toBe("[reaction] 👍");
    expect(messages[0].from).toBe("+15551234567");
  });
});
