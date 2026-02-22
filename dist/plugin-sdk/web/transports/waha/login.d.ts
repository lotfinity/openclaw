import type { RuntimeEnv } from "../../../runtime.js";
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
export declare function startWahaLoginWithQr(params: {
    account: ResolvedWhatsAppAccount;
    timeoutMs?: number;
    force?: boolean;
    runtime: RuntimeEnv;
    verbose?: boolean;
}): Promise<{
    qrDataUrl?: string;
    message: string;
}>;
export declare function waitForWahaLogin(params: {
    account: ResolvedWhatsAppAccount;
    timeoutMs?: number;
    runtime: RuntimeEnv;
}): Promise<{
    connected: boolean;
    message: string;
}>;
