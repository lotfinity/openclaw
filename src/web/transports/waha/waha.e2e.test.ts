/**
 * WAHA GOWS integration tests — run against a real WAHA instance.
 *
 * Usage:
 *   WAHA_INTEGRATION=1 \
 *   WAHA_URL=http://localhost:3000 \
 *   WAHA_API_KEY=your-key \
 *   WAHA_SESSION=default \
 *   WAHA_TEST_TO=+15551234567 \
 *   npx vitest run src/web/transports/waha/waha.e2e.test.ts
 *
 * WAHA_TEST_TO can be your own number (GOWS supports self-messaging).
 * All tests are skipped unless WAHA_INTEGRATION=1 and WAHA_TEST_TO is set.
 */
import { describe, expect, it } from "vitest";
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
import {
  sendMediaViaWaha,
  sendPollViaWaha,
  sendReactionViaWaha,
  sendTextViaWaha,
} from "./client.js";

const ENABLED = process.env.WAHA_INTEGRATION === "1";
const TO = process.env.WAHA_TEST_TO ?? "";

const account = {
  accountId: "default",
  transport: "waha",
  waha: {
    baseUrl: (process.env.WAHA_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    apiKey: process.env.WAHA_API_KEY || undefined,
    session: process.env.WAHA_SESSION ?? "default",
  },
} as unknown as ResolvedWhatsAppAccount;

// A minimal 1x1 transparent PNG — no external file needed
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Real 1-second silent OGG Opus file (generated via ffmpeg, valid for WhatsApp)
const TINY_OGG = Buffer.from(
  "T2dnUwACAAAAAAAAAADWXqwGAAAAAEbA31kBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAANZerAYBAAAAhf0AaAE+T3B1c1RhZ3MNAAAATGF2ZjYwLjE2LjEwMAEAAAAdAAAAZW5jb2Rlcj1MYXZjNjAuMzEuMTAyIGxpYm9wdXNPZ2dTAACAuwAAAAAAANZerAYCAAAAVJG01zIHBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBggL5LmgvIQIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsZPZ2dTAAS4vAAAAAAAANZerAYDAAAAnjyXzQEGCAfGsw7G",
  "base64",
);

async function sessionStatus(): Promise<string> {
  const session = account.waha?.session ?? "default";
  const baseUrl = account.waha?.baseUrl ?? "";
  const apiKey = account.waha?.apiKey;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  const res = await fetch(`${baseUrl}/api/sessions/${session}`, { headers });
  if (!res.ok) {
    throw new Error(`Session status fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as { status?: string };
  return json.status ?? "UNKNOWN";
}

describe("WAHA GOWS integration", () => {
  it.skipIf(!ENABLED)("session is WORKING", async () => {
    const status = await sessionStatus();
    expect(status.toUpperCase()).toBe("WORKING");
  });

  it.skipIf(!ENABLED || !TO)("sendTextViaWaha returns a messageId", async () => {
    const result = await sendTextViaWaha(account, TO, "[openclaw probe] text ✓");
    expect(typeof result.messageId).toBe("string");
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it.skipIf(!ENABLED || !TO)("sendPollViaWaha returns a messageId", async () => {
    const result = await sendPollViaWaha(account, TO, {
      question: "[openclaw probe] Which works?",
      options: ["Polls ✓", "Not sure"],
      maxSelections: 1,
    });
    expect(typeof result.messageId).toBe("string");
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it.skipIf(!ENABLED || !TO)("sendMediaViaWaha image returns a messageId", async () => {
    const result = await sendMediaViaWaha(
      account,
      TO,
      "[openclaw probe] image ✓",
      TINY_PNG,
      "image/png",
      "probe.png",
    );
    expect(typeof result.messageId).toBe("string");
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it.skipIf(!ENABLED || !TO)("sendMediaViaWaha audio/ogg returns a messageId", async () => {
    const result = await sendMediaViaWaha(
      account,
      TO,
      "",
      TINY_OGG,
      "audio/ogg; codecs=opus",
      "voice.ogg",
    );
    expect(typeof result.messageId).toBe("string");
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it.skipIf(!ENABLED || !TO)("sendReactionViaWaha does not throw", async () => {
    // Send a text first so we have a real messageId to react to
    const { messageId } = await sendTextViaWaha(account, TO, "[openclaw probe] reaction target");
    expect(messageId).toBeTruthy();
    // Reactions may need a short delay on some engines — GOWS is generally instant
    await sendReactionViaWaha(account, messageId, "✅");
    // If we get here without throwing, reaction capability is working
  });
});
