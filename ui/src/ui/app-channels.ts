import type { OpenClawApp } from "./app.ts";
import type { NostrProfile } from "./types.ts";
import type { WebsiteAssistConfigState } from "./views/channels.website-assist.ts";
import {
  closeWhatsAppScreenshot,
  fetchWhatsAppScreenshot,
  loadChannels,
  logoutWhatsApp,
  requestWhatsAppPairCode,
  startWhatsAppLogin,
  waitWhatsAppLogin,
} from "./controllers/channels.ts";
import { loadConfig, saveConfig, updateConfigFormValue } from "./controllers/config.ts";
import { createNostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  parseWidgetSnippet,
  type WebsiteWidgetFormState,
  type WebsiteWidgetProbeState,
} from "./views/channels.website-widget.ts";

const WIDGET_CONNECT_TIMEOUT_MS = 8_000;
const FETCH_TIMEOUT_MS = 6_000;

function readWebsiteAssistConfig(host: OpenClawApp): WebsiteAssistConfigState {
  const config = host.configForm ?? host.configSnapshot?.config ?? {};
  const channels = (config.channels ?? {}) as Record<string, unknown>;
  const raw = (channels.websiteassist ?? {}) as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    botToken: typeof raw.botToken === "string" ? raw.botToken : "",
    relayKey: typeof raw.relayKey === "string" ? raw.relayKey : "",
    telegramTo:
      typeof raw.telegramTo === "string"
        ? raw.telegramTo
        : typeof raw.telegramTo === "number" && Number.isFinite(raw.telegramTo)
          ? String(raw.telegramTo)
          : "",
    nodeTag: typeof raw.nodeTag === "string" ? raw.nodeTag : "",
    autoTopic: raw.autoTopic === true,
    topicPrefix: typeof raw.topicPrefix === "string" ? raw.topicPrefix : "",
  };
}

export async function handleWhatsAppStart(host: OpenClawApp, force: boolean) {
  await startWhatsAppLogin(host, force);
  await loadChannels(host, true);
}

export async function handleWhatsAppWait(host: OpenClawApp) {
  await waitWhatsAppLogin(host);
  await loadChannels(host, true);
}

export async function handleWhatsAppLogout(host: OpenClawApp) {
  await logoutWhatsApp(host);
  await loadChannels(host, true);
}

export async function handleWhatsAppRequestCode(host: OpenClawApp, phoneNumber: string) {
  await requestWhatsAppPairCode(host, phoneNumber);
  await loadChannels(host, true);
}

export async function handleWhatsAppScreenshot(host: OpenClawApp) {
  await fetchWhatsAppScreenshot(host);
}

export function handleWhatsAppScreenshotClose(host: OpenClawApp) {
  closeWhatsAppScreenshot(host);
}

export async function handleChannelConfigSave(host: OpenClawApp) {
  await saveConfig(host);
  await loadConfig(host);
  applyChannelsTabDefaults(host);
  await loadChannels(host, true);
}

export async function handleChannelConfigReload(host: OpenClawApp) {
  await loadConfig(host);
  applyChannelsTabDefaults(host);
  await loadChannels(host, true);
}

export function applyChannelsTabDefaults(host: OpenClawApp) {
  const config = (host.configForm ?? host.configSnapshot?.config) as Record<string, unknown> | null;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return;
  }
  const channels = (config.channels ?? {}) as Record<string, unknown>;
  const rawWhatsApp = channels.whatsapp;
  const whatsapp =
    rawWhatsApp && typeof rawWhatsApp === "object" && !Array.isArray(rawWhatsApp)
      ? (rawWhatsApp as Record<string, unknown>)
      : {};

  const dmPolicy = typeof whatsapp.dmPolicy === "string" ? whatsapp.dmPolicy.trim() : "";
  const allowFrom = Array.isArray(whatsapp.allowFrom)
    ? whatsapp.allowFrom.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const hasWildcardAllow = allowFrom.includes("*");

  if (!dmPolicy || dmPolicy === "pairing") {
    updateConfigFormValue(host, ["channels", "whatsapp", "dmPolicy"], "open");
  }
  if (!hasWildcardAllow) {
    updateConfigFormValue(host, ["channels", "whatsapp", "allowFrom"], ["*"]);
  }
}

export function createDefaultWebsiteWidgetForm(host: OpenClawApp): WebsiteWidgetFormState {
  return {
    gatewayUrl: host.settings.gatewayUrl,
    token: host.settings.token.trim(),
    sessionKey: "widget:site:main",
    title: "Chat with us",
    accentColor: "#0f766e",
    launcherLabel: "Chat",
    placeholder: "Type your message...",
    widgetWidth: "420px",
    widgetHeight: "680px",
    position: "right",
  };
}

export function createDefaultWebsiteWidgetProbe(): WebsiteWidgetProbeState {
  return {
    running: false,
    lastRunAt: null,
    pingMs: null,
    rpcOk: null,
    wsHandshakeOk: null,
    scriptEndpointOk: null,
    frameEndpointOk: null,
    error: null,
  };
}

export function handleWebsiteWidgetFieldChange(
  host: OpenClawApp,
  field: keyof WebsiteWidgetFormState,
  value: string,
) {
  if (field === "position") {
    const next = value === "left" ? "left" : "right";
    host.websiteWidgetForm = { ...host.websiteWidgetForm, position: next };
    return;
  }
  host.websiteWidgetForm = { ...host.websiteWidgetForm, [field]: value };
}

export function handleWebsiteWidgetSnippetInputChange(host: OpenClawApp, next: string) {
  host.websiteWidgetSnippetInput = next;
  host.websiteWidgetSnippetMessage = null;
  host.websiteWidgetSnippetError = null;
}

export function handleWebsiteWidgetSnippetReset(host: OpenClawApp) {
  host.websiteWidgetSnippetInput = "";
  host.websiteWidgetSnippetMessage = null;
  host.websiteWidgetSnippetError = null;
}

export function handleWebsiteWidgetSnippetApply(host: OpenClawApp) {
  const raw = host.websiteWidgetSnippetInput.trim();
  if (!raw) {
    host.websiteWidgetSnippetError = "Paste a snippet first.";
    host.websiteWidgetSnippetMessage = null;
    return;
  }
  try {
    const parsed = parseWidgetSnippet(raw);
    host.websiteWidgetForm = {
      ...host.websiteWidgetForm,
      ...parsed.config,
    };
    host.websiteWidgetSnippetMessage = `Applied ${parsed.fieldCount} field${parsed.fieldCount === 1 ? "" : "s"} from snippet.`;
    host.websiteWidgetSnippetError = null;
    host.websiteWidgetPreviewNonce += 1;
  } catch (err) {
    host.websiteWidgetSnippetError = String(err);
    host.websiteWidgetSnippetMessage = null;
  }
}

export function handleWebsiteWidgetPreviewReload(host: OpenClawApp) {
  host.websiteWidgetPreviewNonce += 1;
}

function resolveControlUiBasePathFromLocation(): string {
  const pathname = location.pathname || "";
  const normalized = pathname.replace(/\/+$/, "");
  if (!normalized || normalized === "/") {
    return "";
  }
  if (normalized.endsWith("/channels")) {
    return normalized.slice(0, -"/channels".length);
  }
  return normalized;
}

function resolveWidgetHttpOrigin(gatewayUrl: string): string {
  try {
    const parsed = new URL(gatewayUrl);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }
    const basePath =
      parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") : "";
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin}${basePath}`;
  } catch {
    return `${location.protocol}//${location.host}${resolveControlUiBasePathFromLocation()}`;
  }
}

function resolveWebsiteAssistEndpoint(host: OpenClawApp, path: string): string {
  return `${resolveWidgetHttpOrigin(host.settings.gatewayUrl)}${path}`;
}

export function handleWebsiteAssistFieldChange(
  host: OpenClawApp,
  field: keyof WebsiteAssistConfigState,
  value: string | boolean,
) {
  updateConfigFormValue(host, ["channels", "websiteassist", field], value);
  host.websiteAssistTestStatus = null;
  host.websiteAssistTestError = null;
}

export function handleWebsiteAssistTestMessageChange(host: OpenClawApp, value: string) {
  host.websiteAssistTestMessage = value;
  host.websiteAssistTestStatus = null;
  host.websiteAssistTestError = null;
}

export async function handleWebsiteAssistSendTest(host: OpenClawApp) {
  if (host.websiteAssistTesting) {
    return;
  }
  const cfg = readWebsiteAssistConfig(host);
  if (!cfg.enabled) {
    host.websiteAssistTestError = "Enable Website Assist first.";
    host.websiteAssistTestStatus = null;
    return;
  }
  if (!cfg.telegramTo.trim()) {
    host.websiteAssistTestError = "Set Telegram target first.";
    host.websiteAssistTestStatus = null;
    return;
  }
  if (!cfg.botToken.trim()) {
    host.websiteAssistTestError = "Set Website Assist bot token first.";
    host.websiteAssistTestStatus = null;
    return;
  }
  const text = host.websiteAssistTestMessage.trim();
  if (!text) {
    host.websiteAssistTestError = "Write a test message first.";
    host.websiteAssistTestStatus = null;
    return;
  }

  host.websiteAssistTesting = true;
  host.websiteAssistTestError = null;
  host.websiteAssistTestStatus = null;

  const endpoint = resolveWebsiteAssistEndpoint(host, "/api/website-assist/telegram");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relayKey: cfg.relayKey,
        to: cfg.telegramTo,
        nodeId: cfg.nodeTag || "control-ui",
        sourceUrl: location.href,
        visitorId: "control-ui-test",
        text,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      telegram?: { messageId?: string };
    } | null;
    if (!response.ok || body?.ok === false) {
      host.websiteAssistTestError = body?.error ?? `Relay failed (${response.status})`;
      host.websiteAssistTestStatus = null;
      return;
    }
    const msgId = body?.telegram?.messageId ? ` (message ${body.telegram.messageId})` : "";
    host.websiteAssistTestStatus = `Forwarded to Telegram${msgId}.`;
    host.websiteAssistTestError = null;
  } catch (err) {
    host.websiteAssistTestError = `Relay failed: ${String(err)}`;
    host.websiteAssistTestStatus = null;
  } finally {
    host.websiteAssistTesting = false;
  }
}

export function handleWebsiteAssistChatInputChange(host: OpenClawApp, value: string) {
  host.websiteAssistChatInput = value;
  host.websiteAssistChatError = null;
}

function createHiddenFileInput(accept: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "-9999px";
  document.body.appendChild(input);
  return input;
}

async function pickFileFromDevice(accept = "image/*,video/*"): Promise<File | null> {
  return await new Promise((resolve) => {
    const input = createHiddenFileInput(accept);
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0] ?? null;
        cleanup();
        resolve(file);
      },
      { once: true },
    );
    input.click();
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function captureTabScreenshotDataUrl(): Promise<{ dataUrl: string; fileName: string }> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== "function"
  ) {
    throw new Error("Screenshot capture is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "browser",
      frameRate: { ideal: 3, max: 10 },
    },
    audio: false,
  });

  try {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error("No video track available for screenshot.");
    }
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to initialize screenshot stream."));
      video.play().catch(reject);
    });

    const width = Math.max(1, Math.trunc(video.videoWidth || window.innerWidth));
    const height = Math.max(1, Math.trunc(video.videoHeight || window.innerHeight));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create screenshot canvas.");
    }
    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Failed to capture screenshot.");
    }
    return {
      dataUrl,
      fileName: `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function temporarilyHideWidget(host: OpenClawApp): () => void {
  const widget = host.renderRoot?.querySelector(".widget-container");
  if (!widget) {
    return () => {};
  }
  const prevVisibility = widget.style.visibility;
  const prevPointerEvents = widget.style.pointerEvents;
  widget.style.visibility = "hidden";
  widget.style.pointerEvents = "none";
  return () => {
    widget.style.visibility = prevVisibility;
    widget.style.pointerEvents = prevPointerEvents;
  };
}

async function uploadWebsiteAssistMedia(
  host: OpenClawApp,
  params: {
    dataUrl: string;
    fileName: string;
    mimeType?: string;
    fallbackUserText: string;
  },
): Promise<void> {
  const cfg = readWebsiteAssistConfig(host);
  const endpoint = resolveWebsiteAssistEndpoint(host, "/api/website-assist/media");
  const caption = host.websiteAssistChatInput.trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      relayKey: cfg.relayKey,
      to: cfg.telegramTo,
      nodeId: cfg.nodeTag || "control-ui",
      sourceUrl: location.href,
      visitorId: "control-ui",
      conversationId: host.websiteAssistChatConversationId,
      text: caption,
      mediaDataUrl: params.dataUrl,
      mediaFileName: params.fileName,
      mediaMimeType: params.mimeType,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    conversationId?: string;
  } | null;
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error ?? `Upload failed (${response.status})`);
  }

  const summaryText = caption
    ? `${params.fallbackUserText}\n\n${caption}`
    : params.fallbackUserText;
  host.websiteAssistChatMessages = [
    ...host.websiteAssistChatMessages,
    {
      id: `local-media-${Date.now()}`,
      role: "user",
      text: summaryText,
      createdAt: Date.now(),
    },
  ];
  host.websiteAssistChatInput = "";
  await handleWebsiteAssistChatRefresh(host);
}

export async function handleWebsiteAssistChatScreenshot(host: OpenClawApp) {
  if (host.websiteAssistMediaSending || host.websiteAssistChatSending) {
    return;
  }
  host.websiteAssistMediaSending = true;
  host.websiteAssistChatError = null;
  const wasMinimized = host.websiteAssistChatMinimized;
  const restoreWidgetVisibility = temporarilyHideWidget(host);
  host.websiteAssistChatMinimized = true;
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const capture = await captureTabScreenshotDataUrl();
    await uploadWebsiteAssistMedia(host, {
      dataUrl: capture.dataUrl,
      fileName: capture.fileName,
      mimeType: "image/png",
      fallbackUserText: "Sent a screenshot.",
    });
  } catch (err) {
    host.websiteAssistChatError = `Screenshot failed: ${String(err)}`;
  } finally {
    restoreWidgetVisibility();
    host.websiteAssistChatMinimized = wasMinimized;
    host.websiteAssistMediaSending = false;
  }
}

export async function handleWebsiteAssistChatUploadFromDevice(host: OpenClawApp) {
  if (host.websiteAssistMediaSending || host.websiteAssistChatSending) {
    return;
  }
  host.websiteAssistMediaSending = true;
  host.websiteAssistChatError = null;
  try {
    const file = await pickFileFromDevice();
    if (!file) {
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    await uploadWebsiteAssistMedia(host, {
      dataUrl,
      fileName: file.name || "upload",
      mimeType: file.type || undefined,
      fallbackUserText: `Sent media: ${file.name || "upload"}`,
    });
  } catch (err) {
    host.websiteAssistChatError = `Upload failed: ${String(err)}`;
  } finally {
    host.websiteAssistMediaSending = false;
  }
}

export async function handleWebsiteAssistChatSend(host: OpenClawApp) {
  if (host.websiteAssistChatSending) {
    return;
  }
  const cfg = readWebsiteAssistConfig(host);
  const text = host.websiteAssistChatInput.trim();
  if (!text) {
    host.websiteAssistChatError = "Type a message first.";
    return;
  }

  host.websiteAssistChatSending = true;
  host.websiteAssistChatError = null;
  const endpoint = resolveWebsiteAssistEndpoint(host, "/api/website-assist/telegram");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relayKey: cfg.relayKey,
        to: cfg.telegramTo,
        nodeId: cfg.nodeTag || "control-ui",
        sourceUrl: location.href,
        visitorId: "control-ui",
        conversationId: host.websiteAssistChatConversationId,
        text,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      conversationId?: string;
    } | null;
    if (!response.ok || body?.ok === false) {
      host.websiteAssistChatError = body?.error ?? `Send failed (${response.status})`;
      return;
    }

    host.websiteAssistChatMessages = [
      ...host.websiteAssistChatMessages,
      {
        id: `local-${Date.now()}`,
        role: "user",
        text,
        createdAt: Date.now(),
      },
    ];
    host.websiteAssistChatInput = "";
    await handleWebsiteAssistChatRefresh(host);
  } catch (err) {
    host.websiteAssistChatError = `Send failed: ${String(err)}`;
  } finally {
    host.websiteAssistChatSending = false;
  }
}

export async function handleWebsiteAssistChatRefresh(
  host: OpenClawApp,
  opts: { silent?: boolean } = {},
) {
  const silent = opts.silent === true;
  if (host.websiteAssistChatRefreshing) {
    return;
  }
  host.websiteAssistChatRefreshing = true;
  host.websiteAssistChatError = null;
  try {
    const endpoint = resolveWebsiteAssistEndpoint(host, "/api/website-assist/messages");
    const params = new URLSearchParams({
      conversationId: host.websiteAssistChatConversationId,
      after: String(host.websiteAssistChatCursor),
      poll: "1",
    });
    const response = await fetch(`${endpoint}?${params.toString()}`);
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      nextCursor?: number;
      messages?: Array<{
        id?: string;
        role?: "user" | "assistant";
        text?: string;
        createdAt?: number;
      }>;
    } | null;
    if (!response.ok || body?.ok === false || !body) {
      if (!silent) {
        host.websiteAssistChatError = body?.error ?? `Refresh failed (${response.status})`;
      }
      return;
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    if (incoming.length > 0) {
      const mapped = incoming
        .filter((entry) => typeof entry?.text === "string" && entry.text.trim().length > 0)
        .map((entry) => ({
          id: entry.id ?? `m-${Date.now()}-${Math.random()}`,
          role: entry.role === "assistant" ? "assistant" : "user",
          text: String(entry.text),
          createdAt:
            typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
              ? entry.createdAt
              : Date.now(),
        }));
      if (mapped.length > 0) {
        const existingIds = new Set(host.websiteAssistChatMessages.map((message) => message.id));
        const deduped = mapped.filter((message) => !existingIds.has(message.id));
        if (deduped.length > 0) {
          host.websiteAssistChatMessages = [...host.websiteAssistChatMessages, ...deduped];
        }
      }
    }

    if (typeof body.nextCursor === "number" && Number.isFinite(body.nextCursor)) {
      host.websiteAssistChatCursor = body.nextCursor;
    }
  } catch (err) {
    if (!silent) {
      host.websiteAssistChatError = `Refresh failed: ${String(err)}`;
    }
  } finally {
    host.websiteAssistChatRefreshing = false;
  }
}

async function fetchStatusWithTimeout(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeWidgetConnect(params: {
  gatewayUrl: string;
  token: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; error?: string }> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(params.gatewayUrl);
    let done = false;
    const timeout = window.setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      try {
        ws.close();
      } catch {
        // noop
      }
      resolve({ ok: false, error: "widget websocket handshake timeout" });
    }, params.timeoutMs);

    const finish = (result: { ok: boolean; error?: string }) => {
      if (done) {
        return;
      }
      done = true;
      window.clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // noop
      }
      resolve(result);
    };

    ws.addEventListener("open", () => {
      const frame = {
        type: "req",
        id: "widget-probe-connect",
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "webchat-ui",
            version: "widget-probe",
            platform: "web",
            mode: "webchat",
            displayName: "Widget Probe",
          },
          role: "operator",
          scopes: [],
          auth: params.token ? { token: params.token, password: params.token } : undefined,
        },
      };
      ws.send(JSON.stringify(frame));
    });

    ws.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(String(event.data ?? "")) as {
          type?: string;
          id?: string;
          ok?: boolean;
          error?: { message?: string };
        };
        if (parsed.type !== "res" || parsed.id !== "widget-probe-connect") {
          return;
        }
        if (parsed.ok) {
          finish({ ok: true });
          return;
        }
        finish({ ok: false, error: parsed.error?.message ?? "widget websocket auth failed" });
      } catch {
        finish({ ok: false, error: "invalid gateway response during widget probe" });
      }
    });

    ws.addEventListener("close", () => {
      if (!done) {
        finish({ ok: false, error: "widget websocket closed before handshake response" });
      }
    });

    ws.addEventListener("error", () => {
      finish({ ok: false, error: "widget websocket network error" });
    });
  });
}

export async function handleWebsiteWidgetProbe(host: OpenClawApp) {
  if (host.websiteWidgetProbe.running) {
    return;
  }

  host.websiteWidgetProbe = {
    ...host.websiteWidgetProbe,
    running: true,
    error: null,
  };

  const nextProbe = createDefaultWebsiteWidgetProbe();
  nextProbe.running = false;
  nextProbe.lastRunAt = Date.now();

  try {
    if (host.client && host.connected) {
      const pingStart = performance.now();
      await host.client.request("health", {});
      nextProbe.rpcOk = true;
      nextProbe.pingMs = performance.now() - pingStart;
    } else {
      nextProbe.rpcOk = false;
      nextProbe.error = "Control UI is not connected to the gateway.";
    }

    const wsToken = host.websiteWidgetForm.token.trim() || host.settings.token.trim();
    const wsProbe = await probeWidgetConnect({
      gatewayUrl: host.websiteWidgetForm.gatewayUrl.trim(),
      token: wsToken,
      timeoutMs: WIDGET_CONNECT_TIMEOUT_MS,
    });
    nextProbe.wsHandshakeOk = wsProbe.ok;
    if (!wsProbe.ok && wsProbe.error) {
      nextProbe.error = wsProbe.error;
    }

    const httpOrigin = resolveWidgetHttpOrigin(host.websiteWidgetForm.gatewayUrl.trim());
    const scriptUrl = `${httpOrigin}/widget/openclaw-widget.js`;
    const frameUrl = `${httpOrigin}/widget/frame`;

    if (new URL(httpOrigin).origin === location.origin) {
      nextProbe.scriptEndpointOk = await fetchStatusWithTimeout(scriptUrl, FETCH_TIMEOUT_MS);
      nextProbe.frameEndpointOk = await fetchStatusWithTimeout(frameUrl, FETCH_TIMEOUT_MS);
    } else {
      nextProbe.scriptEndpointOk = null;
      nextProbe.frameEndpointOk = null;
    }
  } catch (err) {
    nextProbe.error = String(err);
  }

  host.websiteWidgetProbe = nextProbe;
}

function parseValidationErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) {
    return {};
  }
  const errors: Record<string, string> = {};
  for (const entry of details) {
    if (typeof entry !== "string") {
      continue;
    }
    const [rawField, ...rest] = entry.split(":");
    if (!rawField || rest.length === 0) {
      continue;
    }
    const field = rawField.trim();
    const message = rest.join(":").trim();
    if (field && message) {
      errors[field] = message;
    }
  }
  return errors;
}

function resolveNostrAccountId(host: OpenClawApp): string {
  const accounts = host.channelsSnapshot?.channelAccounts?.nostr ?? [];
  return accounts[0]?.accountId ?? host.nostrProfileAccountId ?? "default";
}

function buildNostrProfileUrl(accountId: string, suffix = ""): string {
  return `/api/channels/nostr/${encodeURIComponent(accountId)}/profile${suffix}`;
}

function resolveGatewayHttpAuthHeader(host: OpenClawApp): string | null {
  const deviceToken = host.hello?.auth?.deviceToken?.trim();
  if (deviceToken) {
    return `Bearer ${deviceToken}`;
  }
  const token = host.settings.token.trim();
  if (token) {
    return `Bearer ${token}`;
  }
  const password = host.password.trim();
  if (password) {
    return `Bearer ${password}`;
  }
  return null;
}

function buildGatewayHttpHeaders(host: OpenClawApp): Record<string, string> {
  const authorization = resolveGatewayHttpAuthHeader(host);
  return authorization ? { Authorization: authorization } : {};
}

export function handleNostrProfileEdit(
  host: OpenClawApp,
  accountId: string,
  profile: NostrProfile | null,
) {
  host.nostrProfileAccountId = accountId;
  host.nostrProfileFormState = createNostrProfileFormState(profile ?? undefined);
}

export function handleNostrProfileCancel(host: OpenClawApp) {
  host.nostrProfileFormState = null;
  host.nostrProfileAccountId = null;
}

export function handleNostrProfileFieldChange(
  host: OpenClawApp,
  field: keyof NostrProfile,
  value: string,
) {
  const state = host.nostrProfileFormState;
  if (!state) {
    return;
  }
  host.nostrProfileFormState = {
    ...state,
    values: {
      ...state.values,
      [field]: value,
    },
    fieldErrors: {
      ...state.fieldErrors,
      [field]: "",
    },
  };
}

export function handleNostrProfileToggleAdvanced(host: OpenClawApp) {
  const state = host.nostrProfileFormState;
  if (!state) {
    return;
  }
  host.nostrProfileFormState = {
    ...state,
    showAdvanced: !state.showAdvanced,
  };
}

export async function handleNostrProfileSave(host: OpenClawApp) {
  const state = host.nostrProfileFormState;
  if (!state || state.saving) {
    return;
  }
  const accountId = resolveNostrAccountId(host);

  host.nostrProfileFormState = {
    ...state,
    saving: true,
    error: null,
    success: null,
    fieldErrors: {},
  };

  try {
    const response = await fetch(buildNostrProfileUrl(accountId), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildGatewayHttpHeaders(host),
      },
      body: JSON.stringify(state.values),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      details?: unknown;
      persisted?: boolean;
    } | null;

    if (!response.ok || data?.ok === false || !data) {
      const errorMessage = data?.error ?? `Profile update failed (${response.status})`;
      host.nostrProfileFormState = {
        ...state,
        saving: false,
        error: errorMessage,
        success: null,
        fieldErrors: parseValidationErrors(data?.details),
      };
      return;
    }

    if (!data.persisted) {
      host.nostrProfileFormState = {
        ...state,
        saving: false,
        error: "Profile publish failed on all relays.",
        success: null,
      };
      return;
    }

    host.nostrProfileFormState = {
      ...state,
      saving: false,
      error: null,
      success: "Profile published to relays.",
      fieldErrors: {},
      original: { ...state.values },
    };
    await loadChannels(host, true);
  } catch (err) {
    host.nostrProfileFormState = {
      ...state,
      saving: false,
      error: `Profile update failed: ${String(err)}`,
      success: null,
    };
  }
}

export async function handleNostrProfileImport(host: OpenClawApp) {
  const state = host.nostrProfileFormState;
  if (!state || state.importing) {
    return;
  }
  const accountId = resolveNostrAccountId(host);

  host.nostrProfileFormState = {
    ...state,
    importing: true,
    error: null,
    success: null,
  };

  try {
    const response = await fetch(buildNostrProfileUrl(accountId, "/import"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildGatewayHttpHeaders(host),
      },
      body: JSON.stringify({ autoMerge: true }),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      imported?: NostrProfile;
      merged?: NostrProfile;
      saved?: boolean;
    } | null;

    if (!response.ok || data?.ok === false || !data) {
      const errorMessage = data?.error ?? `Profile import failed (${response.status})`;
      host.nostrProfileFormState = {
        ...state,
        importing: false,
        error: errorMessage,
        success: null,
      };
      return;
    }

    const merged = data.merged ?? data.imported ?? null;
    const nextValues = merged ? { ...state.values, ...merged } : state.values;
    const showAdvanced = Boolean(
      nextValues.banner || nextValues.website || nextValues.nip05 || nextValues.lud16,
    );

    host.nostrProfileFormState = {
      ...state,
      importing: false,
      values: nextValues,
      error: null,
      success: data.saved
        ? "Profile imported from relays. Review and publish."
        : "Profile imported. Review and publish.",
      showAdvanced,
    };

    if (data.saved) {
      await loadChannels(host, true);
    }
  } catch (err) {
    host.nostrProfileFormState = {
      ...state,
      importing: false,
      error: `Profile import failed: ${String(err)}`,
      success: null,
    };
  }
}
