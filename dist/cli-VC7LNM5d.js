import "./paths-DVBShlw6.js";
import { t as createSubsystemLogger } from "./subsystem-QRNIBE7-.js";
import "./utils-CrauP1IK.js";
import "./pi-embedded-helpers-BF3lzKDp.js";
import { _t as loadOpenClawPlugins } from "./reply-DLSmOGEW.js";
import "./exec-BDyx_yxc.js";
import { c as resolveDefaultAgentId, s as resolveAgentWorkspaceDir } from "./agent-scope-C6CjuRmH.js";
import "./model-selection-BS39NEIx.js";
import "./github-copilot-token-CiF5Iyi2.js";
import "./boolean-BgXe2hyu.js";
import "./env-BSjH4KuP.js";
import { i as loadConfig } from "./config-Ck3rODdu.js";
import "./manifest-registry-DFR7U7LS.js";
import "./plugins-DsO8Iwb1.js";
import "./sessions-Bp-SHSt0.js";
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

//#region src/plugins/cli.ts
const log = createSubsystemLogger("plugins");
function registerPluginCliCommands(program, cfg) {
	const config = cfg ?? loadConfig();
	const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
	const logger = {
		info: (msg) => log.info(msg),
		warn: (msg) => log.warn(msg),
		error: (msg) => log.error(msg),
		debug: (msg) => log.debug(msg)
	};
	const registry = loadOpenClawPlugins({
		config,
		workspaceDir,
		logger
	});
	const existingCommands = new Set(program.commands.map((cmd) => cmd.name()));
	for (const entry of registry.cliRegistrars) {
		if (entry.commands.length > 0) {
			const overlaps = entry.commands.filter((command) => existingCommands.has(command));
			if (overlaps.length > 0) {
				log.debug(`plugin CLI register skipped (${entry.pluginId}): command already registered (${overlaps.join(", ")})`);
				continue;
			}
		}
		try {
			const result = entry.register({
				program,
				config,
				workspaceDir,
				logger
			});
			if (result && typeof result.then === "function") result.catch((err) => {
				log.warn(`plugin CLI register failed (${entry.pluginId}): ${String(err)}`);
			});
			for (const command of entry.commands) existingCommands.add(command);
		} catch (err) {
			log.warn(`plugin CLI register failed (${entry.pluginId}): ${String(err)}`);
		}
	}
}

//#endregion
export { registerPluginCliCommands };