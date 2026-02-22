import type { OpenClawConfig } from "../../config/config.js";
import type { WhatsAppTransport } from "./types.js";
export declare function getWhatsAppTransport(cfg: OpenClawConfig, accountId?: string | null): WhatsAppTransport;
export { resolveWhatsAppTransportId } from "./resolve.js";
export type { WhatsAppTransport, WhatsAppTransportId } from "./types.js";
