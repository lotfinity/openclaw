import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import type { WebsiteAssistConfigState } from "./views/channels.website-assist.ts";
import type {
  WebsiteWidgetFormState,
  WebsiteWidgetProbeState,
} from "./views/channels.website-widget.ts";
import {
  createDefaultWebsiteWidgetForm,
  createDefaultWebsiteWidgetProbe,
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWebsiteWidgetFieldChange as handleWebsiteWidgetFieldChangeInternal,
  handleWebsiteAssistFieldChange as handleWebsiteAssistFieldChangeInternal,
  handleWebsiteAssistSendTest as handleWebsiteAssistSendTestInternal,
  handleWebsiteAssistChatInputChange as handleWebsiteAssistChatInputChangeInternal,
  handleWebsiteAssistChatRefresh as handleWebsiteAssistChatRefreshInternal,
  handleWebsiteAssistChatScreenshot as handleWebsiteAssistChatScreenshotInternal,
  handleWebsiteAssistChatSend as handleWebsiteAssistChatSendInternal,
  handleWebsiteAssistChatUploadFromDevice as handleWebsiteAssistChatUploadFromDeviceInternal,
  handleWebsiteAssistTestMessageChange as handleWebsiteAssistTestMessageChangeInternal,
  handleWebsiteWidgetPreviewReload as handleWebsiteWidgetPreviewReloadInternal,
  handleWebsiteWidgetProbe as handleWebsiteWidgetProbeInternal,
  handleWebsiteWidgetSnippetApply as handleWebsiteWidgetSnippetApplyInternal,
  handleWebsiteWidgetSnippetInputChange as handleWebsiteWidgetSnippetInputChangeInternal,
  handleWebsiteWidgetSnippetReset as handleWebsiteWidgetSnippetResetInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppRequestCode as handleWhatsAppRequestCodeInternal,
  handleWhatsAppScreenshot as handleWhatsAppScreenshotInternal,
  handleWhatsAppScreenshotClose as handleWhatsAppScreenshotCloseInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() startupSplashVisible = true;
  @state() startupSplashPhase: "sound" | "logo" = "sound";
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappRequestCodePhone = "";
  @state() whatsappScreenshotDataUrl: string | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;
  @state() websiteWidgetForm: WebsiteWidgetFormState = createDefaultWebsiteWidgetForm(this);
  @state() websiteWidgetProbe: WebsiteWidgetProbeState = createDefaultWebsiteWidgetProbe();
  @state() websiteWidgetSnippetInput = "";
  @state() websiteWidgetSnippetMessage: string | null = null;
  @state() websiteWidgetSnippetError: string | null = null;
  @state() websiteWidgetPreviewNonce = 0;
  @state() websiteAssistTestMessage = "Test: can you help me with onboarding?";
  @state() websiteAssistTestStatus: string | null = null;
  @state() websiteAssistTestError: string | null = null;
  @state() websiteAssistTesting = false;
  @state() websiteAssistChatConversationId = "control-ui-dashboard";
  @state() websiteAssistChatMessages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: number;
  }> = [];
  @state() websiteAssistChatInput = "";
  @state() websiteAssistChatSending = false;
  @state() websiteAssistMediaSending = false;
  @state() websiteAssistChatRefreshing = false;
  @state() websiteAssistChatCursor = 0;
  @state() websiteAssistChatError: string | null = null;
  @state() websiteAssistChatMinimized = false;
  private websiteAssistPollInterval: number | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() usageLoading = false;
  @state() usageResult: import("./types.js").SessionsUsageResult | null = null;
  @state() usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  @state() usageError: string | null = null;
  @state() usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageSelectedSessions: string[] = [];
  @state() usageSelectedDays: string[] = [];
  @state() usageSelectedHours: number[] = [];
  @state() usageChartMode: "tokens" | "cost" = "tokens";
  @state() usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  @state() usageTimeSeriesLoading = false;
  @state() usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  @state() usageSessionLogsLoading = false;
  @state() usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  @state() usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  @state() usageQueryDraft = "";
  @state() usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  @state() usageSessionSortDir: "desc" | "asc" = "desc";
  @state() usageRecentSessions: string[] = [];
  @state() usageTimeZone: "local" | "utc" = "local";
  @state() usageContextExpanded = false;
  @state() usageHeaderPinned = false;
  @state() usageSessionsTab: "all" | "recent" = "all";
  @state() usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  @state() usageLogFilterTools: string[] = [];
  @state() usageLogFilterHasTools = false;
  @state() usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private channelsPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;
  private channelsQrTour: { cancel: () => void } | null = null;
  private startupTimers: number[] = [];
  private startupAudioContext: AudioContext | null = null;
  private startupSequenceStarted = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.startStartupSequence();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    this.startWebsiteAssistPolling();
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    this.channelsQrTour?.cancel();
    this.cancelStartupSequence();
    this.stopWebsiteAssistPolling();
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  private startWebsiteAssistPolling() {
    if (this.websiteAssistPollInterval != null) {
      return;
    }
    this.websiteAssistPollInterval = window.setInterval(() => {
      void handleWebsiteAssistChatRefreshInternal(this, { silent: true });
    }, 2000);
    void handleWebsiteAssistChatRefreshInternal(this, { silent: true });
  }

  private stopWebsiteAssistPolling() {
    if (this.websiteAssistPollInterval == null) {
      return;
    }
    window.clearInterval(this.websiteAssistPollInterval);
    this.websiteAssistPollInterval = null;
  }

  private startStartupSequence() {
    if (this.startupSequenceStarted) {
      return;
    }
    this.startupSequenceStarted = true;
    void this.playStartupSoundEffect()
      .catch(() => undefined)
      .finally(() => {
        this.startupSplashPhase = "logo";
      });
    this.startupTimers.push(
      window.setTimeout(() => {
        this.startupSplashPhase = "logo";
      }, 380),
    );
    this.startupTimers.push(
      window.setTimeout(() => {
        this.startupSplashVisible = false;
      }, 1500),
    );
  }

  private cancelStartupSequence() {
    for (const timer of this.startupTimers) {
      window.clearTimeout(timer);
    }
    this.startupTimers = [];
    if (this.startupAudioContext) {
      void this.startupAudioContext.close().catch(() => undefined);
      this.startupAudioContext = null;
    }
  }

  private async playStartupSoundEffect(): Promise<void> {
    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      return;
    }
    const audio = new AudioCtor();
    this.startupAudioContext = audio;
    if (audio.state === "suspended") {
      await audio.resume();
    }
    const now = audio.currentTime + 0.01;
    const sweep = audio.createOscillator();
    const sweepGain = audio.createGain();
    const ping = audio.createOscillator();
    const pingGain = audio.createGain();

    sweep.type = "sine";
    sweep.frequency.setValueAtTime(240, now);
    sweep.frequency.exponentialRampToValueAtTime(520, now + 0.28);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    ping.type = "triangle";
    ping.frequency.setValueAtTime(880, now + 0.22);
    ping.frequency.exponentialRampToValueAtTime(680, now + 0.44);
    pingGain.gain.setValueAtTime(0.0001, now + 0.2);
    pingGain.gain.exponentialRampToValueAtTime(0.035, now + 0.24);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);

    sweep.connect(sweepGain);
    ping.connect(pingGain);
    sweepGain.connect(audio.destination);
    pingGain.connect(audio.destination);

    sweep.start(now);
    sweep.stop(now + 0.36);
    ping.start(now + 0.2);
    ping.stop(now + 0.56);

    window.setTimeout(() => {
      if (this.startupAudioContext === audio) {
        void audio.close().catch(() => undefined);
        this.startupAudioContext = null;
      }
    }, 900);
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleWhatsAppRequestCode(phoneNumber: string) {
    await handleWhatsAppRequestCodeInternal(this, phoneNumber);
  }

  async handleWhatsAppScreenshot() {
    await handleWhatsAppScreenshotInternal(this);
  }

  handleWhatsAppScreenshotClose() {
    handleWhatsAppScreenshotCloseInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  handleWebsiteWidgetFieldChange(field: keyof WebsiteWidgetFormState, value: string) {
    handleWebsiteWidgetFieldChangeInternal(this, field, value);
  }

  async handleWebsiteWidgetProbe() {
    await handleWebsiteWidgetProbeInternal(this);
  }

  handleWebsiteWidgetSnippetInputChange(next: string) {
    handleWebsiteWidgetSnippetInputChangeInternal(this, next);
  }

  handleWebsiteWidgetSnippetApply() {
    handleWebsiteWidgetSnippetApplyInternal(this);
  }

  handleWebsiteWidgetSnippetReset() {
    handleWebsiteWidgetSnippetResetInternal(this);
  }

  handleWebsiteWidgetPreviewReload() {
    handleWebsiteWidgetPreviewReloadInternal(this);
  }

  handleWebsiteAssistFieldChange(field: keyof WebsiteAssistConfigState, value: string | boolean) {
    handleWebsiteAssistFieldChangeInternal(this, field, value);
  }

  handleWebsiteAssistTestMessageChange(value: string) {
    handleWebsiteAssistTestMessageChangeInternal(this, value);
  }

  async handleWebsiteAssistSendTest() {
    await handleWebsiteAssistSendTestInternal(this);
  }

  handleWebsiteAssistChatInputChange(value: string) {
    handleWebsiteAssistChatInputChangeInternal(this, value);
  }

  async handleWebsiteAssistChatSend() {
    await handleWebsiteAssistChatSendInternal(this);
  }

  async handleWebsiteAssistChatScreenshot() {
    await handleWebsiteAssistChatScreenshotInternal(this);
  }

  async handleWebsiteAssistChatUploadFromDevice() {
    await handleWebsiteAssistChatUploadFromDeviceInternal(this);
  }

  async handleWebsiteAssistChatRefresh() {
    await handleWebsiteAssistChatRefreshInternal(this);
  }

  handleWebsiteAssistChatToggleMinimize() {
    this.websiteAssistChatMinimized = !this.websiteAssistChatMinimized;
  }

  handleWebsiteAssistChatClose() {
    this.websiteAssistChatConversationId = "";
    this.websiteAssistChatMessages = [];
    this.websiteAssistChatMinimized = false;
  }

  private async waitForTourTarget(selector: string, timeoutMs = 2500): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (document.querySelector(selector)) {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  async startChannelsQrTutorial() {
    const ShepherdModule = await import("shepherd.js");
    const Shepherd = ShepherdModule.default;

    this.channelsQrTour?.cancel();

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        classes: "shepherd-theme-default",
        scrollTo: { behavior: "smooth", block: "center" },
        cancelIcon: {
          enabled: true,
        },
      },
    });
    this.channelsQrTour = tour;
    const clearTour = () => {
      if (this.channelsQrTour === tour) {
        this.channelsQrTour = null;
      }
    };
    tour.on("complete", clearTour);
    tour.on("cancel", clearTour);

    const ensureChannelsTab = async () => {
      if (this.tab !== "channels") {
        this.setTab("channels");
        await this.updateComplete;
      }
      await this.waitForTourTarget('[data-tour="whatsapp-card"]');
      const card = document.querySelector('[data-tour="whatsapp-card"]');
      if (card && "open" in card) {
        card.open = true;
      }
      await this.waitForTourTarget('[data-tour="whatsapp-show-qr"]');
    };
    const resolveTarget = (selector: string) => document.querySelector(selector);

    tour.addStep({
      id: "whatsapp-show-qr",
      title: "First Login: Show QR",
      text: "Start here first. Click Show QR to generate your WhatsApp pairing code before exploring other channel settings.",
      beforeShowPromise: ensureChannelsTab,
      attachTo: {
        element: () =>
          resolveTarget('[data-tour="whatsapp-show-qr"]') ??
          resolveTarget('[data-tour="whatsapp-card"]'),
        on: "bottom",
      },
      buttons: [
        {
          text: "Skip",
          action: () => tour.cancel(),
        },
        {
          text: "Next",
          action: () => tour.next(),
        },
      ],
    });

    tour.addStep({
      id: "whatsapp-qr",
      title: "Scan This QR",
      text: "Scan with WhatsApp on your phone to finish first-time linking. After this is done, you can configure Telegram and Website Widget.",
      beforeShowPromise: async () => {
        await ensureChannelsTab();
        if (!this.whatsappQrDataUrl && this.connected && !this.whatsappBusy) {
          await this.handleWhatsAppStart(false).catch(() => undefined);
          await this.updateComplete;
        }
      },
      attachTo: {
        element: () =>
          resolveTarget('[data-tour="whatsapp-qr"]') ??
          resolveTarget('[data-tour="whatsapp-show-qr"]') ??
          resolveTarget('[data-tour="whatsapp-card"]'),
        on: "top",
      },
      buttons: [
        {
          text: "Back",
          action: () => tour.back(),
        },
        {
          text: "Done - Explore Channels",
          action: () => tour.complete(),
        },
      ],
    });

    void tour.start();
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
