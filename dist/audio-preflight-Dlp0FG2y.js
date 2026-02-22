import "./paths-DVBShlw6.js";
import { F as shouldLogVerbose, M as logVerbose } from "./subsystem-QRNIBE7-.js";
import "./utils-CrauP1IK.js";
import "./pi-embedded-helpers-BF3lzKDp.js";
import "./exec-BDyx_yxc.js";
import "./agent-scope-C6CjuRmH.js";
import "./model-selection-BS39NEIx.js";
import "./github-copilot-token-CiF5Iyi2.js";
import "./boolean-BgXe2hyu.js";
import "./env-BSjH4KuP.js";
import "./config-Ck3rODdu.js";
import "./manifest-registry-DFR7U7LS.js";
import "./plugins-DsO8Iwb1.js";
import "./sessions-Bp-SHSt0.js";
import { a as runCapability, l as isAudioAttachment, n as createMediaAttachmentCache, r as normalizeMediaAttachments, t as buildProviderRegistry } from "./runner-rq38bqqY.js";
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
import "./paths-BuQbsACT.js";
import "./tool-images-D0MTnajJ.js";
import "./redact-Bb36nvYe.js";
import "./tool-display-CPUH9JiE.js";
import "./fetch-K5fbHXR-.js";

//#region src/media-understanding/audio-preflight.ts
/**
* Transcribes the first audio attachment BEFORE mention checking.
* This allows voice notes to be processed in group chats with requireMention: true.
* Returns the transcript or undefined if transcription fails or no audio is found.
*/
async function transcribeFirstAudio(params) {
	const { ctx, cfg } = params;
	const audioConfig = cfg.tools?.media?.audio;
	if (!audioConfig || audioConfig.enabled === false) return;
	const attachments = normalizeMediaAttachments(ctx);
	if (!attachments || attachments.length === 0) return;
	const firstAudio = attachments.find((att) => att && isAudioAttachment(att) && !att.alreadyTranscribed);
	if (!firstAudio) return;
	if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribing attachment ${firstAudio.index} for mention check`);
	const providerRegistry = buildProviderRegistry(params.providers);
	const cache = createMediaAttachmentCache(attachments);
	try {
		const result = await runCapability({
			capability: "audio",
			cfg,
			ctx,
			attachments: cache,
			media: attachments,
			agentDir: params.agentDir,
			providerRegistry,
			config: audioConfig,
			activeModel: params.activeModel
		});
		if (!result || result.outputs.length === 0) return;
		const audioOutput = result.outputs.find((output) => output.kind === "audio.transcription");
		if (!audioOutput || !audioOutput.text) return;
		firstAudio.alreadyTranscribed = true;
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribed ${audioOutput.text.length} chars from attachment ${firstAudio.index}`);
		return audioOutput.text;
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
		return;
	} finally {
		await cache.cleanup();
	}
}

//#endregion
export { transcribeFirstAudio };