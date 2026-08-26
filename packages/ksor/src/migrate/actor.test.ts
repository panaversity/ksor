import { describe, expect, it } from "vitest";

import { isWritableActor } from "./actor.js";

/**
 * The record module's `isIndividualActor` matches `^(human|process|team):(\S+)$`
 * — an id of ANY non-whitespace characters. That is the right rule for READING
 * a record someone else already wrote; it is the wrong rule for deciding what
 * migrate may WRITE into a governance file, because `\S+` admits every YAML
 * indicator there is. This is the writing rule.
 */
describe("isWritableActor", () => {
  it.each([
    "human:kim",
    "human:j.smith",
    "human:kliu@example.com",
    "human:audit-lead",
    "process:nightly-finance",
    "ksor-migrate/0.0.40",
  ])("accepts %s", (value) => {
    expect(isWritableActor(value)).toBe(true);
  });

  it.each([
    ["it closes a flow sequence", "human:a]"],
    ["it opens one", "human:a["],
    ["it splits into two authorities", "human:a,b"],
    ["it comments the rest of the line out", "human:a#c"],
    ["it opens a quote", 'human:"a"'],
    ["it opens a single quote", "human:'a'"],
    ["it opens a flow mapping", "human:{a}"],
    ["it is a newline", "human:a\nb"],
    ["it is a carriage return", "human:a\rb"],
    ["it is a tab", "human:a\tb"],
    ["it is an alias", "human:*a"],
    ["it is an anchor", "human:&a"],
    ["it is a control character", "human:a\u0007b"],
    // JS `^`/`$` stop at U+2028 where YAML 1.2 does not — the same asymmetry
    // decision 26 records for the frontmatter fence.
    ["it is a line separator", "human:a\u2028b"],
    ["it names nobody", ""],
    ["it names no kind", "jane"],
    ["it names a group, not an individual", "team:people-ops"],
    ["it has no id at all", "human:"],
    ["it is longer than any identity", `human:${"a".repeat(10240)}`],
  ])("refuses one because %s", (_why, value) => {
    expect(isWritableActor(value)).toBe(false);
  });

  // Whatever it admits, the record's own readers must admit too — a stricter
  // writing rule is safe, a wider one would write a file the checker refuses.
  it("admits nothing the record module would reject", async () => {
    const { isIndividualActor } = await import("@panaversity/ksor-content/record");
    for (const value of ["human:kim", "human:kliu@example.com", "ksor-migrate/0.0.40"]) {
      expect(isWritableActor(value) && isIndividualActor(value)).toBe(true);
    }
  });
});
