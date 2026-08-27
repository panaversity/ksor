/**
 * The calibration report's printed block, pasted.
 *
 * `ksor calibrate` ends with "Paste into instance.md:" and then a block. An
 * adopter followed it literally and the file was refused — the report printed
 *
 *     Paste into instance.md:
 *       vector_floor: 0.609   # calibrated …
 *       floor_digest: 8bfb07d0e6f5
 *
 * and `vector_floor` is not a top-level key of the instance; it lives under
 * `retrieval:`. Both `ksor build` and `ksor serve` then refused the file, so
 * nothing shipped — but the one instruction the report gives was wrong, and the
 * intended operator is a coding agent that will paste it verbatim.
 *
 * Indentation is part of the paste, not decoration: a block indented two spaces
 * for the terminal lands inside a frontmatter as a nested mapping under the key
 * above it, which `yaml` refuses with "Nested mappings are not allowed in
 * compact mappings" (measured, 2026-08-26). So this asserts the round trip
 * rather than the wording: render the report, take the printed block EXACTLY as
 * printed, splice it into a real instance.md, and parse it with the reader every
 * surface uses.
 */
import { describe, expect, it } from "vitest";

import { fixture } from "./fixtures/math.js";
import { buildReport, renderReport } from "./math.js";
import { parseInstanceDocument } from "../record/instance.js";

const CLOCK = new Date("2026-08-21T00:00:00Z");

const HEAD = `format: 2
name: acme-handbook
title: Acme Handbook
description: The governed handbook of Acme.
`;

/**
 * What a reader copies: the block the report ENDS with, taken byte-for-byte.
 *
 * Both verdicts end in one, which is the property this depends on — a report
 * that buries its paste target in the middle is a report whose last word is
 * something else.
 */
function pastedBlock(rendered: string): string {
  const lines = rendered.trimEnd().split("\n");
  const start = lines.lastIndexOf("retrieval:");
  expect(start, `the report does not end in a pasteable block:\n${rendered}`).toBeGreaterThan(-1);
  expect(lines[start - 1] ?? "", "the block is introduced by an instruction").toMatch(/:$|^$/);
  return lines.slice(start).join("\n");
}

function paste(block: string): ReturnType<typeof parseInstanceDocument> {
  return parseInstanceDocument(`---\n${HEAD}${block}\n---\n\nScope.\n`, "instance.md");
}

describe("the block `ksor calibrate` tells you to paste is a block instance.md accepts", () => {
  const separable = fixture.report_cases.filter((c) => c.expected.separable);
  const notSeparable = fixture.report_cases.filter((c) => !c.expected.separable);

  it("the fixture covers both verdicts", () => {
    expect(separable.length).toBeGreaterThan(0);
    expect(notSeparable.length).toBeGreaterThan(0);
  });

  it("a SEPARABLE measurement's block parses, and carries the floor it measured", () => {
    for (const c of separable) {
      const report = buildReport(c.detail, c.meta, c.target_precision, CLOCK);
      const block = pastedBlock(renderReport(report, "8bfb07d0e6f5"));
      const read = paste(block);
      expect(read.ok, `${c.name} — refused:\n${block}\n${JSON.stringify(read, null, 2)}`).toBe(
        true,
      );
      if (!read.ok) continue;
      const retrieval = read.instance.retrieval as Record<string, unknown> | null;
      expect(retrieval, c.name).not.toBeNull();
      expect(retrieval?.["vector_floor"], `${c.name} — the floor that was measured`).toBe(
        report.paste,
      );
      expect(retrieval?.["floor_digest"], `${c.name} — the predicate it was measured through`).toBe(
        "8bfb07d0e6f5",
      );
    }
  });

  it("a NON-separable measurement's fail-closed block parses too, as `uncalibrated`", () => {
    for (const c of notSeparable) {
      const report = buildReport(c.detail, c.meta, c.target_precision, CLOCK);
      const block = pastedBlock(renderReport(report, "8bfb07d0e6f5"));
      const read = paste(block);
      expect(read.ok, `${c.name} — refused:\n${block}\n${JSON.stringify(read, null, 2)}`).toBe(
        true,
      );
      if (!read.ok) continue;
      const retrieval = read.instance.retrieval as Record<string, unknown> | null;
      expect(retrieval?.["vector_floor"], c.name).toBe("uncalibrated");
    }
  });

  it("the block is written at column 0 — the only indentation that pastes", () => {
    // Two spaces reads well in a terminal and is a YAML error inside a
    // frontmatter, because the key above it is not a mapping.
    for (const c of fixture.report_cases) {
      const report = buildReport(c.detail, c.meta, c.target_precision, CLOCK);
      const block = pastedBlock(renderReport(report, null));
      expect(block.split("\n")[0], c.name).toBe("retrieval:");
    }
  });
});
