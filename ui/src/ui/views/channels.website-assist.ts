import { html, nothing } from "lit";

export type WebsiteAssistConfigState = {
  enabled: boolean;
  botToken: string;
  relayKey: string;
  telegramTo: string;
  nodeTag: string;
  autoTopic: boolean;
  topicPrefix: string;
};

export type WebsiteAssistCardProps = {
  connected: boolean;
  gatewayUrl: string;
  config: WebsiteAssistConfigState;
  testing: boolean;
  testMessage: string;
  testStatus: string | null;
  testError: string | null;
  chatConversationId: string;
  chatMessages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: number;
  }>;
  chatInput: string;
  chatSending: boolean;
  chatRefreshing: boolean;
  chatError: string | null;
  onFieldChange: (field: keyof WebsiteAssistConfigState, value: string | boolean) => void;
  onTestMessageChange: (value: string) => void;
  onSendTest: () => void;
  onChatInputChange: (value: string) => void;
  onChatSend: () => void;
  onChatRefresh: () => void;
};

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

function toHttpOrigin(gatewayUrl: string): string {
  try {
    const parsed = new URL(gatewayUrl);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    }
    if (parsed.protocol === "wss:") {
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

export function buildWebsiteAssistSnippet(
  gatewayUrl: string,
  config: WebsiteAssistConfigState,
): string {
  const origin = toHttpOrigin(gatewayUrl);
  const endpoint = `${origin}/api/website-assist/telegram`;
  const messagesEndpoint = `${origin}/api/website-assist/messages`;
  const replyEndpoint = `${origin}/api/website-assist/reply`;
  const lines = [
    "<script>",
    "  const WEBSITE_ASSIST = (() => {",
    `    const endpoint = ${JSON.stringify(endpoint)};`,
    `    const messagesEndpoint = ${JSON.stringify(messagesEndpoint)};`,
    `    const replyEndpoint = ${JSON.stringify(replyEndpoint)};`,
    '    const visitorKey = "assist-visitor-id";',
    '    const conversationKey = "assist-conversation-id";',
    "    function getVisitorId() {",
    "      let visitorId = localStorage.getItem(visitorKey);",
    "      if (!visitorId) {",
    "        visitorId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));",
    "        localStorage.setItem(visitorKey, visitorId);",
    "      }",
    "      return visitorId;",
    "    }",
    "    function getConversationId() {",
    "      let conversationId = localStorage.getItem(conversationKey);",
    "      if (!conversationId) {",
    '        conversationId = "conv:" + getVisitorId();',
    "        localStorage.setItem(conversationKey, conversationId);",
    "      }",
    "      return conversationId;",
    "    }",
    "    async function send(text) {",
    "      const visitorId = getVisitorId();",
    "      const conversationId = getConversationId();",
    "      const response = await fetch(endpoint, {",
    '        method: "POST",',
    '        headers: { "Content-Type": "application/json" },',
    "        body: JSON.stringify({",
    `          relayKey: ${JSON.stringify(config.relayKey)},`,
    `          to: ${JSON.stringify(config.telegramTo)},`,
    `          nodeId: ${JSON.stringify(config.nodeTag || "website-node")},`,
    "          sourceUrl: location.href,",
    "          visitorId,",
    "          conversationId,",
    "          text,",
    "        }),",
    "      });",
    "      return await response.json();",
    "    }",
    "    async function poll(after) {",
    "      const conversationId = getConversationId();",
    "      const qs = new URLSearchParams({ conversationId, after: String(after || 0) });",
    '      const response = await fetch(messagesEndpoint + "?" + qs.toString());',
    "      return await response.json();",
    "    }",
    "    return { send, poll, replyEndpoint };",
    "  })();",
    "</script>",
  ];
  return `${lines.join("\n")}\n`;
}

export function renderWebsiteAssistCard(props: WebsiteAssistCardProps) {
  const snippet = buildWebsiteAssistSnippet(props.gatewayUrl, props.config);
  const endpoint = `${toHttpOrigin(props.gatewayUrl)}/api/website-assist/telegram`;

  return html`
    <section class="card" style="margin-bottom: 18px;">
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div>
          <div class="card-title">Website Assist via Telegram</div>
          <div class="card-sub">
            Separate relay for onboarding/help traffic with its own bot token. Does not use channels.telegram.
          </div>
        </div>
        <button class="btn primary" ?disabled=${!props.connected || props.testing} @click=${props.onSendTest}>
          ${props.testing ? "Sending..." : "Send test"}
        </button>
      </div>

      <div class="form-grid" style="margin-top: 14px;">
        <label class="field">
          <span>Enabled</span>
          <select
            .value=${props.config.enabled ? "on" : "off"}
            @change=${(event: Event) =>
              props.onFieldChange("enabled", (event.target as HTMLSelectElement).value === "on")}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label class="field">
          <span>Website Assist bot token</span>
          <input
            type="password"
            .value=${props.config.botToken}
            @input=${(event: Event) =>
              props.onFieldChange("botToken", (event.target as HTMLInputElement).value)}
            placeholder="Dedicated bot token for this dashboard widget"
          />
        </label>
        <label class="field">
          <span>Telegram target</span>
          <input
            .value=${props.config.telegramTo}
            @input=${(event: Event) =>
              props.onFieldChange("telegramTo", (event.target as HTMLInputElement).value)}
            placeholder="-1001234567890 or @channel"
          />
        </label>
        <label class="field">
          <span>Relay key</span>
          <input
            .value=${props.config.relayKey}
            @input=${(event: Event) =>
              props.onFieldChange("relayKey", (event.target as HTMLInputElement).value)}
            placeholder="shared-secret-for-website"
          />
        </label>
        <label class="field">
          <span>Node tag</span>
          <input
            .value=${props.config.nodeTag}
            @input=${(event: Event) =>
              props.onFieldChange("nodeTag", (event.target as HTMLInputElement).value)}
            placeholder="node-onboarding-a"
          />
        </label>
        <label class="field">
          <span>Auto topic per conversation</span>
          <select
            .value=${props.config.autoTopic ? "on" : "off"}
            @change=${(event: Event) =>
              props.onFieldChange("autoTopic", (event.target as HTMLSelectElement).value === "on")}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label class="field">
          <span>Topic prefix</span>
          <input
            .value=${props.config.topicPrefix}
            @input=${(event: Event) =>
              props.onFieldChange("topicPrefix", (event.target as HTMLInputElement).value)}
            placeholder="assist"
          />
        </label>
      </div>

      <div class="callout info" style="margin-top: 12px;">
        Send endpoint: <code>${endpoint}</code>
      </div>
      <div class="callout info" style="margin-top: 8px;">
        Reply poll endpoint: <code>${toHttpOrigin(props.gatewayUrl)}/api/website-assist/messages</code>
      </div>

      <div style="margin-top: 12px;">
        <label class="field">
          <span>Test message</span>
          <textarea
            rows="3"
            .value=${props.testMessage}
            @input=${(event: Event) =>
              props.onTestMessageChange((event.target as HTMLTextAreaElement).value)}
            placeholder="Test onboarding prompt..."
          ></textarea>
        </label>
        ${
          props.testStatus
            ? html`<div class="callout success" style="margin-top: 10px;">${props.testStatus}</div>`
            : nothing
        }
        ${
          props.testError
            ? html`<div class="callout danger" style="margin-top: 10px;">${props.testError}</div>`
            : nothing
        }
      </div>

      <div style="margin-top: 14px;">
        <div class="muted" style="margin-bottom: 8px;">Website integration snippet</div>
        <pre class="code-block">${snippet}</pre>
      </div>

      <div style="margin-top: 14px;">
        <div class="muted" style="margin-bottom: 8px;">Dashboard relay chat widget</div>
        <div class="callout info" style="margin-bottom: 8px;">
          Conversation: <code>${props.chatConversationId}</code>
        </div>
        <div
          style="border: 1px solid var(--border); border-radius: 12px; padding: 10px; max-height: 260px; overflow: auto; background: var(--bg-secondary);"
        >
          ${
            props.chatMessages.length === 0
              ? html`
                  <div class="muted">No messages yet.</div>
                `
              : props.chatMessages.map(
                  (message) => html`
                    <div
                      style="margin-bottom: 8px; padding: 8px 10px; border-radius: 10px; background: ${
                        message.role === "assistant" ? "var(--bg)" : "var(--accent-soft)"
                      };"
                    >
                      <div style="font-size: 12px; opacity: .75; margin-bottom: 4px;">
                        ${message.role === "assistant" ? "Telegram reply" : "You"}
                      </div>
                      <div style="white-space: pre-wrap;">${message.text}</div>
                    </div>
                  `,
                )
          }
        </div>
        <label class="field" style="margin-top: 10px;">
          <span>Message</span>
          <textarea
            rows="3"
            .value=${props.chatInput}
            @input=${(event: Event) =>
              props.onChatInputChange((event.target as HTMLTextAreaElement).value)}
            placeholder="Ask onboarding/auth question..."
          ></textarea>
        </label>
        <div class="row" style="margin-top: 8px;">
          <button class="btn primary" ?disabled=${props.chatSending} @click=${props.onChatSend}>
            ${props.chatSending ? "Sending..." : "Send"}
          </button>
          <button class="btn" ?disabled=${props.chatRefreshing} @click=${props.onChatRefresh}>
            ${props.chatRefreshing ? "Refreshing..." : "Refresh replies"}
          </button>
        </div>
        ${props.chatError ? html`<div class="callout danger" style="margin-top: 10px;">${props.chatError}</div>` : nothing}
      </div>
    </section>
  `;
}
