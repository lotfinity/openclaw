import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleWebsiteWidgetHttpRequest } from "./website-widget.js";

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

describe("handleWebsiteWidgetHttpRequest", () => {
  it("serves the bootstrap script", () => {
    const { res, setHeader, end } = createResponseMock();
    const handled = handleWebsiteWidgetHttpRequest(
      { method: "GET", url: "/widget/openclaw-widget.js" } as IncomingMessage,
      res,
    );

    expect(handled).toBe(true);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "application/javascript; charset=utf-8");
    const body = String(end.mock.calls[0]?.[0] ?? "");
    expect(body).toContain("OpenClawWidgetConfig");
    expect(body).toContain('scriptBasePath + "/frame#cfg="');
  });

  it("serves the frame html", () => {
    const { res, setHeader, end } = createResponseMock();
    const handled = handleWebsiteWidgetHttpRequest(
      { method: "GET", url: "/widget/frame" } as IncomingMessage,
      res,
    );

    expect(handled).toBe(true);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      expect.stringContaining("connect-src ws: wss:"),
    );
    const body = String(end.mock.calls[0]?.[0] ?? "");
    expect(body).toContain('id="ocw-launcher"');
    expect(body).toContain("chat.send");
  });

  it("serves a copy-paste snippet", () => {
    const { res, setHeader, end } = createResponseMock();
    const handled = handleWebsiteWidgetHttpRequest(
      {
        method: "GET",
        url: "/widget/snippet?token=test-token&sessionKey=site-main&title=Support%20Chat",
      } as IncomingMessage,
      res,
    );

    expect(handled).toBe(true);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
    const body = String(end.mock.calls[0]?.[0] ?? "");
    expect(body).toContain("window.OpenClawWidgetConfig");
    expect(body).toContain("test-token");
    expect(body).toContain("Support Chat");
  });

  it("serves widget routes under control-ui base path", () => {
    const { res, end } = createResponseMock();
    const handled = handleWebsiteWidgetHttpRequest(
      { method: "GET", url: "/openclaw/widget/openclaw-widget.js" } as IncomingMessage,
      res,
      { basePath: "/openclaw" },
    );

    expect(handled).toBe(true);
    const body = String(end.mock.calls[0]?.[0] ?? "");
    expect(body).toContain('scriptBasePath + "/frame#cfg="');
    expect(body).toContain('"/openclaw/widget"');
  });

  it("returns false for non-widget paths", () => {
    const { res } = createResponseMock();
    const handled = handleWebsiteWidgetHttpRequest(
      { method: "GET", url: "/not-widget" } as IncomingMessage,
      res,
    );

    expect(handled).toBe(false);
  });
});
