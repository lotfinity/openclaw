import { t as __exportAll } from "./rolldown-runtime-Cbj13DAv.js";
import { mt as buildParseArgv, n as isTruthyEnvValue, vt as getPrimaryCommand, xt as hasHelpOrVersion } from "./entry.js";
import { r as resolveActionArgs } from "./helpers-DZXJB8y6.js";

//#region src/cli/program/register.subclis.ts
var register_subclis_exports = /* @__PURE__ */ __exportAll({
	getSubCliEntries: () => getSubCliEntries,
	registerSubCliByName: () => registerSubCliByName,
	registerSubCliCommands: () => registerSubCliCommands
});
const shouldRegisterPrimaryOnly = (argv) => {
	if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_LAZY_SUBCOMMANDS)) return false;
	if (hasHelpOrVersion(argv)) return false;
	return true;
};
const shouldEagerRegisterSubcommands = (_argv) => {
	return isTruthyEnvValue(process.env.OPENCLAW_DISABLE_LAZY_SUBCOMMANDS);
};
const loadConfig = async () => {
	return (await import("./config-DXGbt1H7.js").then((n) => n.t)).loadConfig();
};
const entries = [
	{
		name: "acp",
		description: "Agent Control Protocol tools",
		register: async (program) => {
			(await import("./acp-cli-BH-h2iN3.js")).registerAcpCli(program);
		}
	},
	{
		name: "gateway",
		description: "Gateway control",
		register: async (program) => {
			(await import("./gateway-cli-Cp-CQSpZ.js")).registerGatewayCli(program);
		}
	},
	{
		name: "daemon",
		description: "Gateway service (legacy alias)",
		register: async (program) => {
			(await import("./daemon-cli-CFJ6SJlG.js").then((n) => n.t)).registerDaemonCli(program);
		}
	},
	{
		name: "logs",
		description: "Gateway logs",
		register: async (program) => {
			(await import("./logs-cli-CmZoY2aO.js")).registerLogsCli(program);
		}
	},
	{
		name: "system",
		description: "System events, heartbeat, and presence",
		register: async (program) => {
			(await import("./system-cli-CF_zh7IG.js")).registerSystemCli(program);
		}
	},
	{
		name: "models",
		description: "Model configuration",
		register: async (program) => {
			(await import("./models-cli-CEivyqsp.js")).registerModelsCli(program);
		}
	},
	{
		name: "approvals",
		description: "Exec approvals",
		register: async (program) => {
			(await import("./exec-approvals-cli-DlK1N5y-.js")).registerExecApprovalsCli(program);
		}
	},
	{
		name: "nodes",
		description: "Node commands",
		register: async (program) => {
			(await import("./nodes-cli-Dut2dR56.js")).registerNodesCli(program);
		}
	},
	{
		name: "devices",
		description: "Device pairing + token management",
		register: async (program) => {
			(await import("./devices-cli-LRD6lsRF.js")).registerDevicesCli(program);
		}
	},
	{
		name: "node",
		description: "Node control",
		register: async (program) => {
			(await import("./node-cli-CW-HDPVZ.js")).registerNodeCli(program);
		}
	},
	{
		name: "sandbox",
		description: "Sandbox tools",
		register: async (program) => {
			(await import("./sandbox-cli-ONIdgknX.js")).registerSandboxCli(program);
		}
	},
	{
		name: "tui",
		description: "Terminal UI",
		register: async (program) => {
			(await import("./tui-cli-DTH8q8CX.js")).registerTuiCli(program);
		}
	},
	{
		name: "cron",
		description: "Cron scheduler",
		register: async (program) => {
			(await import("./cron-cli-CERoUjIU.js")).registerCronCli(program);
		}
	},
	{
		name: "dns",
		description: "DNS helpers",
		register: async (program) => {
			(await import("./dns-cli-BYYi-qdK.js")).registerDnsCli(program);
		}
	},
	{
		name: "docs",
		description: "Docs helpers",
		register: async (program) => {
			(await import("./docs-cli-Ca7ENVid.js")).registerDocsCli(program);
		}
	},
	{
		name: "hooks",
		description: "Hooks tooling",
		register: async (program) => {
			(await import("./hooks-cli-CbtA7SgP.js")).registerHooksCli(program);
		}
	},
	{
		name: "webhooks",
		description: "Webhook helpers",
		register: async (program) => {
			(await import("./webhooks-cli-CrZYlqs6.js")).registerWebhooksCli(program);
		}
	},
	{
		name: "pairing",
		description: "Pairing helpers",
		register: async (program) => {
			const { registerPluginCliCommands } = await import("./cli-CJj2XMHG.js");
			registerPluginCliCommands(program, await loadConfig());
			(await import("./pairing-cli-CAfIsLFE.js")).registerPairingCli(program);
		}
	},
	{
		name: "plugins",
		description: "Plugin management",
		register: async (program) => {
			(await import("./plugins-cli-BSSfGdNv.js")).registerPluginsCli(program);
			const { registerPluginCliCommands } = await import("./cli-CJj2XMHG.js");
			registerPluginCliCommands(program, await loadConfig());
		}
	},
	{
		name: "channels",
		description: "Channel management",
		register: async (program) => {
			(await import("./channels-cli-RpeDNhgq.js")).registerChannelsCli(program);
		}
	},
	{
		name: "directory",
		description: "Directory commands",
		register: async (program) => {
			(await import("./directory-cli-c-KhOiox.js")).registerDirectoryCli(program);
		}
	},
	{
		name: "security",
		description: "Security helpers",
		register: async (program) => {
			(await import("./security-cli-X3sF3jOE.js")).registerSecurityCli(program);
		}
	},
	{
		name: "skills",
		description: "Skills management",
		register: async (program) => {
			(await import("./skills-cli-CpFoEMG1.js")).registerSkillsCli(program);
		}
	},
	{
		name: "update",
		description: "CLI update helpers",
		register: async (program) => {
			(await import("./update-cli-Ci-7xt17.js")).registerUpdateCli(program);
		}
	},
	{
		name: "completion",
		description: "Generate shell completion script",
		register: async (program) => {
			(await import("./completion-cli-tOy8i-Bv.js").then((n) => n.n)).registerCompletionCli(program);
		}
	}
];
function getSubCliEntries() {
	return entries;
}
function removeCommand(program, command) {
	const commands = program.commands;
	const index = commands.indexOf(command);
	if (index >= 0) commands.splice(index, 1);
}
async function registerSubCliByName(program, name) {
	const entry = entries.find((candidate) => candidate.name === name);
	if (!entry) return false;
	const existing = program.commands.find((cmd) => cmd.name() === entry.name);
	if (existing) removeCommand(program, existing);
	await entry.register(program);
	return true;
}
function registerLazyCommand(program, entry) {
	const placeholder = program.command(entry.name).description(entry.description);
	placeholder.allowUnknownOption(true);
	placeholder.allowExcessArguments(true);
	placeholder.action(async (...actionArgs) => {
		removeCommand(program, placeholder);
		await entry.register(program);
		const actionCommand = actionArgs.at(-1);
		const rawArgs = (actionCommand?.parent ?? program).rawArgs;
		const actionArgsList = resolveActionArgs(actionCommand);
		const fallbackArgv = actionCommand?.name() ? [actionCommand.name(), ...actionArgsList] : actionArgsList;
		const parseArgv = buildParseArgv({
			programName: program.name(),
			rawArgs,
			fallbackArgv
		});
		await program.parseAsync(parseArgv);
	});
}
function registerSubCliCommands(program, argv = process.argv) {
	if (shouldEagerRegisterSubcommands(argv)) {
		for (const entry of entries) entry.register(program);
		return;
	}
	const primary = getPrimaryCommand(argv);
	if (primary && shouldRegisterPrimaryOnly(argv)) {
		const entry = entries.find((candidate) => candidate.name === primary);
		if (entry) {
			registerLazyCommand(program, entry);
			return;
		}
	}
	for (const candidate of entries) registerLazyCommand(program, candidate);
}

//#endregion
export { register_subclis_exports as i, registerSubCliByName as n, registerSubCliCommands as r, getSubCliEntries as t };