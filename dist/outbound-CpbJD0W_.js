import { t as __exportAll } from "./rolldown-runtime-Cbj13DAv.js";
import { V as getChildLogger, t as createSubsystemLogger } from "./subsystem-QRNIBE7-.js";
import { E as toWhatsappJid, l as escapeRegExp } from "./utils-CrauP1IK.js";
import { i as loadConfig } from "./config-Ck3rODdu.js";
import { n as resolveWhatsAppAccount } from "./accounts-BAuuDFhZ.js";
import { i as loadWebMedia, o as resolveMarkdownTableMode } from "./ir-yXHrpImp.js";
import { n as normalizePollInput } from "./polls-yr-D4xmo.js";
import { t as convertMarkdownTables } from "./tables-KO_e25Qh.js";
import { n as requireActiveWebListener } from "./active-listener-BJiRFSQu.js";
import { randomUUID } from "node:crypto";

//#region src/markdown/whatsapp.ts
/**
* Convert standard Markdown formatting to WhatsApp-compatible markup.
*
* WhatsApp uses its own formatting syntax:
*   bold:          *text*
*   italic:        _text_
*   strikethrough: ~text~
*   monospace:     ```text```
*
* Standard Markdown uses:
*   bold:          **text** or __text__
*   italic:        *text* or _text_
*   strikethrough: ~~text~~
*   code:          `text` (inline) or ```text``` (block)
*
* The conversion preserves fenced code blocks and inline code,
* then converts bold and strikethrough markers.
*/
/** Placeholder tokens used during conversion to protect code spans. */
const FENCE_PLACEHOLDER = "\0FENCE";
const INLINE_CODE_PLACEHOLDER = "\0CODE";
/**
* Convert standard Markdown bold/italic/strikethrough to WhatsApp formatting.
*
* Order of operations matters:
* 1. Protect fenced code blocks (```...```) — already WhatsApp-compatible
* 2. Protect inline code (`...`) — leave as-is
* 3. Convert **bold** → *bold* and __bold__ → *bold*
* 4. Convert ~~strike~~ → ~strike~
* 5. Restore protected spans
*
* Italic *text* and _text_ are left alone since WhatsApp uses _text_ for italic
* and single * is already WhatsApp bold — no conversion needed for single markers.
*/
function markdownToWhatsApp(text) {
	if (!text) return text;
	const fences = [];
	let result = text.replace(/```[\s\S]*?```/g, (match) => {
		fences.push(match);
		return `${FENCE_PLACEHOLDER}${fences.length - 1}`;
	});
	const inlineCodes = [];
	result = result.replace(/`[^`\n]+`/g, (match) => {
		inlineCodes.push(match);
		return `${INLINE_CODE_PLACEHOLDER}${inlineCodes.length - 1}`;
	});
	result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");
	result = result.replace(/__(.+?)__/g, "*$1*");
	result = result.replace(/~~(.+?)~~/g, "~$1~");
	result = result.replace(new RegExp(`${escapeRegExp(INLINE_CODE_PLACEHOLDER)}(\\d+)`, "g"), (_, idx) => inlineCodes[Number(idx)] ?? "");
	result = result.replace(new RegExp(`${escapeRegExp(FENCE_PLACEHOLDER)}(\\d+)`, "g"), (_, idx) => fences[Number(idx)] ?? "");
	return result;
}

//#endregion
//#region src/web/transports/waha/client.ts
function resolveWahaEndpoint(account) {
	const baseUrl = account.waha?.baseUrl?.trim();
	if (!baseUrl) throw new Error(`WAHA transport selected for account "${account.accountId}" but channels.whatsapp.waha.baseUrl is missing.`);
	return {
		baseUrl: baseUrl.replace(/\/+$/, ""),
		apiKey: account.waha?.apiKey?.trim() || void 0,
		session: account.waha?.session?.trim() || "default"
	};
}
function toWahaChatId(to) {
	const jid = toWhatsappJid(to);
	if (jid.endsWith("@s.whatsapp.net")) return `${jid.slice(0, -15)}@c.us`;
	return jid;
}
function joinUrl(baseUrl, path) {
	return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
function pickMessageId(payload) {
	if (!payload || typeof payload !== "object") return "unknown";
	const directCandidates = [payload.id, payload.messageId];
	for (const candidate of directCandidates) if (typeof candidate === "string" && candidate.trim()) return candidate;
	const nested = payload.id?._serialized;
	if (typeof nested === "string" && nested.trim()) return nested;
	return "unknown";
}
async function wahaRequest(account, path, opts) {
	const endpoint = resolveWahaEndpoint(account);
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json"
	};
	if (endpoint.apiKey) headers["X-Api-Key"] = endpoint.apiKey;
	const response = await fetch(joinUrl(endpoint.baseUrl, path), {
		method: opts.method ?? "POST",
		headers,
		body: opts.body === void 0 ? void 0 : JSON.stringify(opts.body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = await response.text();
		} catch {}
		const suffix = detail.trim() ? ` ${detail.trim()}` : "";
		throw new Error(`WAHA request failed (${response.status} ${response.statusText})${suffix}`);
	}
	if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
	try {
		return await response.json();
	} catch {
		return null;
	}
}
async function sendTextViaWaha(account, to, text) {
	return { messageId: pickMessageId(await wahaRequest(account, "/api/sendText", {
		method: "POST",
		body: {
			session: resolveWahaEndpoint(account).session,
			chatId: toWahaChatId(to),
			text
		}
	})) };
}
async function sendMediaViaWaha(account, to, text, mediaBuffer, mediaType, fileName) {
	const endpoint = resolveWahaEndpoint(account);
	const chatId = toWahaChatId(to);
	const file = {
		mimetype: mediaType,
		filename: fileName ?? "file",
		data: mediaBuffer.toString("base64")
	};
	if (mediaType.startsWith("image/")) return { messageId: pickMessageId(await wahaRequest(account, "/api/sendImage", {
		method: "POST",
		body: {
			session: endpoint.session,
			chatId,
			file,
			caption: text || void 0
		}
	})) };
	if (mediaType.startsWith("audio/")) {
		const convert = !mediaType.toLowerCase().includes("opus");
		return { messageId: pickMessageId(await wahaRequest(account, "/api/sendVoice", {
			method: "POST",
			body: {
				session: endpoint.session,
				chatId,
				file,
				convert
			}
		})) };
	}
	if (mediaType.startsWith("video/")) return { messageId: pickMessageId(await wahaRequest(account, "/api/sendVideo", {
		method: "POST",
		body: {
			session: endpoint.session,
			chatId,
			file,
			caption: text || void 0,
			convert: false
		}
	})) };
	return { messageId: pickMessageId(await wahaRequest(account, "/api/sendFile", {
		method: "POST",
		body: {
			session: endpoint.session,
			chatId,
			file,
			caption: text || void 0
		}
	})) };
}
async function sendPollViaWaha(account, to, poll) {
	return { messageId: pickMessageId(await wahaRequest(account, "/api/sendPoll", {
		method: "POST",
		body: {
			session: resolveWahaEndpoint(account).session,
			chatId: toWahaChatId(to),
			poll: {
				name: poll.question,
				options: poll.options,
				multipleAnswers: (poll.maxSelections ?? 1) > 1
			}
		}
	})) };
}
async function sendReactionViaWaha(account, messageId, emoji) {
	await wahaRequest(account, "/api/reaction", {
		method: "PUT",
		body: {
			session: resolveWahaEndpoint(account).session,
			messageId,
			reaction: emoji
		}
	});
}

//#endregion
//#region src/web/outbound.ts
var outbound_exports = /* @__PURE__ */ __exportAll({
	sendMessageWhatsApp: () => sendMessageWhatsApp,
	sendPollWhatsApp: () => sendPollWhatsApp,
	sendReactionWhatsApp: () => sendReactionWhatsApp
});
const outboundLog = createSubsystemLogger("gateway/channels/whatsapp").child("outbound");
async function sendMessageWhatsApp(to, body, options) {
	let text = body;
	const correlationId = randomUUID();
	const startedAt = Date.now();
	const cfg = loadConfig();
	const account = resolveWhatsAppAccount({
		cfg,
		accountId: options.accountId
	});
	const resolvedAccountId = account.accountId;
	const tableMode = resolveMarkdownTableMode({
		cfg,
		channel: "whatsapp",
		accountId: resolvedAccountId ?? options.accountId
	});
	text = convertMarkdownTables(text ?? "", tableMode);
	text = markdownToWhatsApp(text);
	const logger = getChildLogger({
		module: "web-outbound",
		correlationId,
		to
	});
	try {
		const jid = toWhatsappJid(to);
		let mediaBuffer;
		let mediaType;
		let documentFileName;
		if (options.mediaUrl) {
			const media = await loadWebMedia(options.mediaUrl);
			const caption = text || void 0;
			mediaBuffer = media.buffer;
			mediaType = media.contentType;
			if (media.kind === "audio") mediaType = media.contentType === "audio/ogg" ? "audio/ogg; codecs=opus" : media.contentType ?? "application/octet-stream";
			else if (media.kind === "video") text = caption ?? "";
			else if (media.kind === "image") text = caption ?? "";
			else {
				text = caption ?? "";
				documentFileName = media.fileName;
			}
		}
		outboundLog.info(`Sending message -> ${jid}${options.mediaUrl ? " (media)" : ""}`);
		logger.info({
			jid,
			hasMedia: Boolean(options.mediaUrl)
		}, "sending message");
		const messageId = (account.transport === "waha" ? mediaBuffer && mediaType ? await sendMediaViaWaha(account, to, text, mediaBuffer, mediaType, documentFileName) : await sendTextViaWaha(account, to, text) : await (async () => {
			const { listener: active } = requireActiveWebListener(options.accountId);
			await active.sendComposingTo(to);
			const accountId = Boolean(options.accountId?.trim()) ? resolvedAccountId : void 0;
			const sendOptions = options.gifPlayback || accountId || documentFileName ? {
				...options.gifPlayback ? { gifPlayback: true } : {},
				...documentFileName ? { fileName: documentFileName } : {},
				accountId
			} : void 0;
			return sendOptions ? await active.sendMessage(to, text, mediaBuffer, mediaType, sendOptions) : await active.sendMessage(to, text, mediaBuffer, mediaType);
		})())?.messageId ?? "unknown";
		const durationMs = Date.now() - startedAt;
		outboundLog.info(`Sent message ${messageId} -> ${jid}${options.mediaUrl ? " (media)" : ""} (${durationMs}ms)`);
		logger.info({
			jid,
			messageId
		}, "sent message");
		return {
			messageId,
			toJid: jid
		};
	} catch (err) {
		logger.error({
			err: String(err),
			to,
			hasMedia: Boolean(options.mediaUrl)
		}, "failed to send via web session");
		throw err;
	}
}
async function sendReactionWhatsApp(chatJid, messageId, emoji, options) {
	const correlationId = randomUUID();
	const account = resolveWhatsAppAccount({
		cfg: loadConfig(),
		accountId: options.accountId
	});
	const logger = getChildLogger({
		module: "web-outbound",
		correlationId,
		chatJid,
		messageId
	});
	try {
		const jid = toWhatsappJid(chatJid);
		outboundLog.info(`Sending reaction "${emoji}" -> message ${messageId}`);
		logger.info({
			chatJid: jid,
			messageId,
			emoji
		}, "sending reaction");
		if (account.transport === "waha") await sendReactionViaWaha(account, messageId, emoji);
		else {
			const { listener: active } = requireActiveWebListener(options.accountId);
			await active.sendReaction(chatJid, messageId, emoji, options.fromMe ?? false, options.participant);
		}
		outboundLog.info(`Sent reaction "${emoji}" -> message ${messageId}`);
		logger.info({
			chatJid: jid,
			messageId,
			emoji
		}, "sent reaction");
	} catch (err) {
		logger.error({
			err: String(err),
			chatJid,
			messageId,
			emoji
		}, "failed to send reaction via web session");
		throw err;
	}
}
async function sendPollWhatsApp(to, poll, options) {
	const correlationId = randomUUID();
	const startedAt = Date.now();
	const account = resolveWhatsAppAccount({
		cfg: loadConfig(),
		accountId: options.accountId
	});
	const logger = getChildLogger({
		module: "web-outbound",
		correlationId,
		to
	});
	try {
		const jid = toWhatsappJid(to);
		const normalized = normalizePollInput(poll, { maxOptions: 12 });
		outboundLog.info(`Sending poll -> ${jid}: "${normalized.question}"`);
		logger.info({
			jid,
			question: normalized.question,
			optionCount: normalized.options.length,
			maxSelections: normalized.maxSelections
		}, "sending poll");
		const messageId = (account.transport === "waha" ? await sendPollViaWaha(account, to, normalized) : await requireActiveWebListener(options.accountId).listener.sendPoll(to, normalized))?.messageId ?? "unknown";
		const durationMs = Date.now() - startedAt;
		outboundLog.info(`Sent poll ${messageId} -> ${jid} (${durationMs}ms)`);
		logger.info({
			jid,
			messageId
		}, "sent poll");
		return {
			messageId,
			toJid: jid
		};
	} catch (err) {
		logger.error({
			err: String(err),
			to,
			question: poll.question
		}, "failed to send poll via web session");
		throw err;
	}
}

//#endregion
export { sendPollViaWaha as a, markdownToWhatsApp as c, sendMediaViaWaha as i, sendMessageWhatsApp as n, sendReactionViaWaha as o, sendReactionWhatsApp as r, sendTextViaWaha as s, outbound_exports as t };