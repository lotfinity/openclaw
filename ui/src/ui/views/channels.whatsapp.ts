import { html, nothing } from "lit";
import type { WhatsAppStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;
  const statusSummary = whatsapp?.connected
    ? "Connected"
    : whatsapp?.running
      ? "Running"
      : whatsapp?.linked
        ? "Linked"
        : "Not linked";

  return html`
    <details class="card" data-tour="whatsapp-card">
      <summary style="cursor: pointer;">
        <div class="row" style="justify-content: space-between; align-items: center; gap: 8px;">
          <div>
            <div class="card-title">WhatsApp</div>
            <div class="card-sub">Link WhatsApp Web and monitor connection health.</div>
          </div>
          <div class="muted">${statusSummary}</div>
        </div>
      </summary>
      <div style="margin-top: 14px;">
        ${accountCountLabel}

        <div class="status-list" style="margin-top: 16px;">
          <div>
            <span class="label">Configured</span>
            <span>${whatsapp?.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Linked</span>
            <span>${whatsapp?.linked ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Running</span>
            <span>${whatsapp?.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Connected</span>
            <span>${whatsapp?.connected ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last connect</span>
            <span>
              ${whatsapp?.lastConnectedAt ? formatRelativeTimestamp(whatsapp.lastConnectedAt) : "n/a"}
            </span>
          </div>
          <div>
            <span class="label">Last message</span>
            <span>
              ${whatsapp?.lastMessageAt ? formatRelativeTimestamp(whatsapp.lastMessageAt) : "n/a"}
            </span>
          </div>
          <div>
            <span class="label">Auth age</span>
            <span>
              ${whatsapp?.authAgeMs != null ? formatDurationHuman(whatsapp.authAgeMs) : "n/a"}
            </span>
          </div>
        </div>

        ${
          whatsapp?.lastError
            ? html`<div class="callout danger" style="margin-top: 12px;">
              ${whatsapp.lastError}
            </div>`
            : nothing
        }

        ${
          props.whatsappMessage
            ? html`<div class="callout" style="margin-top: 12px;">
              ${props.whatsappMessage}
            </div>`
            : nothing
        }

        ${
          props.whatsappQrDataUrl
            ? html`<div class="qr-wrap" data-tour="whatsapp-qr">
              <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
            </div>`
            : nothing
        }

        <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
          <button
            class="btn primary"
            data-tour="whatsapp-show-qr"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(false)}
          >
            ${props.whatsappBusy ? "Working…" : "Show QR"}
          </button>
          <button
            class="btn"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(true)}
          >
            Relink
          </button>
          <button
            class="btn"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppWait()}
          >
            Wait for scan
          </button>
          <button
            class="btn danger"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppLogout()}
          >
            Logout
          </button>
          <button class="btn" @click=${() => props.onRefresh(true)}>
            Refresh
          </button>
          <button class="btn" ?disabled=${props.whatsappBusy} @click=${() => props.onWhatsAppScreenshot()}>
            WAHA screenshot
          </button>
        </div>
        <div class="row" style="margin-top: 10px; gap: 8px; flex-wrap: wrap;">
          <input
            class="input"
            style="min-width: 260px;"
            type="text"
            placeholder="E.164 phone (for request-code)"
            .value=${props.whatsappRequestCodePhone}
            @input=${(event: Event) =>
              props.onWhatsAppRequestCodePhoneChange(
                (event.target as HTMLInputElement | null)?.value ?? "",
              )}
          />
          <button
            class="btn"
            ?disabled=${props.whatsappBusy || !props.whatsappRequestCodePhone.trim()}
            @click=${() => props.onWhatsAppRequestCode(props.whatsappRequestCodePhone)}
          >
            Request code
          </button>
        </div>

        ${renderChannelConfigSection({ channelId: "whatsapp", props })}
      </div>
      ${
        props.whatsappScreenshotDataUrl
          ? html`<div
              class="whatsapp-screenshot-modal"
              role="dialog"
              aria-modal="true"
              aria-label="WAHA screenshot preview"
              @click=${() => props.onWhatsAppScreenshotClose()}
            >
              <div class="whatsapp-screenshot-modal__card" @click=${(event: Event) => event.stopPropagation()}>
                <div class="whatsapp-screenshot-modal__header">
                  <div class="card-title">WAHA Session Screenshot</div>
                  <button class="btn btn--sm" @click=${() => props.onWhatsAppScreenshotClose()}>
                    Close
                  </button>
                </div>
                <img src=${props.whatsappScreenshotDataUrl} alt="WAHA session screenshot" />
              </div>
            </div>`
          : nothing
      }
    </details>
  `;
}
