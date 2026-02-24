import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
import { startWahaLoginWithQr, waitForWahaLogin } from "./login.js";

vi.mock("../../qr-image.js", () => ({
  renderQrPngBase64: vi.fn(async () => "base64"),
}));

describe("waha login", () => {
  const originalFetch = globalThis.fetch;
  async function closeServer(server: WebSocketServer): Promise<void> {
    for (const client of server.clients) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns qr data url from session events and then connects", async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    globalThis.fetch = vi.fn(
      async () => new Response("", { status: 404 }),
    ) as unknown as typeof fetch;

    server.on("connection", (socket) => {
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            event: "session.status",
            payload: { status: "SCAN_QR_CODE", qr: "raw-qr" },
          }),
        );
      }, 120);
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            event: "session.status",
            payload: { status: "WORKING" },
          }),
        );
      }, 220);
    });

    const account = {
      accountId: "default",
      transport: "waha",
      waha: {
        baseUrl: `http://127.0.0.1:${port}`,
        session: "default",
      },
    } as unknown as ResolvedWhatsAppAccount;
    const runtime = { log: vi.fn(), error: vi.fn() };

    const start = await startWahaLoginWithQr({
      account,
      timeoutMs: 4000,
      runtime: runtime as never,
    });
    expect(start.qrDataUrl).toBe("data:image/png;base64,base64");

    const wait = await waitForWahaLogin({
      account,
      timeoutMs: 4000,
      runtime: runtime as never,
    });
    expect(wait.connected).toBe(true);

    await closeServer(server);
  });

  it("falls back to QR REST endpoint when websocket qr event is missing", async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7f2ccAAAAASUVORK5CYII=",
      "base64",
    );
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/sessions")) {
        return new Response(JSON.stringify([{ name: "work", status: "SCAN_QR_CODE" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/work/auth/qr")) {
        return new Response(onePixelPng, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    server.on("connection", () => {
      // Intentionally no QR websocket payload.
    });

    const account = {
      accountId: "work",
      transport: "waha",
      waha: {
        baseUrl: `http://127.0.0.1:${port}`,
        session: "work",
      },
    } as unknown as ResolvedWhatsAppAccount;
    const runtime = { log: vi.fn(), error: vi.fn() };

    const start = await startWahaLoginWithQr({
      account,
      timeoutMs: 4000,
      runtime: runtime as never,
    });
    expect(start.qrDataUrl?.startsWith("data:image/png;base64,")).toBe(true);

    await closeServer(server);
  });

  it("keeps login alive when websocket closes with 1008 and fetches QR via REST", async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7f2ccAAAAASUVORK5CYII=",
      "base64",
    );
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/sessions")) {
        return new Response(JSON.stringify([{ name: "work", status: "SCAN_QR_CODE" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/work/auth/qr")) {
        return new Response(onePixelPng, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    server.on("connection", (socket) => {
      setTimeout(() => socket.close(1008), 20);
    });

    const account = {
      accountId: "work",
      transport: "waha",
      waha: {
        baseUrl: `http://127.0.0.1:${port}`,
        session: "work",
      },
    } as unknown as ResolvedWhatsAppAccount;
    const runtime = { log: vi.fn(), error: vi.fn() };

    const start = await startWahaLoginWithQr({
      account,
      timeoutMs: 4000,
      runtime: runtime as never,
    });
    expect(start.qrDataUrl?.startsWith("data:image/png;base64,")).toBe(true);

    await closeServer(server);
  });

  it("fetches QR via REST even when sessions endpoint is unauthorized", async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7f2ccAAAAASUVORK5CYII=",
      "base64",
    );
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/sessions")) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/work/auth/qr?format=image")) {
        return new Response(onePixelPng, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    server.on("connection", (socket) => {
      setTimeout(() => socket.close(1008), 20);
    });

    const account = {
      accountId: "work",
      transport: "waha",
      waha: {
        baseUrl: `http://127.0.0.1:${port}`,
        session: "work",
      },
    } as unknown as ResolvedWhatsAppAccount;
    const runtime = { log: vi.fn(), error: vi.fn() };

    const start = await startWahaLoginWithQr({
      account,
      timeoutMs: 4000,
      runtime: runtime as never,
    });
    expect(start.qrDataUrl?.startsWith("data:image/png;base64,")).toBe(true);

    await closeServer(server);
  });

  it("treats an already-working WAHA session as connected when no active login exists", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/sessions")) {
        return new Response(JSON.stringify([{ name: "default", status: "WORKING" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const account = {
      accountId: "default",
      transport: "waha",
      waha: {
        baseUrl: "http://waha.local",
        session: "default",
      },
    } as unknown as ResolvedWhatsAppAccount;

    const result = await waitForWahaLogin({
      account,
      timeoutMs: 1000,
      runtime: { log: vi.fn(), error: vi.fn() } as never,
    });

    expect(result.connected).toBe(true);
    expect(result.message).toContain("Linked");
  });
});
