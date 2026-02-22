import type { ActiveWebListener } from "../active-listener.js";
import type { WebInboundMessage, WebListenerCloseReason } from "./types.js";
export declare function monitorWahaInbox(options: {
    verbose: boolean;
    accountId: string;
    authDir: string;
    onMessage: (msg: WebInboundMessage) => Promise<void>;
    mediaMaxMb?: number;
    sendReadReceipts?: boolean;
    debounceMs?: number;
    shouldDebounce?: (msg: WebInboundMessage) => boolean;
}): Promise<ActiveWebListener & {
    onClose: Promise<WebListenerCloseReason>;
    signalClose: (reason?: WebListenerCloseReason) => void;
}>;
