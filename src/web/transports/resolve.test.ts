import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveWhatsAppTransportId } from "./resolve.js";

describe("resolveWhatsAppTransportId", () => {
  it("defaults to baileys", () => {
    expect(resolveWhatsAppTransportId({} as OpenClawConfig)).toBe("baileys");
  });

  it("uses channel-level transport when present", () => {
    expect(
      resolveWhatsAppTransportId({
        channels: {
          whatsapp: {
            transport: "waha",
          },
        },
      } as OpenClawConfig),
    ).toBe("waha");
  });

  it("prefers account-level transport over channel-level transport", () => {
    expect(
      resolveWhatsAppTransportId(
        {
          channels: {
            whatsapp: {
              transport: "baileys",
              accounts: {
                work: {
                  transport: "waha",
                },
              },
            },
          },
        } as OpenClawConfig,
        "work",
      ),
    ).toBe("waha");
  });
});
