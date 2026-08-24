/**
 * The usage text is the CLI's only documentation of its own flags, and
 * `usageFor` slices ONE verb's block out of it by finding the next `  ksor
 * <verb>` heading. So a verb with more than one invocation form silently loses
 * every form after the first — which is exactly what happened to `takedown`
 * when it grew from one shape to three, and no test saw it (the same class of
 * cut that once made `ingest --help` print no description at all).
 */

import { describe, expect, it } from "vitest";

import { usageFor } from "./commands.js";

describe("usageFor", () => {
  it("prints every one of a verb's invocation forms, not only the first", () => {
    const block = usageFor("takedown");
    for (const flag of [
      "--scope node|subtree",
      "--file-only",
      "--revoke ENTRY-ID",
      "--removed ENTRY-ID",
      "--apply",
      "--list",
      "--ledger",
      "--actor",
    ]) {
      expect(block, `\`${flag}\` is missing from \`ksor takedown --help\`:\n${block}`).toContain(
        flag,
      );
    }
  });

  it("stops at the NEXT verb, so one verb's help never carries another's", () => {
    expect(usageFor("takedown")).not.toContain("ksor gc");
    expect(usageFor("ingest")).not.toContain("ksor calibrate");
  });
});
