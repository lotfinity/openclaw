import type { WhatsAppTransport } from "../types.js";

export const wahaTransport: WhatsAppTransport = {
  id: "waha",
  displayName: "WAHA",
  capabilities: {
    polls: true,
    reactions: true,
    media: true,
  },
};
