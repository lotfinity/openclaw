import { type RuntimeEnv } from "../runtime.js";
export declare function startWebLoginWithQr(opts?: {
    verbose?: boolean;
    timeoutMs?: number;
    force?: boolean;
    accountId?: string;
    mode?: "qr" | "request-code";
    phoneNumber?: string;
    runtime?: RuntimeEnv;
}): Promise<{
    qrDataUrl?: string;
    message: string;
}>;
export declare function waitForWebLogin(opts?: {
    timeoutMs?: number;
    runtime?: RuntimeEnv;
    accountId?: string;
}): Promise<{
    connected: boolean;
    message: string;
}>;
export declare function getWebLoginScreenshot(opts?: {
    accountId?: string;
    runtime?: RuntimeEnv;
}): Promise<{
    imageDataUrl?: string;
    message: string;
}>;
