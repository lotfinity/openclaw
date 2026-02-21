import type { OpenClawConfig } from "../../config/config.js";
import type { WhatsAppTransportId } from "../../config/types.whatsapp.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../routing/session-key.js";

export const DEFAULT_WHATSAPP_TRANSPORT: WhatsAppTransportId = "baileys";

export function resolveWhatsAppTransportId(
  cfg: OpenClawConfig,
  accountId?: string | null,
): WhatsAppTransportId {
  const normalizedId = normalizeAccountId((accountId ?? "").trim() || DEFAULT_ACCOUNT_ID);
  const accountTransport = cfg.channels?.whatsapp?.accounts?.[normalizedId]?.transport;
  const channelTransport = cfg.channels?.whatsapp?.transport;
  return accountTransport ?? channelTransport ?? DEFAULT_WHATSAPP_TRANSPORT;
}
