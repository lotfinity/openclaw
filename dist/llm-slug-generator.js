import "./paths-BZtyHNCi.js";
import "./workspace-Dht53wE1.js";
import "./globals-CChor1I6.js";
import "./exec-BQEPx-ye.js";
import { c as resolveDefaultAgentId, r as resolveAgentDir, s as resolveAgentWorkspaceDir } from "./agent-scope-427kGsvr.js";
import "./deliver-C8AljmdH.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-D9Xlruoq.js";
import "./image-ops-DJr_zui1.js";
import "./boolean-M-esQJt6.js";
import "./model-auth-rkykBFXg.js";
import "./config-C_7tWQ0S.js";
import "./send-B5eVMSDZ.js";
import "./send-DY96NkZX.js";
import "./send-e5GwXb7T.js";
import "./github-copilot-token-4X8-0wUE.js";
import "./pi-model-discovery-VBAdnbQf.js";
import "./pi-embedded-helpers-CYd73rxj.js";
import "./chrome-D3tFHzA1.js";
import "./frontmatter-SgwYJVjt.js";
import "./store-ov4a2adx.js";
import "./paths-DDhvEXEU.js";
import "./tool-images-DfDx_oW4.js";
import "./image-BAkoprzz.js";
import "./manager-gmbbaLoC.js";
import "./sqlite-Bj1D57vs.js";
import "./retry-BdLoxDsS.js";
import "./redact-RNXCZggR.js";
import "./common-D853WxXh.js";
import "./ir-lbjn02kw.js";
import "./fetch-vd0qZNQg.js";
import "./render-DSLzcBxk.js";
import "./runner-B5C80-q2.js";
import "./send-QbLcJMA8.js";
import "./send-CV5wmEgF.js";
import "./channel-activity-BOjK-3Er.js";
import "./tables-BxHiNvIM.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

//#region src/hooks/llm-slug-generator.ts
/**
* LLM-based slug generator for session memory filenames
*/
/**
* Generate a short 1-2 word filename slug from session content using LLM
*/
async function generateSlugViaLLM(params) {
	let tempSessionFile = null;
	try {
		const agentId = resolveDefaultAgentId(params.cfg);
		const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
		const agentDir = resolveAgentDir(params.cfg, agentId);
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-slug-"));
		tempSessionFile = path.join(tempDir, "session.jsonl");
		const prompt = `Based on this conversation, generate a short 1-2 word filename slug (lowercase, hyphen-separated, no file extension).

Conversation summary:
${params.sessionContent.slice(0, 2e3)}

Reply with ONLY the slug, nothing else. Examples: "vendor-pitch", "api-design", "bug-fix"`;
		const result = await runEmbeddedPiAgent({
			sessionId: `slug-generator-${Date.now()}`,
			sessionKey: "temp:slug-generator",
			agentId,
			sessionFile: tempSessionFile,
			workspaceDir,
			agentDir,
			config: params.cfg,
			prompt,
			timeoutMs: 15e3,
			runId: `slug-gen-${Date.now()}`
		});
		if (result.payloads && result.payloads.length > 0) {
			const text = result.payloads[0]?.text;
			if (text) return text.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || null;
		}
		return null;
	} catch (err) {
		console.error("[llm-slug-generator] Failed to generate slug:", err);
		return null;
	} finally {
		if (tempSessionFile) try {
			await fs.rm(path.dirname(tempSessionFile), {
				recursive: true,
				force: true
			});
		} catch {}
	}
}

//#endregion
export { generateSlugViaLLM };