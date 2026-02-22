import "./paths-DVBShlw6.js";
import { u as defaultRuntime } from "./subsystem-QRNIBE7-.js";
import "./utils-CrauP1IK.js";
import "./pi-embedded-helpers-BF3lzKDp.js";
import { S as resolveGatewaySessionStoreTarget, b as loadSessionEntry, mt as requestHeartbeatNow, wr as enqueueSystemEvent, x as pruneLegacyStoreKeys } from "./reply-DLSmOGEW.js";
import { u as normalizeMainKey } from "./session-key-BWxPj0z_.js";
import "./exec-BDyx_yxc.js";
import "./agent-scope-C6CjuRmH.js";
import "./model-selection-BS39NEIx.js";
import "./github-copilot-token-CiF5Iyi2.js";
import "./boolean-BgXe2hyu.js";
import "./env-BSjH4KuP.js";
import { i as loadConfig } from "./config-Ck3rODdu.js";
import "./manifest-registry-DFR7U7LS.js";
import { r as normalizeChannelId } from "./plugins-DsO8Iwb1.js";
import { l as updateSessionStore } from "./sessions-Bp-SHSt0.js";
import "./runner-rq38bqqY.js";
import "./image-B0wemo9Q.js";
import "./pi-model-discovery-EwKVHlZB.js";
import "./sandbox-DpsZ4Z8T.js";
import "./chrome-B7PxQCIs.js";
import "./skills-rhZUKavR.js";
import "./routes-CO66_L62.js";
import "./server-context-BbYiofHK.js";
import "./image-ops-DRbAl1rE.js";
import "./store-Bax5zJE5.js";
import "./ports-BtTWJ8BR.js";
import "./message-channel-BA527_ar.js";
import "./logging-CcxUDNcI.js";
import "./accounts-BAuuDFhZ.js";
import "./send-Cf6gPnum.js";
import "./send-Hn0zhgzD.js";
import "./paths-BuQbsACT.js";
import "./tool-images-D0MTnajJ.js";
import "./redact-Bb36nvYe.js";
import "./tool-display-CPUH9JiE.js";
import "./fetch-K5fbHXR-.js";
import "./deliver-BKbF8JWV.js";
import "./dispatcher-BnnZ1a1Q.js";
import "./send-BxEZRY3i.js";
import "./manager-BUBtKxZt.js";
import "./sqlite-BuYteze1.js";
import "./retry-UPMRcKEG.js";
import "./common-ChcBkIpL.js";
import "./ir-yXHrpImp.js";
import "./render-DIvHuHqk.js";
import "./commands-registry-D4WAa86d.js";
import "./client-BN_YnVAw.js";
import "./call-xPOYP6Je.js";
import "./channel-activity-Ds_g7OEt.js";
import "./tables-KO_e25Qh.js";
import "./send-CuL6Zoti.js";
import "./links-DKVbBuQN.js";
import "./progress-DitCFjx_.js";
import "./pairing-store-YfXJI0z8.js";
import "./pi-tools.policy-BDNn715b.js";
import "./send-VWhZP-zV.js";
import "./onboard-helpers-3NUo1HP2.js";
import "./prompt-style-ciYaT-3f.js";
import "./pairing-labels-CuGqRgA7.js";
import "./session-cost-usage-CbsU4YHL.js";
import "./nodes-screen-ByxT3UnR.js";
import "./auth-DT6fiHDK.js";
import "./control-auth-BOcMBh1o.js";
import "./control-service-D9LBwUBV.js";
import "./channel-selection-ClCNM-3h.js";
import "./delivery-queue-46I6nBfA.js";
import { t as agentCommand } from "./agent-DjB4Xxga.js";
import { t as formatForLog } from "./ws-log-CoLymvIq.js";
import { randomUUID } from "node:crypto";

//#region src/gateway/server-node-events.ts
const handleNodeEvent = async (ctx, nodeId, evt) => {
	switch (evt.event) {
		case "voice.transcript": {
			if (!evt.payloadJSON) return;
			let payload;
			try {
				payload = JSON.parse(evt.payloadJSON);
			} catch {
				return;
			}
			const obj = typeof payload === "object" && payload !== null ? payload : {};
			const text = typeof obj.text === "string" ? obj.text.trim() : "";
			if (!text) return;
			if (text.length > 2e4) return;
			const sessionKeyRaw = typeof obj.sessionKey === "string" ? obj.sessionKey.trim() : "";
			const cfg = loadConfig();
			const rawMainKey = normalizeMainKey(cfg.session?.mainKey);
			const sessionKey = sessionKeyRaw.length > 0 ? sessionKeyRaw : rawMainKey;
			const { storePath, entry, canonicalKey } = loadSessionEntry(sessionKey);
			const now = Date.now();
			const sessionId = entry?.sessionId ?? randomUUID();
			if (storePath) await updateSessionStore(storePath, (store) => {
				const target = resolveGatewaySessionStoreTarget({
					cfg,
					key: sessionKey,
					store
				});
				pruneLegacyStoreKeys({
					store,
					canonicalKey: target.canonicalKey,
					candidates: target.storeKeys
				});
				store[canonicalKey] = {
					sessionId,
					updatedAt: now,
					thinkingLevel: entry?.thinkingLevel,
					verboseLevel: entry?.verboseLevel,
					reasoningLevel: entry?.reasoningLevel,
					systemSent: entry?.systemSent,
					sendPolicy: entry?.sendPolicy,
					lastChannel: entry?.lastChannel,
					lastTo: entry?.lastTo
				};
			});
			ctx.addChatRun(sessionId, {
				sessionKey: canonicalKey,
				clientRunId: `voice-${randomUUID()}`
			});
			agentCommand({
				message: text,
				sessionId,
				sessionKey: canonicalKey,
				thinking: "low",
				deliver: false,
				messageChannel: "node"
			}, defaultRuntime, ctx.deps).catch((err) => {
				ctx.logGateway.warn(`agent failed node=${nodeId}: ${formatForLog(err)}`);
			});
			return;
		}
		case "agent.request": {
			if (!evt.payloadJSON) return;
			let link = null;
			try {
				link = JSON.parse(evt.payloadJSON);
			} catch {
				return;
			}
			const message = (link?.message ?? "").trim();
			if (!message) return;
			if (message.length > 2e4) return;
			const channel = normalizeChannelId(typeof link?.channel === "string" ? link.channel.trim() : "") ?? void 0;
			const to = typeof link?.to === "string" && link.to.trim() ? link.to.trim() : void 0;
			const deliver = Boolean(link?.deliver) && Boolean(channel);
			const sessionKeyRaw = (link?.sessionKey ?? "").trim();
			const sessionKey = sessionKeyRaw.length > 0 ? sessionKeyRaw : `node-${nodeId}`;
			const cfg = loadConfig();
			const { storePath, entry, canonicalKey } = loadSessionEntry(sessionKey);
			const now = Date.now();
			const sessionId = entry?.sessionId ?? randomUUID();
			if (storePath) await updateSessionStore(storePath, (store) => {
				const target = resolveGatewaySessionStoreTarget({
					cfg,
					key: sessionKey,
					store
				});
				pruneLegacyStoreKeys({
					store,
					canonicalKey: target.canonicalKey,
					candidates: target.storeKeys
				});
				store[canonicalKey] = {
					sessionId,
					updatedAt: now,
					thinkingLevel: entry?.thinkingLevel,
					verboseLevel: entry?.verboseLevel,
					reasoningLevel: entry?.reasoningLevel,
					systemSent: entry?.systemSent,
					sendPolicy: entry?.sendPolicy,
					lastChannel: entry?.lastChannel,
					lastTo: entry?.lastTo
				};
			});
			agentCommand({
				message,
				sessionId,
				sessionKey: canonicalKey,
				thinking: link?.thinking ?? void 0,
				deliver,
				to,
				channel,
				timeout: typeof link?.timeoutSeconds === "number" ? link.timeoutSeconds.toString() : void 0,
				messageChannel: "node"
			}, defaultRuntime, ctx.deps).catch((err) => {
				ctx.logGateway.warn(`agent failed node=${nodeId}: ${formatForLog(err)}`);
			});
			return;
		}
		case "chat.subscribe": {
			if (!evt.payloadJSON) return;
			let payload;
			try {
				payload = JSON.parse(evt.payloadJSON);
			} catch {
				return;
			}
			const obj = typeof payload === "object" && payload !== null ? payload : {};
			const sessionKey = typeof obj.sessionKey === "string" ? obj.sessionKey.trim() : "";
			if (!sessionKey) return;
			ctx.nodeSubscribe(nodeId, sessionKey);
			return;
		}
		case "chat.unsubscribe": {
			if (!evt.payloadJSON) return;
			let payload;
			try {
				payload = JSON.parse(evt.payloadJSON);
			} catch {
				return;
			}
			const obj = typeof payload === "object" && payload !== null ? payload : {};
			const sessionKey = typeof obj.sessionKey === "string" ? obj.sessionKey.trim() : "";
			if (!sessionKey) return;
			ctx.nodeUnsubscribe(nodeId, sessionKey);
			return;
		}
		case "exec.started":
		case "exec.finished":
		case "exec.denied": {
			if (!evt.payloadJSON) return;
			let payload;
			try {
				payload = JSON.parse(evt.payloadJSON);
			} catch {
				return;
			}
			const obj = typeof payload === "object" && payload !== null ? payload : {};
			const sessionKey = typeof obj.sessionKey === "string" ? obj.sessionKey.trim() : `node-${nodeId}`;
			if (!sessionKey) return;
			const runId = typeof obj.runId === "string" ? obj.runId.trim() : "";
			const command = typeof obj.command === "string" ? obj.command.trim() : "";
			const exitCode = typeof obj.exitCode === "number" && Number.isFinite(obj.exitCode) ? obj.exitCode : void 0;
			const timedOut = obj.timedOut === true;
			const output = typeof obj.output === "string" ? obj.output.trim() : "";
			const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
			let text = "";
			if (evt.event === "exec.started") {
				text = `Exec started (node=${nodeId}${runId ? ` id=${runId}` : ""})`;
				if (command) text += `: ${command}`;
			} else if (evt.event === "exec.finished") {
				const exitLabel = timedOut ? "timeout" : `code ${exitCode ?? "?"}`;
				text = `Exec finished (node=${nodeId}${runId ? ` id=${runId}` : ""}, ${exitLabel})`;
				if (output) text += `\n${output}`;
			} else {
				text = `Exec denied (node=${nodeId}${runId ? ` id=${runId}` : ""}${reason ? `, ${reason}` : ""})`;
				if (command) text += `: ${command}`;
			}
			enqueueSystemEvent(text, {
				sessionKey,
				contextKey: runId ? `exec:${runId}` : "exec"
			});
			requestHeartbeatNow({ reason: "exec-event" });
			return;
		}
		default: return;
	}
};

//#endregion
export { handleNodeEvent };