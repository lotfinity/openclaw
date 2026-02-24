import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { normalizeControlUiBasePath } from "./control-ui-shared.js";
import { PROTOCOL_VERSION } from "./protocol/index.js";

const WIDGET_BASE_PATH = "/widget";
const WIDGET_SCRIPT_PATH = `${WIDGET_BASE_PATH}/openclaw-widget.js`;
const WIDGET_FRAME_PATH = `${WIDGET_BASE_PATH}/frame`;
const WIDGET_SNIPPET_PATH = `${WIDGET_BASE_PATH}/snippet`;

type WidgetQueryConfig = {
  gatewayUrl?: string;
  token?: string;
  sessionKey?: string;
  title?: string;
  accentColor?: string;
  launcherLabel?: string;
  placeholder?: string;
  widgetWidth?: string;
  widgetHeight?: string;
  position?: "left" | "right";
  autoOpen?: boolean;
};

function sendText(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  cacheControl = "no-cache",
) {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(body);
}

function parseQueryConfig(url: URL): WidgetQueryConfig {
  const read = (key: string) => {
    const value = url.searchParams.get(key);
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const bool = (key: string): boolean | undefined => {
    const raw = read(key);
    if (!raw) {
      return undefined;
    }
    const normalized = raw.toLowerCase();
    return (
      normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
    );
  };

  return {
    gatewayUrl: read("gatewayUrl"),
    token: read("token"),
    sessionKey: read("sessionKey"),
    title: read("title"),
    accentColor: read("accentColor"),
    launcherLabel: read("launcherLabel"),
    placeholder: read("placeholder"),
    widgetWidth: read("widgetWidth"),
    widgetHeight: read("widgetHeight"),
    position: read("position") === "left" ? "left" : "right",
    autoOpen: bool("autoOpen"),
  };
}

function defaultWsUrlFromRequest(url: URL): string {
  return `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSnippet(url: URL, pathPrefix: string): string {
  const cfg = parseQueryConfig(url);
  const src = `${url.origin}${pathPrefix}${WIDGET_SCRIPT_PATH}`;
  const lines = [
    "<script>",
    "  window.OpenClawWidgetConfig = {",
    `    token: ${JSON.stringify(cfg.token ?? "<your-gateway-token>")},`,
    `    gatewayUrl: ${JSON.stringify(cfg.gatewayUrl ?? defaultWsUrlFromRequest(url))},`,
    `    sessionKey: ${JSON.stringify(cfg.sessionKey ?? "site-main")},`,
    `    title: ${JSON.stringify(cfg.title ?? "Chat with us")},`,
    `    accentColor: ${JSON.stringify(cfg.accentColor ?? "#0f766e")},`,
    `    launcherLabel: ${JSON.stringify(cfg.launcherLabel ?? "Chat")},`,
    `    placeholder: ${JSON.stringify(cfg.placeholder ?? "Type your message...")},`,
    `    widgetWidth: ${JSON.stringify(cfg.widgetWidth ?? "420px")},`,
    `    widgetHeight: ${JSON.stringify(cfg.widgetHeight ?? "680px")},`,
    `    position: ${JSON.stringify(cfg.position ?? "right")},`,
    `    autoOpen: ${JSON.stringify(cfg.autoOpen ?? false)},`,
    "  };",
    "</script>",
    `<script src="${escapeHtml(src)}" defer></script>`,
  ];
  return `${lines.join("\n")}\n`;
}

function renderBootstrapScript(pathPrefix: string): string {
  return `(() => {
  if (window.__OPENCLAW_WIDGET_BOOTSTRAPPED__) return;
  window.__OPENCLAW_WIDGET_BOOTSTRAPPED__ = true;

  const currentScript =
    document.currentScript ||
    Array.from(document.querySelectorAll("script[src]")).find((el) => {
      const src = typeof el.src === "string" ? el.src : "";
      return src.includes("openclaw-widget.js");
    }) ||
    null;
  const config = Object.assign({}, window.OpenClawWidgetConfig || {});

  function readData(name) {
    if (!currentScript || !currentScript.dataset) return undefined;
    const value = currentScript.dataset[name];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  const scriptSrc = currentScript && typeof currentScript.src === "string" ? currentScript.src : "";
  const scriptUrl = scriptSrc ? new URL(scriptSrc, window.location.href) : new URL(window.location.href);
  const scriptPath = scriptUrl.pathname || "";
  const scriptBasePath = scriptPath.endsWith("/openclaw-widget.js")
    ? scriptPath.slice(0, -"/openclaw-widget.js".length)
    : "${pathPrefix}${WIDGET_BASE_PATH}";

  config.gatewayUrl = config.gatewayUrl || readData("gatewayUrl");
  config.token = config.token || readData("token");
  config.sessionKey = config.sessionKey || readData("sessionKey");
  config.title = config.title || readData("title");
  config.accentColor = config.accentColor || readData("accentColor");
  config.launcherLabel = config.launcherLabel || readData("launcherLabel");
  config.placeholder = config.placeholder || readData("placeholder");
  config.widgetWidth = config.widgetWidth || readData("widgetWidth");
  config.widgetHeight = config.widgetHeight || readData("widgetHeight");
  config.position = config.position || readData("position");
  const parseBool = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  };

  if (!config.gatewayUrl) {
    config.gatewayUrl = (scriptUrl.protocol === "https:" ? "wss" : "ws") + "://" + scriptUrl.host;
  }

  const payload = {
    gatewayUrl: config.gatewayUrl,
    token: config.token,
    sessionKey: config.sessionKey,
    title: config.title,
    accentColor: config.accentColor,
    launcherLabel: config.launcherLabel,
    placeholder: config.placeholder,
    widgetWidth: config.widgetWidth,
    widgetHeight: config.widgetHeight,
    position: config.position,
    autoOpen: parseBool(config.autoOpen ?? readData("autoOpen")),
    pageHost: window.location.hostname || "site",
    pagePath: window.location.pathname || "/",
  };

  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const encoded = btoa(binary).replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/g, "");

  const frame = document.createElement("iframe");
  frame.title = "OpenClaw Website Widget";
  frame.setAttribute("aria-label", "OpenClaw Website Widget");
  frame.src = scriptUrl.origin + scriptBasePath + "/frame#cfg=" + encoded;
  frame.style.position = "fixed";
  frame.style.bottom = "20px";
  frame.style.right = config.position === "left" ? "" : "20px";
  frame.style.left = config.position === "left" ? "20px" : "";
  frame.style.width = typeof config.widgetWidth === "string" && config.widgetWidth.trim() ? config.widgetWidth.trim() : "420px";
  frame.style.maxWidth = "calc(100vw - 24px)";
  frame.style.height = typeof config.widgetHeight === "string" && config.widgetHeight.trim() ? config.widgetHeight.trim() : "680px";
  frame.style.maxHeight = "calc(100vh - 24px)";
  frame.style.border = "0";
  frame.style.background = "transparent";
  frame.style.zIndex = "2147483000";

  const small = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  if (small) {
    frame.style.right = config.position === "left" ? "" : "12px";
    frame.style.left = config.position === "left" ? "12px" : "";
    frame.style.bottom = "12px";
    frame.style.width = "calc(100vw - 24px)";
    frame.style.height = "calc(100vh - 24px)";
  }

  document.body.appendChild(frame);
})();
`;
}

function renderWidgetFrameHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenClaw Widget</title>
    <style>
      :root {
        --ocw-accent: #0f766e;
        --ocw-bg: #ffffff;
        --ocw-text: #111827;
        --ocw-muted: #6b7280;
        --ocw-border: #e5e7eb;
        --ocw-panel-width: 420px;
        --ocw-panel-height: 680px;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .widget-shell {
        position: fixed;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: flex-end;
        align-items: flex-end;
        padding: 8px;
      }
      .launcher {
        position: absolute;
        right: 8px;
        bottom: 8px;
        border: 0;
        border-radius: 999px;
        background: var(--ocw-accent);
        color: #fff;
        font-weight: 600;
        padding: 10px 14px;
        cursor: pointer;
        box-shadow: 0 12px 24px rgba(0,0,0,.2);
      }
      .panel {
        display: none;
        width: min(var(--ocw-panel-width), calc(100vw - 16px));
        height: min(var(--ocw-panel-height), calc(100vh - 16px));
        background: var(--ocw-bg);
        border: 1px solid var(--ocw-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 24px 48px rgba(0,0,0,.22);
      }
      .panel.open { display: grid; grid-template-rows: auto 1fr auto; }
      .head {
        padding: 12px 14px;
        background: linear-gradient(135deg, var(--ocw-accent), #0b5e57);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .head h1 { margin: 0; font-size: 15px; line-height: 1.2; font-weight: 700; }
      .status { font-size: 12px; opacity: .9; }
      .messages { padding: 12px; overflow: auto; background: #f8fafc; }
      .msg {
        max-width: 85%;
        margin-bottom: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-size: 14px;
      }
      .msg.user { margin-left: auto; background: var(--ocw-accent); color: #fff; border-bottom-right-radius: 4px; }
      .msg.assistant { margin-right: auto; background: #fff; color: var(--ocw-text); border: 1px solid var(--ocw-border); border-bottom-left-radius: 4px; }
      .composer { padding: 10px; border-top: 1px solid var(--ocw-border); background: #fff; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
      .composer input {
        border: 1px solid var(--ocw-border);
        border-radius: 10px;
        padding: 10px 12px;
        outline: none;
        font-size: 14px;
      }
      .composer button {
        border: 0;
        border-radius: 10px;
        padding: 0 14px;
        background: var(--ocw-accent);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      .tiny { color: var(--ocw-muted); font-size: 12px; padding: 0 12px 10px; }
      @media (max-width: 640px) {
        .widget-shell { padding: 0; }
        .panel { width: 100vw; height: 100vh; border-radius: 0; border: 0; }
        .launcher { right: 12px; bottom: 12px; }
      }
    </style>
  </head>
  <body>
    <div class="widget-shell">
      <button class="launcher" id="ocw-launcher" type="button">Chat</button>
      <section class="panel" id="ocw-panel" aria-live="polite">
        <header class="head">
          <h1 id="ocw-title">Chat with us</h1>
          <span class="status" id="ocw-status">Connecting...</span>
        </header>
        <main class="messages" id="ocw-messages"></main>
        <form class="composer" id="ocw-form">
          <input id="ocw-input" type="text" placeholder="Type your message..." autocomplete="off" />
          <button type="submit">Send</button>
        </form>
      </section>
    </div>
    <script>
      (() => {
        const protocolVersion = ${String(PROTOCOL_VERSION)};
        const makeWsUrl = () => (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host;

        const fromBase64Url = (raw) => {
          if (!raw) return null;
          try {
            const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
            const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
            const binary = atob(padded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
              bytes[i] = binary.charCodeAt(i);
            }
            const text = new TextDecoder().decode(bytes);
            return JSON.parse(text);
          } catch {
            return null;
          }
        };

        const hashParams = new URLSearchParams(location.hash.slice(1));
        const cfg = fromBase64Url(hashParams.get("cfg")) || {};
        const pageHost = typeof cfg.pageHost === "string" && cfg.pageHost.trim() ? cfg.pageHost.trim() : "site";

        const launcher = document.getElementById("ocw-launcher");
        const panel = document.getElementById("ocw-panel");
        const titleEl = document.getElementById("ocw-title");
        const statusEl = document.getElementById("ocw-status");
        const messagesEl = document.getElementById("ocw-messages");
        const formEl = document.getElementById("ocw-form");
        const inputEl = document.getElementById("ocw-input");

        const safeTitle = typeof cfg.title === "string" && cfg.title.trim() ? cfg.title.trim() : "Chat with us";
        const safeLabel = typeof cfg.launcherLabel === "string" && cfg.launcherLabel.trim() ? cfg.launcherLabel.trim() : "Chat";
        const safePlaceholder = typeof cfg.placeholder === "string" && cfg.placeholder.trim() ? cfg.placeholder.trim() : "Type your message...";
        const autoOpen =
          cfg.autoOpen === true ||
          (typeof cfg.autoOpen === "string" &&
            ["1", "true", "yes", "on"].includes(cfg.autoOpen.trim().toLowerCase()));

        titleEl.textContent = safeTitle;
        launcher.textContent = safeLabel;
        inputEl.placeholder = safePlaceholder;

        if (typeof cfg.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(cfg.accentColor.trim())) {
          document.documentElement.style.setProperty("--ocw-accent", cfg.accentColor.trim());
        }
        if (typeof cfg.widgetWidth === "string" && cfg.widgetWidth.trim()) {
          document.documentElement.style.setProperty("--ocw-panel-width", cfg.widgetWidth.trim());
        }
        if (typeof cfg.widgetHeight === "string" && cfg.widgetHeight.trim()) {
          document.documentElement.style.setProperty("--ocw-panel-height", cfg.widgetHeight.trim());
        }
        if (cfg.position === "left") {
          const shellEl = document.querySelector(".widget-shell");
          if (shellEl) {
            shellEl.style.justifyContent = "flex-start";
          }
          launcher.style.left = "8px";
          launcher.style.right = "auto";
        }

        const visitorKey = "openclaw-widget-visitor-" + pageHost;
        let visitorId = localStorage.getItem(visitorKey);
        if (!visitorId) {
          visitorId = randomId();
          localStorage.setItem(visitorKey, visitorId);
        }

        const sessionKey =
          typeof cfg.sessionKey === "string" && cfg.sessionKey.trim()
            ? cfg.sessionKey.trim()
            : "widget:" + pageHost + ":" + visitorId;

        const gatewayUrl = typeof cfg.gatewayUrl === "string" && cfg.gatewayUrl.trim() ? cfg.gatewayUrl.trim() : makeWsUrl();
        const authStorageKey = "openclaw-widget-auth:" + gatewayUrl;
        let token =
          typeof cfg.token === "string" && cfg.token.trim()
            ? cfg.token.trim()
            : localStorage.getItem(authStorageKey) || "";

        let ws = null;
        let reqSeq = 1;
        const pending = new Map();
        let currentRunId = null;

        launcher.addEventListener("click", () => {
          const open = panel.classList.toggle("open");
          launcher.textContent = open ? "Close" : safeLabel;
          if (open) {
            inputEl.focus();
          }
        });

        if (autoOpen) {
          panel.classList.add("open");
          launcher.textContent = "Close";
          setTimeout(() => inputEl.focus(), 50);
        }

        formEl.addEventListener("submit", async (event) => {
          event.preventDefault();
          const text = inputEl.value.trim();
          if (!text) return;
          inputEl.value = "";
          appendMessage("user", text);
          setStatus("Thinking...");

          try {
            const res = await rpc("chat.send", {
              sessionKey,
              message: text,
              idempotencyKey: "widget-" + randomId(),
            });
            currentRunId = res && res.runId ? String(res.runId) : null;
          } catch (err) {
            appendMessage("assistant", "Failed to send message. " + String(err && err.message ? err.message : err));
            setStatus("Disconnected");
          }
        });

        connect();

        function ensureAuthToken() {
          if (typeof token === "string" && token.trim()) {
            return true;
          }
          const entered = window.prompt("Enter widget access token/password");
          if (!entered || !entered.trim()) {
            setStatus("Auth required");
            return false;
          }
          token = entered.trim();
          localStorage.setItem(authStorageKey, token);
          return true;
        }

        function connect() {
          setStatus("Connecting...");
          ws = new WebSocket(gatewayUrl);

          ws.addEventListener("open", async () => {
            if (!ensureAuthToken()) {
              try {
                ws.close();
              } catch {
                // noop
              }
              return;
            }
            try {
              await rpc("connect", {
                minProtocol: protocolVersion,
                maxProtocol: protocolVersion,
                client: {
                  id: "webchat-ui",
                  version: "website-widget",
                  platform: "web",
                  mode: "webchat",
                  displayName: "Website Widget",
                },
                role: "operator",
                scopes: [],
                auth: token ? { token, password: token } : undefined,
              });
              setStatus("Online");
              await refreshHistory();
            } catch (err) {
              setStatus("Auth failed");
              appendMessage("assistant", "Connection failed. " + String(err && err.message ? err.message : err));
            }
          });

          ws.addEventListener("message", (event) => {
            let frame;
            try {
              frame = JSON.parse(String(event.data || ""));
            } catch {
              return;
            }

            if (frame.type === "res" && typeof frame.id === "string") {
              const pendingReq = pending.get(frame.id);
              if (!pendingReq) return;
              pending.delete(frame.id);
              if (frame.ok) {
                pendingReq.resolve(frame.payload);
              } else {
                pendingReq.reject(new Error(frame.error && frame.error.message ? String(frame.error.message) : "request failed"));
              }
              return;
            }

            if (frame.type === "event" && frame.event === "chat" && frame.payload && typeof frame.payload === "object") {
              const payload = frame.payload;
              if (payload.state === "final" && (!currentRunId || payload.runId === currentRunId)) {
                currentRunId = null;
                void refreshHistory();
                setStatus("Online");
              }
              if (payload.state === "error") {
                setStatus("Error");
                appendMessage("assistant", payload.errorMessage ? String(payload.errorMessage) : "Something went wrong.");
              }
            }
          });

          ws.addEventListener("close", () => {
            setStatus("Disconnected");
            setTimeout(connect, 1500);
          });

          ws.addEventListener("error", () => {
            setStatus("Network error");
          });
        }

        function rpc(method, params) {
          return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
              reject(new Error("socket not connected"));
              return;
            }
            const id = "r" + String(reqSeq++);
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ type: "req", id, method, params }));
            setTimeout(() => {
              const hit = pending.get(id);
              if (!hit) return;
              pending.delete(id);
              reject(new Error("request timeout"));
            }, 30000);
          });
        }

        async function refreshHistory() {
          try {
            const result = await rpc("chat.history", { sessionKey, limit: 40 });
            const rawMessages = Array.isArray(result && result.messages) ? result.messages : [];
            messagesEl.textContent = "";
            for (const item of rawMessages) {
              const role = item && item.role === "assistant" ? "assistant" : "user";
              const text = extractText(item);
              if (!text) continue;
              appendMessage(role, text);
            }
            if (!rawMessages.length) {
              appendMessage("assistant", "Hi! Ask me anything.");
            }
          } catch {
            // Keep existing local render if history cannot be loaded.
          }
        }

        function extractText(message) {
          if (!message || typeof message !== "object") return "";
          const content = message.content;
          if (typeof content === "string") return content;
          if (!Array.isArray(content)) return "";
          return content
            .map((part) => {
              if (!part || typeof part !== "object") return "";
              if (part.type === "text" && typeof part.text === "string") return part.text;
              if (typeof part.value === "string") return part.value;
              return "";
            })
            .filter(Boolean)
            .join("\n")
            .trim();
        }

        function appendMessage(role, text) {
          const el = document.createElement("div");
          el.className = "msg " + (role === "assistant" ? "assistant" : "user");
          el.textContent = text;
          messagesEl.appendChild(el);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function randomId() {
          if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
          }
          return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        }

        function setStatus(text) {
          statusEl.textContent = text;
        }
      })();
    </script>
  </body>
</html>`;
}

export function handleWebsiteWidgetHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: { basePath?: string },
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }
  if (!req.url) {
    return false;
  }

  const url = new URL(req.url, "http://localhost");
  const normalizedBasePath = normalizeControlUiBasePath(opts?.basePath);
  const candidatePrefixes =
    normalizedBasePath && normalizedBasePath !== "/" ? ["", normalizedBasePath] : [""];

  const matchedPrefix = candidatePrefixes.find((prefix) => {
    const scriptPath = `${prefix}${WIDGET_SCRIPT_PATH}`;
    const framePath = `${prefix}${WIDGET_FRAME_PATH}`;
    const snippetPath = `${prefix}${WIDGET_SNIPPET_PATH}`;
    return (
      url.pathname === scriptPath ||
      url.pathname === framePath ||
      url.pathname === `${framePath}.html` ||
      url.pathname === snippetPath
    );
  });
  if (matchedPrefix == null) {
    return false;
  }

  const scriptPath = `${matchedPrefix}${WIDGET_SCRIPT_PATH}`;
  const framePath = `${matchedPrefix}${WIDGET_FRAME_PATH}`;
  const snippetPath = `${matchedPrefix}${WIDGET_SNIPPET_PATH}`;

  if (url.pathname === scriptPath) {
    sendText(
      res,
      200,
      "application/javascript; charset=utf-8",
      renderBootstrapScript(matchedPrefix),
      "public, max-age=60",
    );
    return true;
  }
  if (url.pathname === framePath || url.pathname === `${framePath}.html`) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ws: wss:; img-src data: https: http:; font-src data:;",
    );
    sendText(res, 200, "text/html; charset=utf-8", renderWidgetFrameHtml(), "no-cache");
    return true;
  }
  if (url.pathname === snippetPath) {
    sendText(res, 200, "text/plain; charset=utf-8", renderSnippet(url, matchedPrefix), "no-cache");
    return true;
  }

  return false;
}

export function createWebsiteWidgetSessionKey(prefix: string): string {
  const cleanPrefix = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = cleanPrefix.length > 0 ? cleanPrefix : "widget";
  return `${base}:${randomUUID()}`;
}
