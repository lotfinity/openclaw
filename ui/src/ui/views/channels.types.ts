import type {
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  ConfigUiHints,
  DiscordStatus,
  GoogleChatStatus,
  IMessageStatus,
  NostrProfile,
  NostrStatus,
  SignalStatus,
  SlackStatus,
  TelegramStatus,
  WhatsAppStatus,
} from "../types.ts";
import type { NostrProfileFormState } from "./channels.nostr-profile-form.ts";
import type { WebsiteAssistConfigState } from "./channels.website-assist.ts";
import type { WebsiteWidgetFormState, WebsiteWidgetProbeState } from "./channels.website-widget.ts";

export type ChannelKey = string;

export type ChannelsProps = {
  connected: boolean;
  loading: boolean;
  snapshot: ChannelsStatusSnapshot | null;
  lastError: string | null;
  lastSuccessAt: number | null;
  whatsappMessage: string | null;
  whatsappQrDataUrl: string | null;
  whatsappConnected: boolean | null;
  whatsappRequestCodePhone: string;
  whatsappScreenshotDataUrl: string | null;
  whatsappBusy: boolean;
  configSchema: unknown;
  configSchemaLoading: boolean;
  configForm: Record<string, unknown> | null;
  configUiHints: ConfigUiHints;
  configSaving: boolean;
  configFormDirty: boolean;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  websiteWidgetForm: WebsiteWidgetFormState;
  websiteWidgetProbe: WebsiteWidgetProbeState;
  websiteWidgetSnippetInput: string;
  websiteWidgetSnippetMessage: string | null;
  websiteWidgetSnippetError: string | null;
  websiteWidgetPreviewNonce: number;
  websiteAssistTestMessage: string;
  websiteAssistTestStatus: string | null;
  websiteAssistTestError: string | null;
  websiteAssistTesting: boolean;
  websiteAssistChatConversationId: string;
  websiteAssistChatMessages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: number;
  }>;
  websiteAssistChatInput: string;
  websiteAssistChatSending: boolean;
  websiteAssistChatRefreshing: boolean;
  websiteAssistChatError: string | null;
  onRefresh: (probe: boolean) => void;
  onWhatsAppStart: (force: boolean) => void;
  onWhatsAppWait: () => void;
  onWhatsAppLogout: () => void;
  onWhatsAppRequestCode: (phoneNumber: string) => void;
  onWhatsAppScreenshot: () => void;
  onWhatsAppScreenshotClose: () => void;
  onWhatsAppRequestCodePhoneChange: (value: string) => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => void;
  onConfigReload: () => void;
  onNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  onNostrProfileCancel: () => void;
  onNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  onNostrProfileSave: () => void;
  onNostrProfileImport: () => void;
  onNostrProfileToggleAdvanced: () => void;
  onWebsiteWidgetFieldChange: (field: keyof WebsiteWidgetFormState, value: string) => void;
  onWebsiteWidgetProbe: () => void;
  onWebsiteWidgetSnippetInputChange: (next: string) => void;
  onWebsiteWidgetSnippetApply: () => void;
  onWebsiteWidgetSnippetReset: () => void;
  onWebsiteWidgetPreviewReload: () => void;
  onWebsiteAssistFieldChange: (
    field: keyof WebsiteAssistConfigState,
    value: string | boolean,
  ) => void;
  onWebsiteAssistTestMessageChange: (value: string) => void;
  onWebsiteAssistSendTest: () => void;
  onWebsiteAssistChatInputChange: (value: string) => void;
  onWebsiteAssistChatSend: () => void;
  onWebsiteAssistChatRefresh: () => void;
};

export type ChannelsChannelData = {
  whatsapp?: WhatsAppStatus;
  telegram?: TelegramStatus;
  discord?: DiscordStatus | null;
  googlechat?: GoogleChatStatus | null;
  slack?: SlackStatus | null;
  signal?: SignalStatus | null;
  imessage?: IMessageStatus | null;
  nostr?: NostrStatus | null;
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null;
};
