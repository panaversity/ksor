import { describe, expect, it } from "vitest";

import { composeInstructions } from "./server.js";

const SCAFFOLD_BODY = `# Knowledge System of Record

The heading above is this record's **display title**.

This Knowledge System of Record is authoritative for — _fill this in; it is
the single most important sentence in the project._

Ask your coding agent to run the **intake interview**.`;

describe("composeInstructions", () => {
  it("always states the four framework rules, whatever the adopter wrote", () => {
    for (const body of ["", SCAFFOLD_BODY, "We are authoritative for factory safety."]) {
      const out = composeInstructions(body);
      expect(out, "answer-only-from-the-record").toMatch(/ONLY from passages/i);
      expect(out, "cite provenance").toMatch(/cite the provenance/i);
      expect(out, "untrusted content").toMatch(/UNTRUSTED/);
      expect(out, "gate disclosure").toMatch(/"gate"/);
    }
  });

  it("keeps an authored body verbatim beneath the floor", () => {
    const body = "We are authoritative for factory safety procedures.";
    const out = composeInstructions(body);
    expect(out).toContain(body);
    expect(out.indexOf(body)).toBeGreaterThan(out.indexOf("ONLY from passages"));
  });

  it("does NOT serve the unedited scaffold template as instructions", () => {
    const out = composeInstructions(SCAFFOLD_BODY);
    expect(out, "the placeholder sentence must not reach an agent").not.toContain("_fill this in");
    expect(out, "build-time authoring guidance is not a runtime instruction").not.toContain(
      "intake interview",
    );
    expect(out).toMatch(/has not yet been described/i);
  });

  it("says the scope is unstated for an empty body rather than staying silent", () => {
    expect(composeInstructions("")).toMatch(/has not yet been described/i);
    expect(composeInstructions("   \n  ")).toMatch(/has not yet been described/i);
  });

  it("treats a body that merely mentions the intake interview as authored", () => {
    // Only the template's own sentence marks it unedited — an owner who writes
    // real prose and happens to reference the skill has still described it.
    const body = "We cover safety. See the intake interview notes for history.";
    expect(composeInstructions(body)).toContain(body);
    expect(composeInstructions(body)).not.toMatch(/has not yet been described/i);
  });
});
