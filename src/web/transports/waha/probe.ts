#!/usr/bin/env node
import type { ResolvedWhatsAppAccount } from "../../accounts.js";
/**
 * WAHA GOWS capability probe.
 *
 * Reads WAHA config from the project config file, with env var / CLI overrides.
 *
 * Usage:
 *   npx tsx src/web/transports/waha/probe.ts --to +15551234567
 *   npx tsx src/web/transports/waha/probe.ts --to +15551234567 --url http://localhost:3000 --key mykey --session default
 *
 * --to        Recipient number (E.164). Use your own number to self-message.
 * --url       WAHA base URL (overrides config). Also: WAHA_URL env var.
 * --key       WAHA API key (overrides config). Also: WAHA_API_KEY env var.
 * --session   WAHA session name (overrides config). Also: WAHA_SESSION env var.
 * --account   Account ID to use from config (default: "default").
 */
import { loadConfig } from "../../../config/config.js";
import { resolveWhatsAppAccount } from "../../accounts.js";
import {
  sendMediaViaWaha,
  sendPollViaWaha,
  sendReactionViaWaha,
  sendTextViaWaha,
} from "./client.js";

// A minimal 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Real 1-second silent OGG Opus file (generated via ffmpeg, valid for WhatsApp)
const TINY_OGG = Buffer.from(
  "T2dnUwACAAAAAAAAAADWXqwGAAAAAEbA31kBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAANZerAYBAAAAhf0AaAE+T3B1c1RhZ3MNAAAATGF2ZjYwLjE2LjEwMAEAAAAdAAAAZW5jb2Rlcj1MYXZjNjAuMzEuMTAyIGxpYm9wdXNPZ2dTAACAuwAAAAAAANZerAYCAAAAVJG01zIHBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBggL5LmgvIQIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsYIB8azDsZPZ2dTAAS4vAAAAAAAANZerAYDAAAAnjyXzQEGCAfGsw7G",
  "base64",
);

function parseArgs(argv: string[]): {
  to: string;
  accountId: string;
  url: string;
  key: string;
  session: string;
} {
  let to = "";
  let accountId = "default";
  let url = process.env.WAHA_URL ?? "";
  let key = process.env.WAHA_API_KEY ?? "";
  let session = process.env.WAHA_SESSION ?? "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--to" && argv[i + 1]) {
      to = argv[++i]!;
    }
    if (argv[i] === "--account" && argv[i + 1]) {
      accountId = argv[++i]!;
    }
    if (argv[i] === "--url" && argv[i + 1]) {
      url = argv[++i]!;
    }
    if (argv[i] === "--key" && argv[i + 1]) {
      key = argv[++i]!;
    }
    if (argv[i] === "--session" && argv[i + 1]) {
      session = argv[++i]!;
    }
  }
  return { to, accountId, url, key, session };
}

async function probe(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗  ${label}: ${msg}`);
    return false;
  }
}

async function sessionStatus(
  account: Awaited<ReturnType<typeof resolveWhatsAppAccount>>,
): Promise<string> {
  const session = account.waha?.session ?? "default";
  const baseUrl = (account.waha?.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = account.waha?.apiKey?.trim() || undefined;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  const res = await fetch(`${baseUrl}/api/sessions/${session}`, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { status?: string; engine?: string; name?: string };
  return `${json.status ?? "UNKNOWN"} (engine: ${json.engine ?? "?"}, session: ${json.name ?? session})`;
}

async function main() {
  const {
    to,
    accountId,
    url: urlArg,
    key: keyArg,
    session: sessionArg,
  } = parseArgs(process.argv.slice(2));

  if (!to) {
    console.error(
      "Usage: probe.ts --to +<number> [--url http://...] [--key apikey] [--session name] [--account id]",
    );
    process.exit(1);
  }

  const cfg = loadConfig();
  const fromConfig = resolveWhatsAppAccount({ cfg, accountId });

  if (fromConfig.transport !== "waha" && !urlArg) {
    console.error(
      `Account "${accountId}" uses transport "${fromConfig.transport}" and no --url override given.`,
    );
    process.exit(1);
  }

  // CLI/env args override whatever is in the config file
  const account: ResolvedWhatsAppAccount = {
    ...fromConfig,
    transport: "waha",
    waha: {
      baseUrl: urlArg || fromConfig.waha?.baseUrl || "",
      apiKey: keyArg || fromConfig.waha?.apiKey || undefined,
      session: sessionArg || fromConfig.waha?.session || "default",
    },
  };

  console.log(`\nWAHA GOWS capability probe`);
  console.log(`  baseUrl : ${account.waha?.baseUrl ?? "(unset)"}`);
  console.log(`  session : ${account.waha?.session ?? "default"}`);
  console.log(`  to      : ${to}`);
  console.log();

  // 1. Connectivity + session status
  let sentMessageId: string | null = null;
  await probe("session reachable + WORKING", async () => {
    const status = await sessionStatus(account);
    if (!status.toUpperCase().startsWith("WORKING")) {
      throw new Error(`Session status: ${status}`);
    }
    console.log(`       → ${status}`);
  });

  // 2. Text
  await probe("sendText", async () => {
    const { messageId } = await sendTextViaWaha(account, to, "[openclaw probe] text ✓");
    if (!messageId || messageId === "unknown") {
      throw new Error(`bad messageId: ${messageId}`);
    }
    sentMessageId = messageId;
    console.log(`       → messageId: ${messageId}`);
  });

  // 3. Poll
  await probe("sendPoll", async () => {
    const { messageId } = await sendPollViaWaha(account, to, {
      question: "[openclaw probe] poll ✓",
      options: ["Option A", "Option B"],
      maxSelections: 1,
    });
    if (!messageId || messageId === "unknown") {
      throw new Error(`bad messageId: ${messageId}`);
    }
    console.log(`       → messageId: ${messageId}`);
  });

  // 4. Media (image)
  await probe("sendMedia (image/png)", async () => {
    const { messageId } = await sendMediaViaWaha(
      account,
      to,
      "[openclaw probe] image ✓",
      TINY_PNG,
      "image/png",
      "probe.png",
    );
    if (!messageId || messageId === "unknown") {
      throw new Error(`bad messageId: ${messageId}`);
    }
    console.log(`       → messageId: ${messageId}`);
  });

  // 5. Media (audio / voice)
  await probe("sendMedia (audio/ogg opus → sendVoice)", async () => {
    const { messageId } = await sendMediaViaWaha(
      account,
      to,
      "",
      TINY_OGG,
      "audio/ogg; codecs=opus",
      "voice.ogg",
    );
    if (!messageId || messageId === "unknown") {
      throw new Error(`bad messageId: ${messageId}`);
    }
    console.log(`       → messageId: ${messageId}`);
  });

  // 6. Reaction (needs the text messageId from step 2)
  if (sentMessageId) {
    const msgId = sentMessageId;
    await probe("sendReaction (✅ on text message)", async () => {
      await sendReactionViaWaha(account, msgId, "✅");
    });
  } else {
    console.log(`  -  sendReaction: skipped (no messageId from sendText step)`);
  }

  console.log();
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});
