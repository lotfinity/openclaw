import type { WhatsAppTransport } from "../types.js";

export const baileysTransport: WhatsAppTransport = {
  id: "baileys",
  displayName: "Baileys",
  capabilities: {
    polls: true,
    reactions: true,
    media: true,
  },
};
