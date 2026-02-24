import WebSocket from "ws";
import type { RuntimeEnv } from "../../../runtime.js";
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
import { info, success } from "../../../globals.js";
import { renderQrPngBase64 } from "../../qr-image.js";
import { buildWahaWsCandidates, connectWahaWebSocket } from "./ws.js";

type ActiveWahaLogin = {
  accountId: string;
  id: string;
  startedAt: number;
  ws: WebSocket;
  qrDataUrl?: string;
  connected: boolean;
  error?: string;
  waitPromise: Promise<void>;
  resolveWait: () => void;
  rejectWait: (err: Error) => void;
};

type WahaEnvelope = {
  event?: string;
  payload?: Record<string, unknown>;
};

type WahaSessionInfo = {
  name?: string;
  status?: string;
};

const ACTIVE_WAHA_LOGIN_TTL_MS = 3 * 60_000;
const activeWahaLogins = new Map<string, ActiveWahaLogin>();

function readString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input : undefined;
}

function decodeWsMessageData(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof Buffer) {
    return input.toString("utf8");
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input).toString("utf8");
  }
  if (Array.isArray(input) && input.every((chunk) => chunk instanceof Buffer)) {
    return Buffer.concat(input).toString("utf8");
  }
  return null;
}

function resolveWahaConfig(account: ResolvedWhatsAppAccount): {
  baseUrl: string;
  apiKey?: string;
  session: string;
} {
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

function isConnectedStatus(status?: string): boolean {
  const value = (status ?? "").trim().toUpperCase();
  return value === "WORKING" || value === "CONNECTED" || value === "AUTHENTICATED";
}

function isFailureStatus(status?: string): boolean {
  const value = (status ?? "").trim().toUpperCase();
  return value === "FAILED" || value === "STOPPED" || value === "DISCONNECTED";
}

function isLoginFresh(login: ActiveWahaLogin): boolean {
  return Date.now() - login.startedAt < ACTIVE_WAHA_LOGIN_TTL_MS;
}

function closeLoginSocket(login: ActiveWahaLogin) {
  try {
    login.ws.removeAllListeners();
    login.ws.close();
  } catch {
    // ignore
  }
}

function resetWahaLogin(accountId: string) {
  const current = activeWahaLogins.get(accountId);
  if (!current) {
    return;
  }
  closeLoginSocket(current);
  activeWahaLogins.delete(accountId);
}

async function tryStartSession(account: ResolvedWhatsAppAccount): Promise<void> {
  const { baseUrl, apiKey, session } = resolveWahaConfig(account);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }

  const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: "/api/sessions/start", body: { name: session } },
    { path: `/api/sessions/${encodeURIComponent(session)}/start`, body: {} },
  ];
  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(attempt.body),
      });
      if (response.ok) {
        return;
      }
      if (response.status === 404 || response.status === 405) {
        continue;
      }
      return;
    } catch {
      // ignore and try next endpoint
    }
  }
}

async function listSessions(account: ResolvedWhatsAppAccount): Promise<WahaSessionInfo[]> {
  const { baseUrl, apiKey } = resolveWahaConfig(account);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  const response = await fetch(`${baseUrl}/api/sessions`, { headers });
  if (!response.ok) {
    return [];
  }
  try {
    const parsed = (await response.json()) as unknown;
    return Array.isArray(parsed) ? (parsed as WahaSessionInfo[]) : [];
  } catch {
    return [];
  }
}

async function getSessionStatus(account: ResolvedWhatsAppAccount): Promise<string | null> {
  const sessions = await listSessions(account);
  const sessionName = resolveWahaConfig(account).session;
  const match = sessions.find((entry) => String(entry.name ?? "").trim() === sessionName);
  const status = readString(match?.status);
  return status ?? null;
}

async function fetchSessionQrDataUrl(account: ResolvedWhatsAppAccount): Promise<string | null> {
  const { baseUrl, apiKey, session } = resolveWahaConfig(account);
  const authHeaders: Record<string, string> = {};
  if (apiKey) {
    authHeaders["X-Api-Key"] = apiKey;
  }

  const imageUrl = new URL(`${baseUrl}/api/${encodeURIComponent(session)}/auth/qr`);
  imageUrl.searchParams.set("format", "image");
  if (apiKey) {
    imageUrl.searchParams.set("x-api-key", apiKey);
  }
  const imageResponse = await fetch(imageUrl.toString(), {
    headers: {
      ...authHeaders,
      Accept: "image/png,image/*;q=0.9,*/*;q=0.8",
    },
  });
  if (imageResponse.ok) {
    const contentType = imageResponse.headers.get("content-type")?.trim() || "image/png";
    if (contentType.toLowerCase().startsWith("image/")) {
      const bytes = await imageResponse.arrayBuffer();
      if (bytes && bytes.byteLength > 0) {
        const base64 = Buffer.from(bytes).toString("base64");
        return `data:${contentType};base64,${base64}`;
      }
    }
  }

  const rawUrl = new URL(`${baseUrl}/api/${encodeURIComponent(session)}/auth/qr`);
  rawUrl.searchParams.set("format", "raw");
  if (apiKey) {
    rawUrl.searchParams.set("x-api-key", apiKey);
  }
  const rawResponse = await fetch(rawUrl.toString(), {
    headers: {
      ...authHeaders,
      Accept: "application/json",
    },
  });
  if (!rawResponse.ok) {
    return null;
  }
  const rawPayload = (await rawResponse.json().catch(() => null)) as {
    value?: unknown;
    qr?: unknown;
  } | null;
  const qrRaw = readString(rawPayload?.value) ?? readString(rawPayload?.qr);
  if (!qrRaw) {
    return null;
  }
  const base64 = await renderQrPngBase64(qrRaw);
  return `data:image/png;base64,${base64}`;
}

async function responseToImageDataUrl(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type")?.trim() || "image/png";
  if (contentType.toLowerCase().startsWith("image/")) {
    const bytes = await response.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) {
      return null;
    }
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${contentType};base64,${base64}`;
  }
  const payload = (await response.json().catch(() => null)) as {
    screenshot?: unknown;
    data?: unknown;
    base64?: unknown;
    url?: unknown;
  } | null;
  const maybeBase64 =
    readString(payload?.screenshot) ?? readString(payload?.data) ?? readString(payload?.base64);
  if (maybeBase64) {
    return `data:image/png;base64,${maybeBase64}`;
  }
  return null;
}

export async function fetchWahaSessionScreenshot(params: {
  account: ResolvedWhatsAppAccount;
}): Promise<{ imageDataUrl?: string; message: string }> {
  const { baseUrl, apiKey, session } = resolveWahaConfig(params.account);
  const authHeaders: Record<string, string> = {};
  if (apiKey) {
    authHeaders["X-Api-Key"] = apiKey;
  }
  const candidates: string[] = [];
  {
    const url = new URL(`${baseUrl}/api/screenshot`);
    url.searchParams.set("session", session);
    if (apiKey) {
      url.searchParams.set("x-api-key", apiKey);
    }
    candidates.push(url.toString());
  }
  {
    const url = new URL(`${baseUrl}/api/${encodeURIComponent(session)}/screenshot`);
    if (apiKey) {
      url.searchParams.set("x-api-key", apiKey);
    }
    candidates.push(url.toString());
  }
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: {
          ...authHeaders,
          Accept: "image/png,image/*;q=0.9,application/json;q=0.8,*/*;q=0.7",
        },
      });
      if (response.ok) {
        const imageDataUrl = await responseToImageDataUrl(response);
        if (imageDataUrl) {
          return { imageDataUrl, message: "WAHA screenshot captured." };
        }
        return {
          message: "WAHA screenshot endpoint responded but did not return image bytes.",
        };
      }
      if (response.status === 404 || response.status === 405) {
        continue;
      }
      const payload = await parseJsonResponse(response);
      const detail = readString((payload as { message?: unknown } | null)?.message);
      return {
        message: `WAHA screenshot failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
      };
    } catch (err) {
      return { message: `WAHA screenshot failed: ${String(err)}` };
    }
  }
  return {
    message:
      'WAHA screenshot endpoint not available (tried "/api/screenshot" and "/api/{session}/screenshot").',
  };
}

function createWaitPromise() {
  let resolveWait: (() => void) | null = null;
  let rejectWait: ((err: Error) => void) | null = null;
  const waitPromise = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });
  // Login wait is consumed by a separate command; suppress unhandled rejection
  // warnings if the starter command exits before wait is called.
  void waitPromise.catch(() => {});
  return {
    waitPromise,
    resolveWait: () => resolveWait?.(),
    rejectWait: (err: Error) => rejectWait?.(err),
  };
}

export async function startWahaLoginWithQr(params: {
  account: ResolvedWhatsAppAccount;
  timeoutMs?: number;
  force?: boolean;
  mode?: "qr" | "request-code";
  phoneNumber?: string;
  runtime: RuntimeEnv;
  verbose?: boolean;
}): Promise<{ qrDataUrl?: string; message: string }> {
  const { account, runtime } = params;
  if (params.mode === "request-code") {
    return await requestWahaAuthCode({
      account,
      runtime,
      phoneNumber: params.phoneNumber,
    });
  }
  const existing = activeWahaLogins.get(account.accountId);
  if (existing && isLoginFresh(existing)) {
    if (existing.connected) {
      return { message: "✅ WAHA session is already connected." };
    }
    if (existing.qrDataUrl) {
      return {
        qrDataUrl: existing.qrDataUrl,
        message: "QR already active. Scan it in WhatsApp → Linked Devices.",
      };
    }
  }

  if (params.force) {
    resetWahaLogin(account.accountId);
  }

  const cfg = resolveWahaConfig(account);
  const headers: Record<string, string> = {};
  if (cfg.apiKey) {
    headers["X-Api-Key"] = cfg.apiKey;
  }
  const ws = await connectWahaWebSocket(buildWahaWsCandidates(cfg.baseUrl), {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    queryParams: [
      ["session", cfg.session],
      ["events", "session.status"],
      ["events", "session.qr"],
      ["events", "message"],
      ...(cfg.apiKey ? ([["x-api-key", cfg.apiKey]] as Array<[string, string]>) : []),
    ],
  });
  const wait = createWaitPromise();
  const login: ActiveWahaLogin = {
    accountId: account.accountId,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now(),
    ws,
    connected: false,
    waitPromise: wait.waitPromise,
    resolveWait: wait.resolveWait,
    rejectWait: wait.rejectWait,
  };
  activeWahaLogins.set(account.accountId, login);

  ws.on("message", async (raw) => {
    let envelope: WahaEnvelope | null = null;
    try {
      const decoded = decodeWsMessageData(raw);
      if (!decoded) {
        return;
      }
      envelope = JSON.parse(decoded) as WahaEnvelope;
    } catch {
      return;
    }
    if (!envelope || typeof envelope !== "object") {
      return;
    }
    const payload = envelope.payload ?? {};
    const status = readString(payload.status);
    if (isConnectedStatus(status)) {
      login.connected = true;
      login.resolveWait();
      return;
    }
    if (isFailureStatus(status)) {
      const message = `WAHA session status: ${status}`;
      login.error = message;
      login.rejectWait(new Error(message));
      return;
    }
    const qrRaw =
      readString(payload.qr) ??
      readString(payload.qrCode) ??
      readString(payload.qrcode) ??
      readString((payload as { data?: { qr?: string; qrCode?: string } }).data?.qr) ??
      readString((payload as { data?: { qr?: string; qrCode?: string } }).data?.qrCode);
    if (!qrRaw || login.qrDataUrl) {
      return;
    }
    const base64 = await renderQrPngBase64(qrRaw);
    login.qrDataUrl = `data:image/png;base64,${base64}`;
    runtime.log(info("WhatsApp QR received from WAHA."));
  });

  ws.on("close", (code) => {
    if (login.connected) {
      return;
    }
    runtime.log(
      info(`WAHA websocket closed during login (code ${code}); continuing with REST polling.`),
    );
  });

  ws.on("error", (err) => {
    if (login.connected) {
      return;
    }
    runtime.log(info(`WAHA websocket login error: ${String(err)}; continuing with REST polling.`));
  });

  await tryStartSession(account);

  const timeoutMs = Math.max(params.timeoutMs ?? 30_000, 1000);
  const start = Date.now();
  let lastQrFetchAt = 0;
  while (Date.now() - start < timeoutMs) {
    const polledStatus = await getSessionStatus(account).catch(() => null);
    if (isConnectedStatus(polledStatus ?? undefined)) {
      login.connected = true;
      login.resolveWait();
      return { message: "✅ WAHA session is already connected." };
    }
    const shouldTryQrFetch = !login.qrDataUrl && Date.now() - lastQrFetchAt >= 2_000;
    if (shouldTryQrFetch) {
      lastQrFetchAt = Date.now();
      const qrDataUrl = await fetchSessionQrDataUrl(account).catch(() => null);
      if (qrDataUrl) {
        login.qrDataUrl = qrDataUrl;
        runtime.log(info("WhatsApp QR fetched from WAHA REST endpoint."));
      }
    }
    if (login.connected) {
      return { message: "✅ WAHA session is already connected." };
    }
    if (login.qrDataUrl) {
      return {
        qrDataUrl: login.qrDataUrl,
        message: "Scan this QR in WhatsApp → Linked Devices.",
      };
    }
    if (login.error) {
      return { message: `Failed to start WAHA login: ${login.error}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const statusAfterTimeout = await getSessionStatus(account).catch(() => null);
  if (String(statusAfterTimeout ?? "").toUpperCase() === "SCAN_QR_CODE") {
    if (!login.qrDataUrl) {
      const qrDataUrl = await fetchSessionQrDataUrl(account).catch(() => null);
      if (qrDataUrl) {
        login.qrDataUrl = qrDataUrl;
        return {
          qrDataUrl,
          message: "Scan this QR in WhatsApp → Linked Devices.",
        };
      }
    }
    return {
      message:
        "WAHA session is waiting for QR scan (SCAN_QR_CODE). Open WAHA dashboard and scan, then run login again.",
    };
  }

  return {
    message: "Waiting for WAHA QR event. Keep WAHA running and try wait.",
  };
}

function buildAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  return headers;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function compactJson(value: unknown, max = 220): string {
  try {
    const text = JSON.stringify(value);
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max)}...`;
  } catch {
    return String(value);
  }
}

export async function requestWahaAuthCode(params: {
  account: ResolvedWhatsAppAccount;
  runtime: RuntimeEnv;
  phoneNumber?: string;
}): Promise<{ message: string }> {
  const { baseUrl, session, apiKey } = resolveWahaConfig(params.account);
  const phoneNumber = params.phoneNumber?.trim();
  if (!phoneNumber) {
    return { message: "Phone number is required for WAHA request-code." };
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...buildAuthHeaders(apiKey),
  };
  const body: { phoneNumber: string; method: null } = {
    phoneNumber,
    method: null,
  };
  const url = `${baseUrl}/api/${encodeURIComponent(session)}/auth/request-code`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { message: `WAHA request-code failed: ${String(err)}` };
  }
  const payload = await parseJsonResponse(response);
  if (response.ok) {
    const code = readString((payload as { code?: unknown } | null)?.code);
    if (code) {
      return { message: `Pairing code requested. Use this code in WhatsApp: ${code}` };
    }
    const message = readString((payload as { message?: unknown } | null)?.message);
    return { message: message ?? "Pairing code requested from WAHA." };
  }
  const parsedMessage = readString((payload as { message?: unknown } | null)?.message);
  const detail = parsedMessage ?? compactJson(payload);
  return {
    message: `WAHA request-code failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
  };
}

export async function stopWahaSession(params: {
  account: ResolvedWhatsAppAccount;
}): Promise<{ stopped: boolean; message: string }> {
  const { baseUrl, session, apiKey } = resolveWahaConfig(params.account);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...buildAuthHeaders(apiKey),
  };
  const attempts: Array<{
    path: string;
    method: "POST";
    body?: Record<string, unknown>;
  }> = [
    { path: `/api/sessions/${encodeURIComponent(session)}/stop`, method: "POST", body: {} },
    { path: "/api/sessions/stop", method: "POST", body: { name: session } },
  ];
  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}${attempt.path}`, {
        method: attempt.method,
        headers,
        body: attempt.body === undefined ? undefined : JSON.stringify(attempt.body),
      });
      if (response.ok) {
        resetWahaLogin(params.account.accountId);
        return { stopped: true, message: `WAHA session "${session}" stopped.` };
      }
      if (response.status === 404 || response.status === 405) {
        continue;
      }
      const payload = await parseJsonResponse(response);
      const detail = readString((payload as { message?: unknown } | null)?.message);
      return {
        stopped: false,
        message: `WAHA stop failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
      };
    } catch (err) {
      return { stopped: false, message: `WAHA stop failed: ${String(err)}` };
    }
  }
  return {
    stopped: false,
    message:
      'WAHA stop endpoint not available (tried "/api/sessions/{session}/stop", "/api/sessions/stop").',
  };
}

export async function logoutWahaSession(params: {
  account: ResolvedWhatsAppAccount;
}): Promise<{ loggedOut: boolean; message: string }> {
  const { baseUrl, session, apiKey } = resolveWahaConfig(params.account);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...buildAuthHeaders(apiKey),
  };
  const attempts: Array<{ path: string; body?: Record<string, unknown> }> = [
    { path: `/api/sessions/${encodeURIComponent(session)}/logout`, body: {} },
    { path: "/api/sessions/logout", body: { name: session } },
  ];
  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers,
        body: attempt.body === undefined ? undefined : JSON.stringify(attempt.body),
      });
      if (response.ok) {
        resetWahaLogin(params.account.accountId);
        return { loggedOut: true, message: `WAHA session "${session}" logged out.` };
      }
      if (response.status === 404 || response.status === 405) {
        continue;
      }
      const payload = await parseJsonResponse(response);
      const detail = readString((payload as { message?: unknown } | null)?.message);
      return {
        loggedOut: false,
        message: `WAHA logout failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
      };
    } catch (err) {
      return { loggedOut: false, message: `WAHA logout failed: ${String(err)}` };
    }
  }
  return {
    loggedOut: false,
    message:
      'WAHA logout endpoint not available (tried "/api/sessions/{session}/logout", "/api/sessions/logout").',
  };
}

export async function waitForWahaLogin(params: {
  account: ResolvedWhatsAppAccount;
  timeoutMs?: number;
  runtime: RuntimeEnv;
}): Promise<{ connected: boolean; message: string }> {
  const login = activeWahaLogins.get(params.account.accountId);
  if (!login) {
    const status = await getSessionStatus(params.account).catch(() => null);
    if (isConnectedStatus(status ?? undefined)) {
      return { connected: true, message: "✅ Linked! WhatsApp is ready." };
    }
    if (isFailureStatus(status ?? undefined)) {
      return { connected: false, message: `WAHA login failed: session status ${status}` };
    }
    const statusHint = status ? ` (current status: ${status})` : "";
    return {
      connected: false,
      message: `No active WAHA login in progress.${statusHint}`,
    };
  }
  if (!isLoginFresh(login)) {
    resetWahaLogin(params.account.accountId);
    return { connected: false, message: "The WAHA login session expired. Generate a new QR." };
  }
  if (login.connected) {
    params.runtime.log(success("✅ WAHA session connected."));
    resetWahaLogin(params.account.accountId);
    return { connected: true, message: "✅ Linked! WhatsApp is ready." };
  }
  if (login.error) {
    const msg = `WAHA login failed: ${login.error}`;
    resetWahaLogin(params.account.accountId);
    return { connected: false, message: msg };
  }

  const timeoutMs = Math.max(params.timeoutMs ?? 120_000, 1000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getSessionStatus(params.account).catch(() => null);
    if (isConnectedStatus(status ?? undefined)) {
      params.runtime.log(success("✅ WAHA session connected."));
      resetWahaLogin(params.account.accountId);
      return { connected: true, message: "✅ Linked! WhatsApp is ready." };
    }
    if (isFailureStatus(status ?? undefined)) {
      const msg = `WAHA login failed: session status ${status}`;
      resetWahaLogin(params.account.accountId);
      return { connected: false, message: msg };
    }
    const remaining = deadline - Date.now();
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), Math.min(remaining, 2_000)),
    );
    const result = await Promise.race([login.waitPromise.then(() => "done"), timeout]);
    if (result === "done") {
      break;
    }
  }
  if (!login.connected) {
    const status = await getSessionStatus(params.account).catch(() => null);
    const statusHint = status ? ` (current status: ${status})` : "";
    return {
      connected: false,
      message: `Still waiting for WAHA login. Try again after scanning QR.${statusHint}`,
    };
  }
  if (login.connected) {
    params.runtime.log(success("✅ WAHA session connected."));
    resetWahaLogin(params.account.accountId);
    return { connected: true, message: "✅ Linked! WhatsApp is ready." };
  }
  const msg = login.error
    ? `WAHA login failed: ${login.error}`
    : "WAHA login ended without connection.";
  resetWahaLogin(params.account.accountId);
  return { connected: false, message: msg };
}
