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

describe("monitorWahaInbox", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses inbound WAHA message events", async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    loadConfigMock.mockReturnValue({
      channels: {
        whatsapp: {
          transport: "waha",
          waha: {
            baseUrl: `http://127.0.0.1:${port}`,
            session: "default",
          },
        },
      },
    });

    const messages: Array<{ from: string; body: string }> = [];

    server.on("connection", (socket) => {
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            event: "message",
            payload: {
              id: "wamid.1",
              chatId: "15551234567@c.us",
              body: "hello",
              fromMe: false,
              timestamp: Math.floor(Date.now() / 1000),
            },
          }),
        );
      }, 100);
    });

    const { monitorWahaInbox } = await import("./waha-monitor.js");
    const listener = await monitorWahaInbox({
      verbose: false,
      accountId: "default",
      authDir: "",
      onMessage: async (msg) => {
        messages.push({ from: msg.from, body: msg.body });
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(messages).toEqual([{ from: "+15551234567", body: "hello" }]);

    await listener.close?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
