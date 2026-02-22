import { t as __exportAll } from "./rolldown-runtime-Cbj13DAv.js";
import { I as success, O as danger, V as getChildLogger, W as toPinoLikeLogger, k as info, u as defaultRuntime } from "./subsystem-QRNIBE7-.js";
import { b as resolveUserPath, c as ensureDir } from "./utils-CrauP1IK.js";
import { s as logInfo } from "./exec-BDyx_yxc.js";
import { t as formatCliCommand } from "./command-format-ChfKqObn.js";
import { F as VERSION, i as loadConfig } from "./config-Ck3rODdu.js";
import { c as maybeRestoreCredsFromBackup, d as resolveDefaultWebAuthDir, f as resolveWebCredsBackupPath, m as webAuthExists, n as resolveWhatsAppAccount, p as resolveWebCredsPath, s as logoutWeb, u as readWebSelfId } from "./accounts-BAuuDFhZ.js";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import WebSocket$1 from "ws";
import { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import QRCodeModule from "qrcode-terminal/vendor/QRCode/index.js";
import QRErrorCorrectLevelModule from "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js";
import { deflateSync } from "node:zlib";

//#region src/web/session.ts
let credsSaveQueue = Promise.resolve();
function enqueueSaveCreds(authDir, saveCreds, logger) {
	credsSaveQueue = credsSaveQueue.then(() => safeSaveCreds(authDir, saveCreds, logger)).catch((err) => {
		logger.warn({ error: String(err) }, "WhatsApp creds save queue error");
	});
}
function readCredsJsonRaw(filePath) {
	try {
		if (!fs.existsSync(filePath)) return null;
		const stats = fs.statSync(filePath);
		if (!stats.isFile() || stats.size <= 1) return null;
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}
async function safeSaveCreds(authDir, saveCreds, logger) {
	try {
		const credsPath = resolveWebCredsPath(authDir);
		const backupPath = resolveWebCredsBackupPath(authDir);
		const raw = readCredsJsonRaw(credsPath);
		if (raw) try {
			JSON.parse(raw);
			fs.copyFileSync(credsPath, backupPath);
			try {
				fs.chmodSync(backupPath, 384);
			} catch {}
		} catch {}
	} catch {}
	try {
		await Promise.resolve(saveCreds());
		try {
			fs.chmodSync(resolveWebCredsPath(authDir), 384);
		} catch {}
	} catch (err) {
		logger.warn({ error: String(err) }, "failed saving WhatsApp creds");
	}
}
/**
* Create a Baileys socket backed by the multi-file auth store we keep on disk.
* Consumers can opt into QR printing for interactive login flows.
*/
async function createWaSocket(printQr, verbose, opts = {}) {
	const logger = toPinoLikeLogger(getChildLogger({ module: "baileys" }, { level: verbose ? "info" : "silent" }), verbose ? "info" : "silent");
	const authDir = resolveUserPath(opts.authDir ?? resolveDefaultWebAuthDir());
	await ensureDir(authDir);
	const sessionLogger = getChildLogger({ module: "web-session" });
	maybeRestoreCredsFromBackup(authDir);
	const { state, saveCreds } = await useMultiFileAuthState(authDir);
	const { version } = await fetchLatestBaileysVersion();
	const sock = makeWASocket({
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger)
		},
		version,
		logger,
		printQRInTerminal: false,
		browser: [
			"openclaw",
			"cli",
			VERSION
		],
		syncFullHistory: false,
		markOnlineOnConnect: false
	});
	sock.ev.on("creds.update", () => enqueueSaveCreds(authDir, saveCreds, sessionLogger));
	sock.ev.on("connection.update", (update) => {
		try {
			const { connection, lastDisconnect, qr } = update;
			if (qr) {
				opts.onQr?.(qr);
				if (printQr) {
					console.log("Scan this QR in WhatsApp (Linked Devices):");
					qrcode.generate(qr, { small: true });
				}
			}
			if (connection === "close") {
				if (getStatusCode(lastDisconnect?.error) === DisconnectReason.loggedOut) console.error(danger(`WhatsApp session logged out. Run: ${formatCliCommand("openclaw channels login")}`));
			}
			if (connection === "open" && verbose) console.log(success("WhatsApp Web connected."));
		} catch (err) {
			sessionLogger.error({ error: String(err) }, "connection.update handler error");
		}
	});
	if (sock.ws && typeof sock.ws.on === "function") sock.ws.on("error", (err) => {
		sessionLogger.error({ error: String(err) }, "WebSocket error");
	});
	return sock;
}
async function waitForWaConnection(sock) {
	return new Promise((resolve, reject) => {
		const evWithOff = sock.ev;
		const handler = (...args) => {
			const update = args[0] ?? {};
			if (update.connection === "open") {
				evWithOff.off?.("connection.update", handler);
				resolve();
			}
			if (update.connection === "close") {
				evWithOff.off?.("connection.update", handler);
				reject(update.lastDisconnect ?? /* @__PURE__ */ new Error("Connection closed"));
			}
		};
		sock.ev.on("connection.update", handler);
	});
}
function getStatusCode(err) {
	return err?.output?.statusCode ?? err?.status;
}
function safeStringify(value, limit = 800) {
	try {
		const seen = /* @__PURE__ */ new WeakSet();
		const raw = JSON.stringify(value, (_key, v) => {
			if (typeof v === "bigint") return v.toString();
			if (typeof v === "function") {
				const maybeName = v.name;
				return `[Function ${typeof maybeName === "string" && maybeName.length > 0 ? maybeName : "anonymous"}]`;
			}
			if (typeof v === "object" && v) {
				if (seen.has(v)) return "[Circular]";
				seen.add(v);
			}
			return v;
		}, 2);
		if (!raw) return String(value);
		return raw.length > limit ? `${raw.slice(0, limit)}…` : raw;
	} catch {
		return String(value);
	}
}
function extractBoomDetails(err) {
	if (!err || typeof err !== "object") return null;
	const output = err?.output;
	if (!output || typeof output !== "object") return null;
	const payload = output.payload;
	const statusCode = typeof output.statusCode === "number" ? output.statusCode : typeof payload?.statusCode === "number" ? payload.statusCode : void 0;
	const error = typeof payload?.error === "string" ? payload.error : void 0;
	const message = typeof payload?.message === "string" ? payload.message : void 0;
	if (!statusCode && !error && !message) return null;
	return {
		statusCode,
		error,
		message
	};
}
function formatError(err) {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	if (!err || typeof err !== "object") return String(err);
	const boom = extractBoomDetails(err) ?? extractBoomDetails(err?.error) ?? extractBoomDetails(err?.lastDisconnect?.error);
	const status = boom?.statusCode ?? getStatusCode(err);
	const code = err?.code;
	const codeText = typeof code === "string" || typeof code === "number" ? String(code) : void 0;
	const message = [
		boom?.message,
		typeof err?.message === "string" ? err.message : void 0,
		typeof err?.error?.message === "string" ? err.error?.message : void 0
	].filter((v) => Boolean(v && v.trim().length > 0))[0];
	const pieces = [];
	if (typeof status === "number") pieces.push(`status=${status}`);
	if (boom?.error) pieces.push(boom.error);
	if (message) pieces.push(message);
	if (codeText) pieces.push(`code=${codeText}`);
	if (pieces.length > 0) return pieces.join(" ");
	return safeStringify(err);
}

//#endregion
//#region src/web/transports/waha/ws.ts
function toWsUrl(rawBaseUrl, path) {
	const url = new URL(rawBaseUrl);
	if (url.protocol === "http:") url.protocol = "ws:";
	else if (url.protocol === "https:") url.protocol = "wss:";
	url.pathname = path;
	url.search = "";
	return url;
}
function buildWahaWsCandidates(baseUrl) {
	return [toWsUrl(baseUrl, "/ws"), toWsUrl(baseUrl, "/api/ws")];
}
async function connectWahaWebSocket(candidates, opts) {
	let lastError = null;
	for (const candidate of candidates) {
		const url = new URL(candidate.toString());
		for (const [key, value] of opts.queryParams ?? []) url.searchParams.append(key, value);
		try {
			return await new Promise((resolve, reject) => {
				const socket = new WebSocket$1(url.toString(), { headers: opts.headers });
				const cleanup = () => {
					socket.removeListener("open", onOpen);
					socket.removeListener("error", onError);
				};
				const onOpen = () => {
					cleanup();
					resolve(socket);
				};
				const onError = (err) => {
					cleanup();
					try {
						socket.close();
					} catch {}
					reject(err);
				};
				socket.once("open", onOpen);
				socket.once("error", onError);
			});
		} catch (err) {
			lastError = err;
		}
	}
	throw lastError instanceof Error ? lastError : /* @__PURE__ */ new Error(`Failed to connect WAHA websocket on candidate URLs.`);
}

//#endregion
//#region src/media/png-encode.ts
/**
* Minimal PNG encoder for generating simple RGBA images without native dependencies.
* Used for QR codes, live probes, and other programmatic image generation.
*/
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		table[i] = c >>> 0;
	}
	return table;
})();
/** Compute CRC32 checksum for a buffer (used in PNG chunk encoding). */
function crc32(buf) {
	let crc = 4294967295;
	for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 255] ^ crc >>> 8;
	return (crc ^ 4294967295) >>> 0;
}
/** Create a PNG chunk with type, data, and CRC. */
function pngChunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const crc = crc32(Buffer.concat([typeBuf, data]));
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc, 0);
	return Buffer.concat([
		len,
		typeBuf,
		data,
		crcBuf
	]);
}
/** Write a pixel to an RGBA buffer. Ignores out-of-bounds writes. */
function fillPixel(buf, x, y, width, r, g, b, a = 255) {
	if (x < 0 || y < 0 || x >= width) return;
	const idx = (y * width + x) * 4;
	if (idx < 0 || idx + 3 >= buf.length) return;
	buf[idx] = r;
	buf[idx + 1] = g;
	buf[idx + 2] = b;
	buf[idx + 3] = a;
}
/** Encode an RGBA buffer as a PNG image. */
function encodePngRgba(buffer, width, height) {
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let row = 0; row < height; row += 1) {
		const rawOffset = row * (stride + 1);
		raw[rawOffset] = 0;
		buffer.copy(raw, rawOffset + 1, row * stride, row * stride + stride);
	}
	const compressed = deflateSync(raw);
	const signature = Buffer.from([
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	return Buffer.concat([
		signature,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", compressed),
		pngChunk("IEND", Buffer.alloc(0))
	]);
}

//#endregion
//#region src/web/qr-image.ts
const QRCode = QRCodeModule;
const QRErrorCorrectLevel = QRErrorCorrectLevelModule;
function createQrMatrix(input) {
	const qr = new QRCode(-1, QRErrorCorrectLevel.L);
	qr.addData(input);
	qr.make();
	return qr;
}
async function renderQrPngBase64(input, opts = {}) {
	const { scale = 6, marginModules = 4 } = opts;
	const qr = createQrMatrix(input);
	const modules = qr.getModuleCount();
	const size = (modules + marginModules * 2) * scale;
	const buf = Buffer.alloc(size * size * 4, 255);
	for (let row = 0; row < modules; row += 1) for (let col = 0; col < modules; col += 1) {
		if (!qr.isDark(row, col)) continue;
		const startX = (col + marginModules) * scale;
		const startY = (row + marginModules) * scale;
		for (let y = 0; y < scale; y += 1) {
			const pixelY = startY + y;
			for (let x = 0; x < scale; x += 1) fillPixel(buf, startX + x, pixelY, size, 0, 0, 0, 255);
		}
	}
	return encodePngRgba(buf, size, size).toString("base64");
}

//#endregion
//#region src/web/transports/guard.ts
function assertBaileysTransport(transportId, operation) {
	if (transportId === "baileys") return;
	throw new Error(`WhatsApp transport "${transportId}" does not support ${operation} yet. Use channels.whatsapp.transport="baileys" for now.`);
}

//#endregion
//#region src/web/transports/waha/login.ts
const ACTIVE_WAHA_LOGIN_TTL_MS = 3 * 6e4;
const activeWahaLogins = /* @__PURE__ */ new Map();
function readString(input) {
	return typeof input === "string" && input.trim() ? input : void 0;
}
function resolveWahaConfig(account) {
	const baseUrl = account.waha?.baseUrl?.trim();
	if (!baseUrl) throw new Error(`WAHA transport selected for account "${account.accountId}" but channels.whatsapp.waha.baseUrl is missing.`);
	return {
		baseUrl: baseUrl.replace(/\/+$/, ""),
		apiKey: account.waha?.apiKey?.trim() || void 0,
		session: account.waha?.session?.trim() || "default"
	};
}
function isConnectedStatus(status) {
	const value = (status ?? "").trim().toUpperCase();
	return value === "WORKING" || value === "CONNECTED" || value === "AUTHENTICATED";
}
function isFailureStatus(status) {
	const value = (status ?? "").trim().toUpperCase();
	return value === "FAILED" || value === "STOPPED" || value === "DISCONNECTED";
}
function isLoginFresh$1(login) {
	return Date.now() - login.startedAt < ACTIVE_WAHA_LOGIN_TTL_MS;
}
function closeLoginSocket(login) {
	try {
		login.ws.removeAllListeners();
		login.ws.close();
	} catch {}
}
function resetWahaLogin(accountId) {
	const current = activeWahaLogins.get(accountId);
	if (!current) return;
	closeLoginSocket(current);
	activeWahaLogins.delete(accountId);
}
async function tryStartSession(account) {
	const { baseUrl, apiKey, session } = resolveWahaConfig(account);
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json"
	};
	if (apiKey) headers["X-Api-Key"] = apiKey;
	const attempts = [
		{
			path: "/api/sessions/start",
			body: { name: session }
		},
		{
			path: "/api/session/start",
			body: { name: session }
		},
		{
			path: `/api/sessions/${encodeURIComponent(session)}/start`,
			body: {}
		}
	];
	for (const attempt of attempts) try {
		const response = await fetch(`${baseUrl}${attempt.path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(attempt.body)
		});
		if (response.ok) return;
		if (response.status === 404 || response.status === 405) continue;
		return;
	} catch {}
}
async function listSessions(account) {
	const { baseUrl, apiKey } = resolveWahaConfig(account);
	const url = new URL(`${baseUrl}/api/sessions`);
	if (apiKey) url.searchParams.set("x-api-key", apiKey);
	const headers = { Accept: "application/json" };
	if (apiKey) headers["X-Api-Key"] = apiKey;
	const response = await fetch(url.toString(), { headers });
	if (!response.ok) return [];
	try {
		const parsed = await response.json();
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
async function getSessionStatus(account) {
	const sessions = await listSessions(account);
	const sessionName = resolveWahaConfig(account).session;
	return readString(sessions.find((entry) => String(entry.name ?? "").trim() === sessionName)?.status) ?? null;
}
async function fetchSessionQrDataUrl(account) {
	const { baseUrl, apiKey, session } = resolveWahaConfig(account);
	const authHeaders = {};
	if (apiKey) authHeaders["X-Api-Key"] = apiKey;
	const imageUrl = new URL(`${baseUrl}/api/${encodeURIComponent(session)}/auth/qr`);
	imageUrl.searchParams.set("format", "image");
	if (apiKey) imageUrl.searchParams.set("x-api-key", apiKey);
	const imageResponse = await fetch(imageUrl.toString(), { headers: {
		...authHeaders,
		Accept: "image/png,image/*;q=0.9,*/*;q=0.8"
	} });
	if (imageResponse.ok) {
		const contentType = imageResponse.headers.get("content-type")?.trim() || "image/png";
		if (contentType.toLowerCase().startsWith("image/")) {
			const bytes = await imageResponse.arrayBuffer();
			if (bytes && bytes.byteLength > 0) return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
		}
	}
	const rawUrl = new URL(`${baseUrl}/api/${encodeURIComponent(session)}/auth/qr`);
	rawUrl.searchParams.set("format", "raw");
	if (apiKey) rawUrl.searchParams.set("x-api-key", apiKey);
	const rawResponse = await fetch(rawUrl.toString(), { headers: {
		...authHeaders,
		Accept: "application/json"
	} });
	if (!rawResponse.ok) return null;
	const rawPayload = await rawResponse.json().catch(() => null);
	const qrRaw = readString(rawPayload?.value) ?? readString(rawPayload?.qr);
	if (!qrRaw) return null;
	return `data:image/png;base64,${await renderQrPngBase64(qrRaw)}`;
}
function createWaitPromise() {
	let resolveWait = null;
	let rejectWait = null;
	const waitPromise = new Promise((resolve, reject) => {
		resolveWait = resolve;
		rejectWait = reject;
	});
	waitPromise.catch(() => {});
	return {
		waitPromise,
		resolveWait: () => resolveWait?.(),
		rejectWait: (err) => rejectWait?.(err)
	};
}
async function startWahaLoginWithQr(params) {
	const { account, runtime } = params;
	const existing = activeWahaLogins.get(account.accountId);
	if (existing && isLoginFresh$1(existing)) {
		if (existing.connected) return { message: "✅ WAHA session is already connected." };
		if (existing.qrDataUrl) return {
			qrDataUrl: existing.qrDataUrl,
			message: "QR already active. Scan it in WhatsApp → Linked Devices."
		};
	}
	if (params.force) resetWahaLogin(account.accountId);
	const cfg = resolveWahaConfig(account);
	const headers = {};
	if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;
	const ws = await connectWahaWebSocket(buildWahaWsCandidates(cfg.baseUrl), {
		headers: Object.keys(headers).length > 0 ? headers : void 0,
		queryParams: [
			["session", cfg.session],
			["events", "session.status"],
			["events", "session.qr"],
			["events", "message"],
			...cfg.apiKey ? [["x-api-key", cfg.apiKey]] : []
		]
	});
	const wait = createWaitPromise();
	const login = {
		accountId: account.accountId,
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		startedAt: Date.now(),
		ws,
		connected: false,
		waitPromise: wait.waitPromise,
		resolveWait: wait.resolveWait,
		rejectWait: wait.rejectWait
	};
	activeWahaLogins.set(account.accountId, login);
	ws.on("message", async (raw) => {
		let envelope = null;
		try {
			envelope = JSON.parse(String(raw));
		} catch {
			return;
		}
		if (!envelope || typeof envelope !== "object") return;
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
		const qrRaw = readString(payload.qr) ?? readString(payload.qrCode) ?? readString(payload.qrcode) ?? readString(payload.data?.qr) ?? readString(payload.data?.qrCode);
		if (!qrRaw || login.qrDataUrl) return;
		login.qrDataUrl = `data:image/png;base64,${await renderQrPngBase64(qrRaw)}`;
		runtime.log(info("WhatsApp QR received from WAHA."));
	});
	ws.on("close", (code) => {
		if (login.connected) return;
		runtime.log(info(`WAHA websocket closed during login (code ${code}); continuing with REST polling.`));
	});
	ws.on("error", (err) => {
		if (login.connected) return;
		runtime.log(info(`WAHA websocket login error: ${String(err)}; continuing with REST polling.`));
	});
	await tryStartSession(account);
	const timeoutMs = Math.max(params.timeoutMs ?? 3e4, 1e3);
	const start = Date.now();
	let lastQrFetchAt = 0;
	while (Date.now() - start < timeoutMs) {
		if (isConnectedStatus(await getSessionStatus(account).catch(() => null) ?? void 0)) {
			login.connected = true;
			login.resolveWait();
			return { message: "✅ WAHA session is already connected." };
		}
		if (!login.qrDataUrl && Date.now() - lastQrFetchAt >= 2e3) {
			lastQrFetchAt = Date.now();
			const qrDataUrl = await fetchSessionQrDataUrl(account).catch(() => null);
			if (qrDataUrl) {
				login.qrDataUrl = qrDataUrl;
				runtime.log(info("WhatsApp QR fetched from WAHA REST endpoint."));
			}
		}
		if (login.connected) return { message: "✅ WAHA session is already connected." };
		if (login.qrDataUrl) return {
			qrDataUrl: login.qrDataUrl,
			message: "Scan this QR in WhatsApp → Linked Devices."
		};
		if (login.error) return { message: `Failed to start WAHA login: ${login.error}` };
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
					message: "Scan this QR in WhatsApp → Linked Devices."
				};
			}
		}
		return { message: "WAHA session is waiting for QR scan (SCAN_QR_CODE). Open WAHA dashboard and scan, then run login again." };
	}
	return { message: "Waiting for WAHA QR event. Keep WAHA running and try wait." };
}
async function waitForWahaLogin(params) {
	const login = activeWahaLogins.get(params.account.accountId);
	if (!login) return {
		connected: false,
		message: "No active WAHA login in progress."
	};
	if (!isLoginFresh$1(login)) {
		resetWahaLogin(params.account.accountId);
		return {
			connected: false,
			message: "The WAHA login session expired. Generate a new QR."
		};
	}
	if (login.connected) {
		params.runtime.log(success("✅ WAHA session connected."));
		resetWahaLogin(params.account.accountId);
		return {
			connected: true,
			message: "✅ Linked! WhatsApp is ready."
		};
	}
	if (login.error) {
		const msg = `WAHA login failed: ${login.error}`;
		resetWahaLogin(params.account.accountId);
		return {
			connected: false,
			message: msg
		};
	}
	const timeoutMs = Math.max(params.timeoutMs ?? 12e4, 1e3);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const status = await getSessionStatus(params.account).catch(() => null);
		if (isConnectedStatus(status ?? void 0)) {
			params.runtime.log(success("✅ WAHA session connected."));
			resetWahaLogin(params.account.accountId);
			return {
				connected: true,
				message: "✅ Linked! WhatsApp is ready."
			};
		}
		if (isFailureStatus(status ?? void 0)) {
			const msg = `WAHA login failed: session status ${status}`;
			resetWahaLogin(params.account.accountId);
			return {
				connected: false,
				message: msg
			};
		}
		const remaining = deadline - Date.now();
		const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), Math.min(remaining, 2e3)));
		if (await Promise.race([login.waitPromise.then(() => "done"), timeout]) === "done") break;
	}
	if (!login.connected) {
		const status = await getSessionStatus(params.account).catch(() => null);
		return {
			connected: false,
			message: `Still waiting for WAHA login. Try again after scanning QR.${status ? ` (current status: ${status})` : ""}`
		};
	}
	if (login.connected) {
		params.runtime.log(success("✅ WAHA session connected."));
		resetWahaLogin(params.account.accountId);
		return {
			connected: true,
			message: "✅ Linked! WhatsApp is ready."
		};
	}
	const msg = login.error ? `WAHA login failed: ${login.error}` : "WAHA login ended without connection.";
	resetWahaLogin(params.account.accountId);
	return {
		connected: false,
		message: msg
	};
}

//#endregion
//#region src/web/login-qr.ts
var login_qr_exports = /* @__PURE__ */ __exportAll({
	startWebLoginWithQr: () => startWebLoginWithQr,
	waitForWebLogin: () => waitForWebLogin
});
const ACTIVE_LOGIN_TTL_MS = 3 * 6e4;
const activeLogins = /* @__PURE__ */ new Map();
function closeSocket(sock) {
	try {
		sock.ws?.close();
	} catch {}
}
async function resetActiveLogin(accountId, reason) {
	const login = activeLogins.get(accountId);
	if (login) {
		closeSocket(login.sock);
		activeLogins.delete(accountId);
	}
	if (reason) logInfo(reason);
}
function isLoginFresh(login) {
	return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}
function attachLoginWaiter(accountId, login) {
	login.waitPromise = waitForWaConnection(login.sock).then(() => {
		const current = activeLogins.get(accountId);
		if (current?.id === login.id) current.connected = true;
	}).catch((err) => {
		const current = activeLogins.get(accountId);
		if (current?.id !== login.id) return;
		current.error = formatError(err);
		current.errorStatus = getStatusCode(err);
	});
}
async function restartLoginSocket(login, runtime) {
	if (login.restartAttempted) return false;
	login.restartAttempted = true;
	runtime.log(info("WhatsApp asked for a restart after pairing (code 515); retrying connection once…"));
	closeSocket(login.sock);
	try {
		login.sock = await createWaSocket(false, login.verbose, { authDir: login.authDir });
		login.connected = false;
		login.error = void 0;
		login.errorStatus = void 0;
		attachLoginWaiter(login.accountId, login);
		return true;
	} catch (err) {
		login.error = formatError(err);
		login.errorStatus = getStatusCode(err);
		return false;
	}
}
async function startWebLoginWithQr(opts = {}) {
	const runtime = opts.runtime ?? defaultRuntime;
	const account = resolveWhatsAppAccount({
		cfg: loadConfig(),
		accountId: opts.accountId
	});
	if (account.transport === "waha") return await startWahaLoginWithQr({
		account,
		timeoutMs: opts.timeoutMs,
		force: opts.force,
		runtime,
		verbose: opts.verbose
	});
	assertBaileysTransport(account.transport, "QR login");
	const hasWeb = await webAuthExists(account.authDir);
	const selfId = readWebSelfId(account.authDir);
	if (hasWeb && !opts.force) return { message: `WhatsApp is already linked (${selfId.e164 ?? selfId.jid ?? "unknown"}). Say “relink” if you want a fresh QR.` };
	const existing = activeLogins.get(account.accountId);
	if (existing && isLoginFresh(existing) && existing.qrDataUrl) return {
		qrDataUrl: existing.qrDataUrl,
		message: "QR already active. Scan it in WhatsApp → Linked Devices."
	};
	await resetActiveLogin(account.accountId);
	let resolveQr = null;
	let rejectQr = null;
	const qrPromise = new Promise((resolve, reject) => {
		resolveQr = resolve;
		rejectQr = reject;
	});
	const qrTimer = setTimeout(() => {
		rejectQr?.(/* @__PURE__ */ new Error("Timed out waiting for WhatsApp QR"));
	}, Math.max(opts.timeoutMs ?? 3e4, 5e3));
	let sock;
	let pendingQr = null;
	try {
		sock = await createWaSocket(false, Boolean(opts.verbose), {
			authDir: account.authDir,
			onQr: (qr) => {
				if (pendingQr) return;
				pendingQr = qr;
				const current = activeLogins.get(account.accountId);
				if (current && !current.qr) current.qr = qr;
				clearTimeout(qrTimer);
				runtime.log(info("WhatsApp QR received."));
				resolveQr?.(qr);
			}
		});
	} catch (err) {
		clearTimeout(qrTimer);
		await resetActiveLogin(account.accountId);
		return { message: `Failed to start WhatsApp login: ${String(err)}` };
	}
	const login = {
		accountId: account.accountId,
		authDir: account.authDir,
		isLegacyAuthDir: account.isLegacyAuthDir,
		id: randomUUID(),
		sock,
		startedAt: Date.now(),
		connected: false,
		waitPromise: Promise.resolve(),
		restartAttempted: false,
		verbose: Boolean(opts.verbose)
	};
	activeLogins.set(account.accountId, login);
	if (pendingQr && !login.qr) login.qr = pendingQr;
	attachLoginWaiter(account.accountId, login);
	let qr;
	try {
		qr = await qrPromise;
	} catch (err) {
		clearTimeout(qrTimer);
		await resetActiveLogin(account.accountId);
		return { message: `Failed to get QR: ${String(err)}` };
	}
	login.qrDataUrl = `data:image/png;base64,${await renderQrPngBase64(qr)}`;
	return {
		qrDataUrl: login.qrDataUrl,
		message: "Scan this QR in WhatsApp → Linked Devices."
	};
}
async function waitForWebLogin(opts = {}) {
	const runtime = opts.runtime ?? defaultRuntime;
	const account = resolveWhatsAppAccount({
		cfg: loadConfig(),
		accountId: opts.accountId
	});
	if (account.transport === "waha") return await waitForWahaLogin({
		account,
		timeoutMs: opts.timeoutMs,
		runtime
	});
	assertBaileysTransport(account.transport, "QR login wait");
	const activeLogin = activeLogins.get(account.accountId);
	if (!activeLogin) return {
		connected: false,
		message: "No active WhatsApp login in progress."
	};
	const login = activeLogin;
	if (!isLoginFresh(login)) {
		await resetActiveLogin(account.accountId);
		return {
			connected: false,
			message: "The login QR expired. Ask me to generate a new one."
		};
	}
	const timeoutMs = Math.max(opts.timeoutMs ?? 12e4, 1e3);
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return {
			connected: false,
			message: "Still waiting for the QR scan. Let me know when you’ve scanned it."
		};
		const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), remaining));
		if (await Promise.race([login.waitPromise.then(() => "done"), timeout]) === "timeout") return {
			connected: false,
			message: "Still waiting for the QR scan. Let me know when you’ve scanned it."
		};
		if (login.error) {
			if (login.errorStatus === DisconnectReason.loggedOut) {
				await logoutWeb({
					authDir: login.authDir,
					isLegacyAuthDir: login.isLegacyAuthDir,
					runtime
				});
				const message = "WhatsApp reported the session is logged out. Cleared cached web session; please scan a new QR.";
				await resetActiveLogin(account.accountId, message);
				runtime.log(danger(message));
				return {
					connected: false,
					message
				};
			}
			if (login.errorStatus === 515) {
				if (await restartLoginSocket(login, runtime) && isLoginFresh(login)) continue;
			}
			const message = `WhatsApp login failed: ${login.error}`;
			await resetActiveLogin(account.accountId, message);
			runtime.log(danger(message));
			return {
				connected: false,
				message
			};
		}
		if (login.connected) {
			const message = "✅ Linked! WhatsApp is ready.";
			runtime.log(success(message));
			await resetActiveLogin(account.accountId);
			return {
				connected: true,
				message
			};
		}
		return {
			connected: false,
			message: "Login ended without a connection."
		};
	}
}

//#endregion
export { buildWahaWsCandidates as a, formatError as c, assertBaileysTransport as i, getStatusCode as l, startWebLoginWithQr as n, connectWahaWebSocket as o, waitForWebLogin as r, createWaSocket as s, login_qr_exports as t, waitForWaConnection as u };