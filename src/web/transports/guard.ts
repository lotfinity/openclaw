import type { WhatsAppTransportId } from "./types.js";

export function assertBaileysTransport(transportId: WhatsAppTransportId, operation: string): void {
  if (transportId === "baileys") {
    return;
  }
  throw new Error(
    `WhatsApp transport "${transportId}" does not support ${operation} yet. Use channels.whatsapp.transport="baileys" for now.`,
  );
}
