import type { RuntimeEnv } from "../../../runtime.js";
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
export declare function fetchWahaSessionScreenshot(params: {
    account: ResolvedWhatsAppAccount;
}): Promise<{
    imageDataUrl?: string;
    message: string;
}>;
export declare function startWahaLoginWithQr(params: {
    account: ResolvedWhatsAppAccount;
    timeoutMs?: number;
    force?: boolean;
    mode?: "qr" | "request-code";
    phoneNumber?: string;
    runtime: RuntimeEnv;
    verbose?: boolean;
}): Promise<{
    qrDataUrl?: string;
    message: string;
}>;
export declare function requestWahaAuthCode(params: {
    account: ResolvedWhatsAppAccount;
    runtime: RuntimeEnv;
    phoneNumber?: string;
}): Promise<{
    message: string;
}>;
export declare function stopWahaSession(params: {
    account: ResolvedWhatsAppAccount;
}): Promise<{
    stopped: boolean;
    message: string;
}>;
export declare function logoutWahaSession(params: {
    account: ResolvedWhatsAppAccount;
}): Promise<{
    loggedOut: boolean;
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
