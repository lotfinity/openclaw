import type { ChannelsState } from "./channels.types.ts";
import { ChannelsStatusSnapshot } from "../types.ts";

export type { ChannelsState };

export async function loadChannels(state: ChannelsState, probe: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.channelsLoading) {
    return;
  }
  state.channelsLoading = true;
  state.channelsError = null;
  try {
    const res = await state.client.request<ChannelsStatusSnapshot | null>("channels.status", {
      probe,
      timeoutMs: 8000,
    });
    state.channelsSnapshot = res;
    state.channelsLastSuccess = Date.now();
  } catch (err) {
    state.channelsError = String(err);
  } finally {
    state.channelsLoading = false;
  }
}

export async function startWhatsAppLogin(state: ChannelsState, force: boolean) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{ message?: string; qrDataUrl?: string }>(
      "web.login.start",
      {
        force,
        mode: "qr",
        timeoutMs: 30000,
      },
    );
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginQrDataUrl = res.qrDataUrl ?? null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function waitWhatsAppLogin(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{ message?: string; connected?: boolean }>(
      "web.login.wait",
      {
        timeoutMs: 120000,
      },
    );
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginConnected = res.connected ?? null;
    if (res.connected) {
      state.whatsappLoginQrDataUrl = null;
    }
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function logoutWhatsApp(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{
      cleared?: boolean;
      remoteLoggedOut?: boolean;
      localCleared?: boolean;
    }>("channels.logout", { channel: "whatsapp" });
    if (res?.remoteLoggedOut && res?.localCleared) {
      state.whatsappLoginMessage = "WAHA session logged out and local credentials cleared.";
    } else if (res?.remoteLoggedOut) {
      state.whatsappLoginMessage = "WAHA session logged out.";
    } else if (res?.localCleared) {
      state.whatsappLoginMessage = "Local WhatsApp credentials cleared.";
    } else if (res?.cleared) {
      state.whatsappLoginMessage = "WhatsApp logout completed.";
    } else {
      state.whatsappLoginMessage = "No WhatsApp session found.";
    }
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
  } finally {
    state.whatsappBusy = false;
  }
}

export async function requestWhatsAppPairCode(state: ChannelsState, phoneNumber: string) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  const normalized = phoneNumber.trim();
  if (!normalized) {
    state.whatsappLoginMessage = "Enter a phone number in E.164 format first.";
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{ message?: string; qrDataUrl?: string }>(
      "web.login.start",
      {
        mode: "request-code",
        phoneNumber: normalized,
        timeoutMs: 15000,
      },
    );
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginQrDataUrl = res.qrDataUrl ?? null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
  } finally {
    state.whatsappBusy = false;
  }
}

export async function fetchWhatsAppScreenshot(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    const res = await state.client.request<{ message?: string; imageDataUrl?: string }>(
      "web.whatsapp.screenshot",
      {},
    );
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappScreenshotDataUrl = res.imageDataUrl ?? null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappScreenshotDataUrl = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export function closeWhatsAppScreenshot(state: ChannelsState) {
  state.whatsappScreenshotDataUrl = null;
}
