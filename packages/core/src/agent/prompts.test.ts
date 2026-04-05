import { describe, expect, it } from "vitest";
import { shellPentestPrompt } from "./prompts.js";

describe("shellPentestPrompt", () => {
  it("includes explicit browser-first XSS guidance when browser support exists", () => {
    const prompt = shellPentestPrompt("http://target.test", undefined, { hasBrowser: true });

    expect(prompt).toContain("## Browser tool (Playwright)");
    expect(prompt).toContain("### XSS browser flow");
    expect(prompt).toContain("Never save an XSS finding without browser evidence");
    expect(prompt).toContain("do NOT save an XSS unless browser evidence proves execution");
  });

  it("does not mention browser-specific XSS flow when browser support is unavailable", () => {
    const prompt = shellPentestPrompt("http://target.test");

    expect(prompt).not.toContain("## Browser tool (Playwright)");
    expect(prompt).not.toContain("### XSS browser flow");
  });
});
