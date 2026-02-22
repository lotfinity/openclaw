import type { ResolvedWhatsAppAccount } from "../../accounts.js";
type WahaMessageResult = {
    messageId: string;
};
export declare function sendTextViaWaha(account: ResolvedWhatsAppAccount, to: string, text: string): Promise<WahaMessageResult>;
export declare function sendMediaViaWaha(account: ResolvedWhatsAppAccount, to: string, text: string, mediaBuffer: Buffer, mediaType: string, fileName?: string): Promise<WahaMessageResult>;
export declare function sendPollViaWaha(account: ResolvedWhatsAppAccount, to: string, poll: {
    question: string;
    options: string[];
    maxSelections?: number;
}): Promise<WahaMessageResult>;
export declare function sendReactionViaWaha(account: ResolvedWhatsAppAccount, messageId: string, emoji: string): Promise<void>;
export {};
