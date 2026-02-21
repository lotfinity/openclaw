import type { OpenClawConfig } from "../../config/config.js";
import type { WhatsAppTransport } from "./types.js";
import { baileysTransport } from "./baileys/index.js";
import { resolveWhatsAppTransportId } from "./resolve.js";
import { wahaTransport } from "./waha/index.js";

const transportById: Record<string, WhatsAppTransport> = {
  baileys: baileysTransport,
  waha: wahaTransport,
};

export function getWhatsAppTransport(
  cfg: OpenClawConfig,
  accountId?: string | null,
): WhatsAppTransport {
  const id = resolveWhatsAppTransportId(cfg, accountId);
  return transportById[id] ?? baileysTransport;
}

export { resolveWhatsAppTransportId } from "./resolve.js";
export type { WhatsAppTransport, WhatsAppTransportId } from "./types.js";
