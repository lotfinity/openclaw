import type { OpenClawConfig } from "../../config/config.js";
import type { WhatsAppTransportId } from "../../config/types.whatsapp.js";
export declare const DEFAULT_WHATSAPP_TRANSPORT: WhatsAppTransportId;
export declare function resolveWhatsAppTransportId(cfg: OpenClawConfig, accountId?: string | null): WhatsAppTransportId;
