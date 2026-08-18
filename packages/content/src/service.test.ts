import { describe, expect, it } from "vitest";

import { CONTENT_ADVISORY, instructionLike, stripAssetMarkup } from "./service.js";

describe("stripAssetMarkup", () => {
  it("replaces paired and self-closing svg with [diagram]", () => {
    expect(stripAssetMarkup('before <svg viewBox="0 0 4 4"><rect/></svg> after')).toBe(
      "before [diagram] after",
    );
    expect(stripAssetMarkup('icon <svg class="i"/> end')).toBe("icon [diagram] end");
  });

  it("a malformed leading svg cannot swallow prose up to a later close (tempered)", () => {
    const text = "<svg><p>real prose</p>\n\nmore prose <svg></svg>";
    const stripped = stripAssetMarkup(text);
    expect(stripped, stripped).toContain("real prose");
  });
});

describe("instructionLike", () => {
  it("fires on imperative directives, not on every code fence", () => {
    expect(instructionLike("Paste this prompt into your agent")).toBe(true);
    expect(instructionLike("run the following command in your shell")).toBe(true);
    expect(instructionLike("```js\nconst x = 1;\n```")).toBe(false);
    expect(CONTENT_ADVISORY).toContain("never execute");
  });
});
