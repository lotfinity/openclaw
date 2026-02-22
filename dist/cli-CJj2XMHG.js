import { o as createSubsystemLogger } from "./entry.js";
import "./auth-profiles-CrPm8QA6.js";
import "./utils-q1rHOG-N.js";
import "./exec-B52LZOrO.js";
import { c as resolveDefaultAgentId, s as resolveAgentWorkspaceDir } from "./agent-scope-Bu62UIQZ.js";
import "./github-copilot-token-C4G0wDDt.js";
import "./pi-model-discovery-EhM2JAQo.js";
import { i as loadConfig } from "./config-DXGbt1H7.js";
import "./manifest-registry-DlFh5LWe.js";
import "./plugins-DsHRVW6o.js";
import "./logging-B5vJSgy6.js";
import "./accounts-DtWoksmp.js";
import "./send-BgSx_-TW.js";
import "./send-CPqQktXh.js";
import { _t as loadOpenClawPlugins } from "./reply-BQBuMSTO.js";
import "./media-EWF5qDpT.js";
import "./message-channel-D-iPIX3C.js";
import "./render-DyRjoIgA.js";
import "./tables-DuWEJJJ_.js";
import "./image-ops-BuOO2fiP.js";
import "./fetch-CiM7YqYo.js";
import "./tool-images-Do-zTkGT.js";
import "./common-2Kd-SlSi.js";
import "./server-context-xJkCkcvY.js";
import "./chrome-Biwk6Xdw.js";
import "./auth-DaQXd14b.js";
import "./control-auth-BtqxdpVM.js";
import "./ports-C5vKQsaq.js";
import "./control-service-CN9Abdiu.js";
import "./deliver-Dv9lu3B7.js";
import "./pi-embedded-helpers-B1pSLPE2.js";
import "./sessions-D5mfxA3z.js";
import "./runner-kUQwzO2K.js";
import "./image-DwbphEzn.js";
import "./models-config-bIH7Di9o.js";
import "./sandbox-BJI6XoM3.js";
import "./skills-C1pxUa-I.js";
import "./routes-3orrh_Bi.js";
import "./store-C2n2K571.js";
import "./paths-D9QhlJYC.js";
import "./redact-Bt-krp_b.js";
import "./tool-display-Dq-NBueh.js";
import "./context-XpSzVmIS.js";
import "./dispatcher-B90ypYQZ.js";
import "./send-D6tLyP6u.js";
import "./memory-cli-DVLWLbyW.js";
import "./manager-BMD_X2uO.js";
import "./sqlite-hOA2wjjf.js";
import "./retry-CO00OgwL.js";
import "./commands-registry-D-rLcNA-.js";
import "./client-DV6vI7ic.js";
import "./call-BYjfiWFm.js";
import "./channel-activity-CuiCbmeL.js";
import "./send-B4QakEzb.js";
import "./links-C_tOT2wV.js";
import "./progress-C4IJwa0T.js";
import "./pairing-store-Cnb8WTFv.js";
import "./pi-tools.policy-BLGRLM8U.js";
import "./send-zAV7bMzL.js";
import "./onboard-helpers-dV0clIaA.js";
import "./prompt-style-f1NZuGno.js";
import "./pairing-labels-DjBGyFmx.js";
import "./session-cost-usage-DOubaz12.js";
import "./nodes-screen-ChgT1pbh.js";
import "./channel-selection-CHRRzvpU.js";
import "./delivery-queue-BFRO68fM.js";

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