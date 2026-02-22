import "./paths-BZtyHNCi.js";
import "./workspace-CUznpDHg.js";
import "./exec-DBtWJ4Ld.js";
import { c as resolveDefaultAgentId, r as resolveAgentDir, s as resolveAgentWorkspaceDir } from "./agent-scope-xZu8sXcF.js";
import "./deliver-5-OMPYie.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-CnI42KAF.js";
import "./image-ops-CEhvmfZb.js";
import "./boolean-Bb19hm9Y.js";
import "./model-auth-BWNeE8AB.js";
import "./config-CVffLdk5.js";
import "./send-Cub4Nsuw.js";
import "./send-BtvGUSXk.js";
import "./send-4bIR7FXu.js";
import "./github-copilot-token-BRNzgUa_.js";
import "./pi-model-discovery-Cexg1XRf.js";
import "./pi-embedded-helpers-B_YOUdeC.js";
import "./chrome-DdEflVKx.js";
import "./frontmatter-Uu27Y56g.js";
import "./store-BuZmjkEs.js";
import "./paths-CpGplyYJ.js";
import "./tool-images-dt0J2V2W.js";
import "./image-BNHc4FrW.js";
import "./manager-CALHsdun.js";
import "./sqlite-Dashr12i.js";
import "./retry-BhlI4gtw.js";
import "./redact-DcuzVizL.js";
import "./common-Cw7R_-Wi.js";
import "./ir-BV_fXRLV.js";
import "./fetch-m-t-1bsN.js";
import "./render-CiikiGbn.js";
import "./runner-CNahr7vF.js";
import "./send-CA5hkmej.js";
import "./send-C3lYS4AR.js";
import "./channel-activity-BHDtnoEK.js";
import "./tables-C7hTs082.js";
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