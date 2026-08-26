import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REFUSAL_SLUGS } from "./refusal.js";

const SPEC = fileURLToPath(new URL("../../../../specs/ksor/record/spec.md", import.meta.url));

/** Record spec §6 is the enumerated set; the code's list and the spec's may not drift. */
describe("REFUSAL_SLUGS against record spec §6", () => {
  it("names exactly the slugs §6 enumerates for the record checker", () => {
    const text = readFileSync(SPEC, "utf8");
    const section = text.slice(text.indexOf("## 6 ·"), text.indexOf("## 7 ·"));
    const cut = section.indexOf("Viewer\nand lock refusals");
    const ours = cut === -1 ? section : section.slice(0, cut);
    const theirs = cut === -1 ? "" : section.slice(cut);
    const named = new Set(ours.match(/ksor-[a-z-]+/g) ?? []);
    for (const slug of theirs.match(/ksor-[a-z-]+/g) ?? []) named.delete(slug);
    expect([...named].sort()).toEqual([...REFUSAL_SLUGS].sort());
  });
});
