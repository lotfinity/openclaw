import { html, nothing } from "lit";
import type {
  DevicePairingList,
  DeviceTokenSummary,
  PairedDevice,
  PendingDevice,
} from "../controllers/devices.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "../controllers/exec-approvals.ts";
import androidLogo from "../../assets/os/android.svg";
import linuxLogo from "../../assets/os/linux.svg";
import macosLogo from "../../assets/os/macos.svg";
import windowsLogo from "../../assets/os/windows.svg";
import { formatRelativeTimestamp, formatList } from "../format.ts";
import { renderExecApprovals, resolveExecApprovalsState } from "./nodes-exec-approvals.ts";
export type NodesProps = {
  loading: boolean;
  nodes: Array<Record<string, unknown>>;
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  configFormMode: "form" | "raw";
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  onRefresh: () => void;
  onDevicesRefresh: () => void;
  onDeviceApprove: (requestId: string) => void;
  onDeviceReject: (requestId: string) => void;
  onDeviceRotate: (deviceId: string, role: string, scopes?: string[]) => void;
  onDeviceRevoke: (deviceId: string, role: string) => void;
  onLoadConfig: () => void;
  onLoadExecApprovals: () => void;
  onBindDefault: (nodeId: string | null) => void;
  onBindAgent: (agentIndex: number, nodeId: string | null) => void;
  onSaveBindings: () => void;
  onExecApprovalsTargetChange: (kind: "gateway" | "node", nodeId: string | null) => void;
  onExecApprovalsSelectAgent: (agentId: string) => void;
  onExecApprovalsPatch: (path: Array<string | number>, value: unknown) => void;
  onExecApprovalsRemove: (path: Array<string | number>) => void;
  onSaveExecApprovals: () => void;
};

export function renderNodes(props: NodesProps) {
  const bindingState = resolveBindingsState(props);
  const approvalsState = resolveExecApprovalsState(props);
  return html`
    ${renderExecApprovals(approvalsState)}
    ${renderBindings(bindingState)}
    ${renderDevices(props)}
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Nodes</div>
          <div class="card-sub">Paired devices and live links.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div class="list" style="margin-top: 16px;">
        ${
          props.nodes.length === 0
            ? html`
                <div class="muted">No nodes found.</div>
              `
            : props.nodes.map((n) => renderNode(n))
        }
      </div>
    </section>
  `;
}

function renderDevices(props: NodesProps) {
  const list = props.devicesList ?? { pending: [], paired: [] };
  const pending = Array.isArray(list.pending) ? list.pending : [];
  const paired = Array.isArray(list.paired) ? list.paired : [];
  const connectedNodeIds = new Set(
    props.nodes
      .filter((node) => node && node.connected === true)
      .map((node) => (typeof node.nodeId === "string" ? node.nodeId : ""))
      .filter(Boolean),
  );
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Devices</div>
          <div class="card-sub">Pairing requests + role tokens.</div>
        </div>
        <button class="btn" ?disabled=${props.devicesLoading} @click=${props.onDevicesRefresh}>
          ${props.devicesLoading ? "Loading…" : "Refresh"}
        </button>
      </div>
      ${
        props.devicesError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.devicesError}</div>`
          : nothing
      }
      <div class="list" style="margin-top: 16px;">
        ${
          pending.length > 0
            ? html`
              <div class="muted" style="margin-bottom: 8px;">Pending</div>
              <div class="device-list">
                ${pending.map((req) => renderPendingDevice(req, props))}
              </div>
            `
            : nothing
        }
        ${
          paired.length > 0
            ? html`
              <div class="muted" style="margin-top: 12px; margin-bottom: 8px;">Paired</div>
              <div class="device-list">
                ${paired.map((device) => renderPairedDevice(device, props, connectedNodeIds))}
              </div>
            `
            : nothing
        }
        ${
          pending.length === 0 && paired.length === 0
            ? html`
                <div class="muted">No paired devices.</div>
              `
            : nothing
        }
      </div>
    </section>
  `;
}

function renderPendingDevice(req: PendingDevice, props: NodesProps) {
  const name =
    req.displayName?.trim() || resolveClientLabel(req.clientMode, req.clientId) || req.deviceId;
  const age = typeof req.ts === "number" ? formatRelativeTimestamp(req.ts) : "n/a";
  const role = req.role?.trim() || "n/a";
  const client = resolveClientSummary(req.clientMode, req.clientId);
  const platform = req.platform?.trim() || "n/a";
  return html`
    <div class="list-item device-item">
      <div class="list-main">
        <div class="list-title">${name}</div>
        <div class="list-sub device-id-row">${req.deviceId}</div>
        <div class="chip-row device-chip-row">
          <span class="chip chip-warn">Pending approval</span>
          ${renderPlatformBadge(platform)}
          ${
            req.isRepair
              ? html`
                  <span class="chip">Repair request</span>
                `
              : nothing
          }
        </div>
        <div class="device-meta-grid">
          <div class="device-meta-row"><span>Role</span><span>${role}</span></div>
          <div class="device-meta-row"><span>Client</span><span>${client}</span></div>
          <div class="device-meta-row"><span>Platform</span><span>${platform}</span></div>
          <div class="device-meta-row"><span>Requested</span><span>${age}</span></div>
          <div class="device-meta-row">
            <span>Remote IP</span><span>${req.remoteIp?.trim() || "n/a"}</span>
          </div>
        </div>
      </div>
      <div class="list-meta">
        <div class="row device-actions-row">
          <button class="btn btn--sm primary" @click=${() => props.onDeviceApprove(req.requestId)}>
            Approve
          </button>
          <button class="btn btn--sm" @click=${() => props.onDeviceReject(req.requestId)}>
            Reject
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderPairedDevice(
  device: PairedDevice,
  props: NodesProps,
  connectedNodeIds: Set<string>,
) {
  const name =
    device.displayName?.trim() ||
    resolveClientLabel(device.clientMode, device.clientId) ||
    device.deviceId;
  const tokens = Array.isArray(device.tokens) ? device.tokens : [];
  const roles = formatList(device.roles);
  const scopes = formatList(device.scopes);
  const client = resolveClientSummary(device.clientMode, device.clientId);
  const platform = device.platform?.trim() || "n/a";
  const approved = formatRelativeTimestamp(device.approvedAtMs ?? null);
  const added = formatRelativeTimestamp(device.createdAtMs ?? null);
  const lastActivity = formatRelativeTimestamp(getDeviceLastActivityMs(device) ?? null);
  const connected = connectedNodeIds.has(device.deviceId);
  return html`
    <div class="list-item device-item">
      <div class="list-main">
        <div class="list-title">${name}</div>
        <div class="list-sub device-id-row">${device.deviceId}</div>
        <div class="chip-row device-chip-row">
          <span class="chip ${connected ? "chip-ok" : "chip-warn"}">
            ${connected ? "Connected" : "Offline"}
          </span>
          ${renderPlatformBadge(platform)}
        </div>
        <div class="device-meta-grid">
          <div class="device-meta-row"><span>Client</span><span>${client}</span></div>
          <div class="device-meta-row"><span>Roles</span><span>${roles}</span></div>
          <div class="device-meta-row"><span>Scopes</span><span>${scopes}</span></div>
          <div class="device-meta-row"><span>Approved</span><span>${approved}</span></div>
          <div class="device-meta-row"><span>Added</span><span>${added}</span></div>
          <div class="device-meta-row"><span>Last activity</span><span>${lastActivity}</span></div>
          <div class="device-meta-row">
            <span>Remote IP</span><span>${device.remoteIp?.trim() || "n/a"}</span>
          </div>
        </div>
        ${
          tokens.length === 0
            ? html`
                <div class="device-token-empty">No role tokens yet.</div>
              `
            : html`
              <div class="device-token-title">Role tokens</div>
              <div class="device-token-list">
                ${tokens.map((token) => renderTokenRow(device.deviceId, token, props))}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderTokenRow(deviceId: string, token: DeviceTokenSummary, props: NodesProps) {
  const status = token.revokedAtMs ? "revoked" : "active";
  const scopes = formatList(token.scopes);
  const when = formatRelativeTimestamp(
    token.rotatedAtMs ?? token.createdAtMs ?? token.lastUsedAtMs ?? null,
  );
  return html`
    <div class="device-token-row">
      <div class="device-token-info">
        <div class="chip-row">
          <span class="chip">${token.role}</span>
          <span class="chip ${status === "active" ? "chip-ok" : "chip-danger"}">${status}</span>
          <span class="chip">${when}</span>
        </div>
        <div class="device-token-scopes">Scopes: ${scopes}</div>
      </div>
      <div class="row device-actions-row">
        <button
          class="btn btn--sm"
          @click=${() => props.onDeviceRotate(deviceId, token.role, token.scopes)}
        >
          Rotate
        </button>
        ${
          token.revokedAtMs
            ? nothing
            : html`
              <button
                class="btn btn--sm danger"
                @click=${() => props.onDeviceRevoke(deviceId, token.role)}
              >
                Revoke
              </button>
            `
        }
      </div>
    </div>
  `;
}

function resolveClientLabel(clientMode?: string, clientId?: string) {
  const mode = (clientMode ?? "").trim().toLowerCase();
  const id = (clientId ?? "").trim();
  const idLower = id.toLowerCase();
  if (mode === "webchat" || idLower.includes("control-ui")) {
    return "Browser session";
  }
  if (mode === "cli") {
    return "CLI session";
  }
  if (mode === "node") {
    return "Node client";
  }
  if (id) {
    return id;
  }
  return null;
}

function resolveClientSummary(clientMode?: string, clientId?: string) {
  const mode = (clientMode ?? "").trim();
  const id = (clientId ?? "").trim();
  if (mode && id) {
    return `${mode} (${id})`;
  }
  return mode || id || "n/a";
}

function getDeviceLastActivityMs(device: PairedDevice): number | null {
  const tokens = Array.isArray(device.tokens) ? device.tokens : [];
  const values = tokens.flatMap((token) =>
    [token.lastUsedAtMs, token.rotatedAtMs, token.createdAtMs].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ),
  );
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function normalizePlatform(platform?: string): "linux" | "macos" | "windows" | "android" | "other" {
  const value = (platform ?? "").trim().toLowerCase();
  if (value.includes("linux")) {
    return "linux";
  }
  if (value.includes("mac") || value.includes("darwin") || value.includes("osx")) {
    return "macos";
  }
  if (value.includes("win")) {
    return "windows";
  }
  if (value.includes("android")) {
    return "android";
  }
  return "other";
}

function renderPlatformBadge(platform: string) {
  const normalized = normalizePlatform(platform);
  const label =
    normalized === "linux"
      ? "Linux"
      : normalized === "macos"
        ? "macOS"
        : normalized === "windows"
          ? "Windows"
          : normalized === "android"
            ? "Android"
            : platform || "Unknown";
  const logoSrc =
    normalized === "linux"
      ? linuxLogo
      : normalized === "macos"
        ? macosLogo
        : normalized === "windows"
          ? windowsLogo
          : normalized === "android"
            ? androidLogo
            : null;
  return html`
    <span class="chip">
      ${
        logoSrc
          ? html`<img class="platform-logo" src=${logoSrc} alt=${`${label} logo`} loading="lazy" />`
          : html`
              <span class="platform-logo platform-logo--fallback" aria-hidden="true">•</span>
            `
      }
      ${label}
    </span>
  `;
}

type BindingAgent = {
  id: string;
  name?: string;
  index: number;
  isDefault: boolean;
  binding?: string | null;
};

type BindingNode = {
  id: string;
  label: string;
};

type BindingState = {
  ready: boolean;
  disabled: boolean;
  configDirty: boolean;
  configLoading: boolean;
  configSaving: boolean;
  defaultBinding?: string | null;
  agents: BindingAgent[];
  nodes: BindingNode[];
  onBindDefault: (nodeId: string | null) => void;
  onBindAgent: (agentIndex: number, nodeId: string | null) => void;
  onSave: () => void;
  onLoadConfig: () => void;
  formMode: "form" | "raw";
};

function resolveBindingsState(props: NodesProps): BindingState {
  const config = props.configForm;
  const nodes = resolveExecNodes(props.nodes);
  const { defaultBinding, agents } = resolveAgentBindings(config);
  const ready = Boolean(config);
  const disabled = props.configSaving || props.configFormMode === "raw";
  return {
    ready,
    disabled,
    configDirty: props.configDirty,
    configLoading: props.configLoading,
    configSaving: props.configSaving,
    defaultBinding,
    agents,
    nodes,
    onBindDefault: props.onBindDefault,
    onBindAgent: props.onBindAgent,
    onSave: props.onSaveBindings,
    onLoadConfig: props.onLoadConfig,
    formMode: props.configFormMode,
  };
}

function renderBindings(state: BindingState) {
  const supportsBinding = state.nodes.length > 0;
  const defaultValue = state.defaultBinding ?? "";
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Exec node binding</div>
          <div class="card-sub">
            Pin agents to a specific node when using <span class="mono">exec host=node</span>.
          </div>
        </div>
        <button
          class="btn"
          ?disabled=${state.disabled || !state.configDirty}
          @click=${state.onSave}
        >
          ${state.configSaving ? "Saving…" : "Save"}
        </button>
      </div>

      ${
        state.formMode === "raw"
          ? html`
              <div class="callout warn" style="margin-top: 12px">
                Switch the Config tab to <strong>Form</strong> mode to edit bindings here.
              </div>
            `
          : nothing
      }

      ${
        !state.ready
          ? html`<div class="row" style="margin-top: 12px; gap: 12px;">
            <div class="muted">Load config to edit bindings.</div>
            <button class="btn" ?disabled=${state.configLoading} @click=${state.onLoadConfig}>
              ${state.configLoading ? "Loading…" : "Load config"}
            </button>
          </div>`
          : html`
            <div class="list" style="margin-top: 16px;">
              <div class="list-item">
                <div class="list-main">
                  <div class="list-title">Default binding</div>
                  <div class="list-sub">Used when agents do not override a node binding.</div>
                </div>
                <div class="list-meta">
                  <label class="field">
                    <span>Node</span>
                    <select
                      ?disabled=${state.disabled || !supportsBinding}
                      @change=${(event: Event) => {
                        const target = event.target as HTMLSelectElement;
                        const value = target.value.trim();
                        state.onBindDefault(value ? value : null);
                      }}
                    >
                      <option value="" ?selected=${defaultValue === ""}>Any node</option>
                      ${state.nodes.map(
                        (node) =>
                          html`<option
                            value=${node.id}
                            ?selected=${defaultValue === node.id}
                          >
                            ${node.label}
                          </option>`,
                      )}
                    </select>
                  </label>
                  ${
                    !supportsBinding
                      ? html`
                          <div class="muted">No nodes with system.run available.</div>
                        `
                      : nothing
                  }
                </div>
              </div>

              ${
                state.agents.length === 0
                  ? html`
                      <div class="muted">No agents found.</div>
                    `
                  : state.agents.map((agent) => renderAgentBinding(agent, state))
              }
            </div>
          `
      }
    </section>
  `;
}

function renderAgentBinding(agent: BindingAgent, state: BindingState) {
  const bindingValue = agent.binding ?? "__default__";
  const label = agent.name?.trim() ? `${agent.name} (${agent.id})` : agent.id;
  const supportsBinding = state.nodes.length > 0;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${label}</div>
        <div class="list-sub">
          ${agent.isDefault ? "default agent" : "agent"} ·
          ${
            bindingValue === "__default__"
              ? `uses default (${state.defaultBinding ?? "any"})`
              : `override: ${agent.binding}`
          }
        </div>
      </div>
      <div class="list-meta">
        <label class="field">
          <span>Binding</span>
          <select
            ?disabled=${state.disabled || !supportsBinding}
            @change=${(event: Event) => {
              const target = event.target as HTMLSelectElement;
              const value = target.value.trim();
              state.onBindAgent(agent.index, value === "__default__" ? null : value);
            }}
          >
            <option value="__default__" ?selected=${bindingValue === "__default__"}>
              Use default
            </option>
            ${state.nodes.map(
              (node) =>
                html`<option
                  value=${node.id}
                  ?selected=${bindingValue === node.id}
                >
                  ${node.label}
                </option>`,
            )}
          </select>
        </label>
      </div>
    </div>
  `;
}

function resolveExecNodes(nodes: Array<Record<string, unknown>>): BindingNode[] {
  const list: BindingNode[] = [];
  for (const node of nodes) {
    const commands = Array.isArray(node.commands) ? node.commands : [];
    const supports = commands.some((cmd) => String(cmd) === "system.run");
    if (!supports) {
      continue;
    }
    const nodeId = typeof node.nodeId === "string" ? node.nodeId.trim() : "";
    if (!nodeId) {
      continue;
    }
    const displayName =
      typeof node.displayName === "string" && node.displayName.trim()
        ? node.displayName.trim()
        : nodeId;
    list.push({
      id: nodeId,
      label: displayName === nodeId ? nodeId : `${displayName} · ${nodeId}`,
    });
  }
  list.sort((a, b) => a.label.localeCompare(b.label));
  return list;
}

function resolveAgentBindings(config: Record<string, unknown> | null): {
  defaultBinding?: string | null;
  agents: BindingAgent[];
} {
  const fallbackAgent: BindingAgent = {
    id: "main",
    name: undefined,
    index: 0,
    isDefault: true,
    binding: null,
  };
  if (!config || typeof config !== "object") {
    return { defaultBinding: null, agents: [fallbackAgent] };
  }
  const tools = (config.tools ?? {}) as Record<string, unknown>;
  const exec = (tools.exec ?? {}) as Record<string, unknown>;
  const defaultBinding =
    typeof exec.node === "string" && exec.node.trim() ? exec.node.trim() : null;

  const agentsNode = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agentsNode.list) ? agentsNode.list : [];
  if (list.length === 0) {
    return { defaultBinding, agents: [fallbackAgent] };
  }

  const agents: BindingAgent[] = [];
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      return;
    }
    const name = typeof record.name === "string" ? record.name.trim() : undefined;
    const isDefault = record.default === true;
    const toolsEntry = (record.tools ?? {}) as Record<string, unknown>;
    const execEntry = (toolsEntry.exec ?? {}) as Record<string, unknown>;
    const binding =
      typeof execEntry.node === "string" && execEntry.node.trim() ? execEntry.node.trim() : null;
    agents.push({
      id,
      name: name || undefined,
      index,
      isDefault,
      binding,
    });
  });

  if (agents.length === 0) {
    agents.push(fallbackAgent);
  }

  return { defaultBinding, agents };
}

function renderNode(node: Record<string, unknown>) {
  const connected = Boolean(node.connected);
  const paired = Boolean(node.paired);
  const title =
    (typeof node.displayName === "string" && node.displayName.trim()) ||
    (typeof node.nodeId === "string" ? node.nodeId : "unknown");
  const caps = Array.isArray(node.caps) ? (node.caps as unknown[]) : [];
  const commands = Array.isArray(node.commands) ? (node.commands as unknown[]) : [];
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${title}</div>
        <div class="list-sub">
          ${typeof node.nodeId === "string" ? node.nodeId : ""}
          ${typeof node.remoteIp === "string" ? ` · ${node.remoteIp}` : ""}
          ${typeof node.version === "string" ? ` · ${node.version}` : ""}
        </div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${paired ? "paired" : "unpaired"}</span>
          <span class="chip ${connected ? "chip-ok" : "chip-warn"}">
            ${connected ? "connected" : "offline"}
          </span>
          ${caps.slice(0, 12).map((c) => html`<span class="chip">${String(c)}</span>`)}
          ${commands.slice(0, 8).map((c) => html`<span class="chip">${String(c)}</span>`)}
        </div>
      </div>
    </div>
  `;
}
