import { describe, expect, it } from "vitest";
import {
  buildWidgetSnippet,
  parseWidgetSnippet,
  type WebsiteWidgetFormState,
} from "./channels.website-widget.ts";

const SAMPLE_FORM: WebsiteWidgetFormState = {
  gatewayUrl: "wss://gateway.example.com",
  token: "tok_123",
  sessionKey: "widget:example:main",
  title: "Support Chat",
  accentColor: "#0f766e",
  launcherLabel: "Help",
  placeholder: "Ask us anything",
  widgetWidth: "440px",
  widgetHeight: "720px",
  position: "left",
};

describe("website widget snippet helpers", () => {
  it("builds a full snippet", () => {
    const snippet = buildWidgetSnippet(SAMPLE_FORM);
    expect(snippet).toContain("window.OpenClawWidgetConfig");
    expect(snippet).toContain('gatewayUrl: "wss://gateway.example.com"');
    expect(snippet).toContain('position: "left"');
    expect(snippet).toContain("/widget/openclaw-widget.js");
  });

  it("preserves gateway base path in script src", () => {
    const snippet = buildWidgetSnippet({
      ...SAMPLE_FORM,
      gatewayUrl: "wss://gateway.example.com/control",
    });
    expect(snippet).toContain(
      'src="https://gateway.example.com/control/widget/openclaw-widget.js"',
    );
  });

  it("parses supported fields from snippet", () => {
    const snippet = `
<script>
window.OpenClawWidgetConfig = {
  token: "abc",
  gatewayUrl: "wss://gw.example",
  sessionKey: "widget:site:main",
  title: "Chat",
  accentColor: "#00897b",
  launcherLabel: "Talk",
  placeholder: "Write...",
  widgetWidth: "500px",
  widgetHeight: "700px",
  position: "right",
};
</script>
<script src="https://gw.example/widget/openclaw-widget.js" defer></script>
`;
    const parsed = parseWidgetSnippet(snippet);
    expect(parsed.fieldCount).toBe(10);
    expect(parsed.config.gatewayUrl).toBe("wss://gw.example");
    expect(parsed.config.position).toBe("right");
    expect(parsed.config.widgetWidth).toBe("500px");
  });

  it("throws when config block is missing", () => {
    expect(() => parseWidgetSnippet("<script></script>")).toThrow(/OpenClawWidgetConfig/i);
  });
});
