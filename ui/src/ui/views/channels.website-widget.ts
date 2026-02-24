import { html, nothing } from "lit";

export type WebsiteWidgetPosition = "left" | "right";

export type WebsiteWidgetFormState = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  title: string;
  accentColor: string;
  launcherLabel: string;
  placeholder: string;
  widgetWidth: string;
  widgetHeight: string;
  position: WebsiteWidgetPosition;
};

export type WebsiteWidgetProbeState = {
  running: boolean;
  lastRunAt: number | null;
  pingMs: number | null;
  rpcOk: boolean | null;
  wsHandshakeOk: boolean | null;
  scriptEndpointOk: boolean | null;
  frameEndpointOk: boolean | null;
  error: string | null;
};

export type WebsiteWidgetCardProps = {
  connected: boolean;
  form: WebsiteWidgetFormState;
  probe: WebsiteWidgetProbeState;
  snippetInput: string;
  snippetMessage: string | null;
  snippetError: string | null;
  previewNonce: number;
  onFieldChange: (field: keyof WebsiteWidgetFormState, value: string) => void;
  onProbe: () => void;
  onSnippetInputChange: (next: string) => void;
  onSnippetApply: () => void;
  onSnippetReset: () => void;
  onPreviewReload: () => void;
};

export type ParsedWidgetSnippet = {
  config: Partial<WebsiteWidgetFormState>;
  fieldCount: number;
};

const SNIPPET_FIELDS: Array<keyof WebsiteWidgetFormState> = [
  "token",
  "gatewayUrl",
  "sessionKey",
  "title",
  "accentColor",
  "launcherLabel",
  "placeholder",
  "widgetWidth",
  "widgetHeight",
  "position",
];

const STRING_FIELDS = new Set<keyof WebsiteWidgetFormState>([
  "token",
  "gatewayUrl",
  "sessionKey",
  "title",
  "accentColor",
  "launcherLabel",
  "placeholder",
  "widgetWidth",
  "widgetHeight",
]);

function decodeJsString(raw: string): string {
  const quote = raw[0];
  const body = raw.slice(1, -1);
  if (quote === '"') {
    return JSON.parse(raw);
  }
  return body
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function parseQuotedValue(literal: string): string | null {
  const trimmed = literal.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return decodeJsString(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

export function parseWidgetSnippet(input: string): ParsedWidgetSnippet {
  const blockMatch = input.match(/OpenClawWidgetConfig\s*=\s*\{([\s\S]*?)\}\s*;?/i);
  if (!blockMatch) {
    throw new Error("Snippet must include window.OpenClawWidgetConfig = { ... }.");
  }
  const block = blockMatch[1] ?? "";
  const config: Partial<WebsiteWidgetFormState> = {};

  for (const field of SNIPPET_FIELDS) {
    const rx = new RegExp(`${field}\\s*:\\s*([^,\\n]+)`, "i");
    const hit = block.match(rx);
    if (!hit) {
      continue;
    }
    const rawValue = (hit[1] ?? "").trim();
    if (!rawValue) {
      continue;
    }

    if (field === "position") {
      const normalized = rawValue.replace(/['"]/g, "").trim().toLowerCase();
      if (normalized === "left" || normalized === "right") {
        config.position = normalized;
      }
      continue;
    }

    if (!STRING_FIELDS.has(field)) {
      continue;
    }

    const parsed = parseQuotedValue(rawValue);
    if (parsed == null) {
      continue;
    }
    config[field] = parsed;
  }

  const fieldCount = Object.keys(config).length;
  if (fieldCount === 0) {
    throw new Error("No supported widget fields found in the pasted snippet.");
  }

  return { config, fieldCount };
}

function resolveControlUiBasePathFromLocation(): string {
  const pathname = location.pathname || "";
  const normalized = pathname.replace(/\/+$/, "");
  if (!normalized || normalized === "/") {
    return "";
  }
  if (normalized.endsWith("/channels")) {
    return normalized.slice(0, -"/channels".length);
  }
  return normalized;
}

function toHttpOriginFromGatewayUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }
    const basePath =
      parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") : "";
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin}${basePath}`;
  } catch {
    return `${location.protocol}//${location.host}${resolveControlUiBasePathFromLocation()}`;
  }
}

function encodeFrameConfig(form: WebsiteWidgetFormState): string {
  const payload = {
    gatewayUrl: form.gatewayUrl,
    token: form.token,
    sessionKey: form.sessionKey,
    title: form.title,
    accentColor: form.accentColor,
    launcherLabel: form.launcherLabel,
    placeholder: form.placeholder,
    widgetWidth: form.widgetWidth,
    widgetHeight: form.widgetHeight,
    position: form.position,
    pageHost: "control-ui-preview",
    pagePath: "/channels",
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=+$/g, "");
}

export function buildWidgetSnippet(form: WebsiteWidgetFormState): string {
  const httpOrigin = toHttpOriginFromGatewayUrl(form.gatewayUrl);
  const scriptSrc = `${httpOrigin}/widget/openclaw-widget.js`;
  const lines = [
    "<script>",
    "  window.OpenClawWidgetConfig = {",
    `    token: ${JSON.stringify(form.token)},`,
    `    gatewayUrl: ${JSON.stringify(form.gatewayUrl)},`,
    `    sessionKey: ${JSON.stringify(form.sessionKey)},`,
    `    title: ${JSON.stringify(form.title)},`,
    `    accentColor: ${JSON.stringify(form.accentColor)},`,
    `    launcherLabel: ${JSON.stringify(form.launcherLabel)},`,
    `    placeholder: ${JSON.stringify(form.placeholder)},`,
    `    widgetWidth: ${JSON.stringify(form.widgetWidth)},`,
    `    widgetHeight: ${JSON.stringify(form.widgetHeight)},`,
    `    position: ${JSON.stringify(form.position)},`,
    "  };",
    "</script>",
    `<script src="${scriptSrc}" defer></script>`,
  ];
  return `${lines.join("\n")}\n`;
}

function renderProbeSummary(probe: WebsiteWidgetProbeState) {
  if (probe.running) {
    return html`
      <div class="callout info" style="margin-top: 12px">Running widget checks...</div>
    `;
  }

  if (!probe.lastRunAt) {
    return html`
      <div class="muted" style="margin-top: 12px">Run checks to verify endpoint + websocket health.</div>
    `;
  }

  const statusTone =
    probe.rpcOk === true && probe.wsHandshakeOk === true && probe.scriptEndpointOk !== false
      ? "success"
      : probe.error
        ? "danger"
        : "info";

  return html`
    <div class="callout ${statusTone}" style="margin-top: 12px;">
      <div><strong>Last check:</strong> ${new Date(probe.lastRunAt).toLocaleTimeString()}</div>
      <div style="margin-top: 6px;">RPC ping: ${formatCheck(probe.rpcOk, probe.pingMs)}</div>
      <div>Widget websocket handshake: ${formatCheck(probe.wsHandshakeOk)}</div>
      <div>Script endpoint: ${formatCheck(probe.scriptEndpointOk)}</div>
      <div>Frame endpoint: ${formatCheck(probe.frameEndpointOk)}</div>
      ${probe.error ? html`<div style="margin-top: 8px;">${probe.error}</div>` : nothing}
    </div>
  `;
}

function formatCheck(value: boolean | null, pingMs?: number | null): string {
  if (value == null) {
    return "n/a";
  }
  if (!value) {
    return "failed";
  }
  if (typeof pingMs === "number" && Number.isFinite(pingMs) && pingMs >= 0) {
    return `ok (${Math.round(pingMs)}ms)`;
  }
  return "ok";
}

export function renderWebsiteWidgetCard(props: WebsiteWidgetCardProps) {
  const snippet = buildWidgetSnippet(props.form);
  const httpOrigin = toHttpOriginFromGatewayUrl(props.form.gatewayUrl);
  const frameSrc = `${httpOrigin}/widget/frame#cfg=${encodeFrameConfig(props.form)}&preview=${props.previewNonce}`;
  const statusSummary = props.probe.running
    ? "Checking"
    : props.probe.wsHandshakeOk === true
      ? "Healthy"
      : props.probe.lastRunAt
        ? "Needs attention"
        : "Not checked";

  return html`
    <details class="card" style="margin-bottom: 18px;">
      <summary style="cursor: pointer;">
        <div class="row" style="justify-content: space-between; align-items: center; gap: 8px;">
          <div>
            <div class="card-title">Website Widget</div>
            <div class="card-sub">
              Configure embed snippet, preview it, and probe gateway/widget health.
            </div>
          </div>
          <div class="muted">${statusSummary}</div>
        </div>
      </summary>

      <div style="margin-top: 14px;">
        <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
          <div></div>
          <div class="row" style="gap: 8px;">
            <button class="btn" ?disabled=${!props.connected || props.probe.running} @click=${props.onProbe}>
              ${props.probe.running ? "Checking..." : "Run checks"}
            </button>
            <button class="btn" @click=${props.onPreviewReload}>Reload preview</button>
          </div>
        </div>

        ${renderProbeSummary(props.probe)}

        <div class="form-grid" style="margin-top: 14px;">
          <label class="field">
            <span>Gateway WebSocket URL</span>
            <input
              .value=${props.form.gatewayUrl}
              @input=${(event: Event) =>
                props.onFieldChange("gatewayUrl", (event.target as HTMLInputElement).value)}
              placeholder="wss://gateway.example.com"
            />
          </label>
          <label class="field">
            <span>Gateway token</span>
            <input
              .value=${props.form.token}
              @input=${(event: Event) =>
                props.onFieldChange("token", (event.target as HTMLInputElement).value)}
              placeholder="Paste shared gateway token"
            />
          </label>
          <label class="field">
            <span>Session key</span>
            <input
              .value=${props.form.sessionKey}
              @input=${(event: Event) =>
                props.onFieldChange("sessionKey", (event.target as HTMLInputElement).value)}
              placeholder="widget:site:main"
            />
          </label>
          <label class="field">
            <span>Title</span>
            <input
              .value=${props.form.title}
              @input=${(event: Event) => props.onFieldChange("title", (event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>Launcher label</span>
            <input
              .value=${props.form.launcherLabel}
              @input=${(event: Event) =>
                props.onFieldChange("launcherLabel", (event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>Accent color</span>
            <input
              .value=${props.form.accentColor}
              @input=${(event: Event) =>
                props.onFieldChange("accentColor", (event.target as HTMLInputElement).value)}
              placeholder="#0f766e"
            />
          </label>
          <label class="field">
            <span>Widget width</span>
            <input
              .value=${props.form.widgetWidth}
              @input=${(event: Event) =>
                props.onFieldChange("widgetWidth", (event.target as HTMLInputElement).value)}
              placeholder="420px"
            />
          </label>
          <label class="field">
            <span>Widget height</span>
            <input
              .value=${props.form.widgetHeight}
              @input=${(event: Event) =>
                props.onFieldChange("widgetHeight", (event.target as HTMLInputElement).value)}
              placeholder="680px"
            />
          </label>
          <label class="field">
            <span>Position</span>
            <select
              .value=${props.form.position}
              @change=${(event: Event) =>
                props.onFieldChange("position", (event.target as HTMLSelectElement).value)}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label class="field full">
            <span>Input placeholder</span>
            <input
              .value=${props.form.placeholder}
              @input=${(event: Event) =>
                props.onFieldChange("placeholder", (event.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        <div class="grid grid-cols-2" style="margin-top: 14px; gap: 14px;">
          <div>
            <div class="muted" style="margin-bottom: 8px;">Copy-paste snippet</div>
            <pre class="code-block">${snippet}</pre>
          </div>
          <div>
            <div class="muted" style="margin-bottom: 8px;">Live preview</div>
            <iframe
              src=${frameSrc}
              title="Website widget preview"
              style="width: 100%; height: 420px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg);"
            ></iframe>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div class="muted" style="margin-bottom: 8px;">Paste snippet to import/edit</div>
          <label class="field">
            <textarea
              .value=${props.snippetInput}
              rows="7"
              @input=${(event: Event) =>
                props.onSnippetInputChange((event.target as HTMLTextAreaElement).value)}
              placeholder="Paste a widget snippet here to parse values into the form"
            ></textarea>
          </label>
          <div class="row" style="margin-top: 10px;">
            <button class="btn" @click=${props.onSnippetApply}>Apply pasted snippet</button>
            <button class="btn" @click=${props.onSnippetReset}>Reset input</button>
          </div>
          ${
            props.snippetMessage
              ? html`<div class="callout success" style="margin-top: 10px;">${props.snippetMessage}</div>`
              : nothing
          }
          ${
            props.snippetError
              ? html`<div class="callout danger" style="margin-top: 10px;">${props.snippetError}</div>`
              : nothing
          }
        </div>
      </div>
    </details>
  `;
}
