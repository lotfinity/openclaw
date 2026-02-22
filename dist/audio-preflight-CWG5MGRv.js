import "./paths-BZtyHNCi.js";
import "./workspace-CUznpDHg.js";
import { Q as shouldLogVerbose, X as logVerbose } from "./exec-DBtWJ4Ld.js";
import "./agent-scope-xZu8sXcF.js";
import "./image-ops-CEhvmfZb.js";
import "./boolean-Bb19hm9Y.js";
import "./model-auth-BWNeE8AB.js";
import "./config-CVffLdk5.js";
import "./github-copilot-token-BRNzgUa_.js";
import "./pi-model-discovery-Cexg1XRf.js";
import "./pi-embedded-helpers-B_YOUdeC.js";
import "./chrome-DdEflVKx.js";
import "./frontmatter-Uu27Y56g.js";
import "./store-BuZmjkEs.js";
import "./paths-CpGplyYJ.js";
import "./tool-images-dt0J2V2W.js";
import "./image-BNHc4FrW.js";
import "./redact-DcuzVizL.js";
import "./fetch-m-t-1bsN.js";
import { a as runCapability, l as isAudioAttachment, n as createMediaAttachmentCache, r as normalizeMediaAttachments, t as buildProviderRegistry } from "./runner-CNahr7vF.js";

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