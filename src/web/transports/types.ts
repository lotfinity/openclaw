export type WhatsAppTransportId = "baileys" | "waha";

export type WhatsAppTransportCapabilities = {
  polls: boolean;
  reactions: boolean;
  media: boolean;
};

export type WhatsAppTransport = {
  id: WhatsAppTransportId;
  displayName: string;
  capabilities: WhatsAppTransportCapabilities;
};
