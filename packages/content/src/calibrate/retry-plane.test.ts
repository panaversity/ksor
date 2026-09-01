/**
 * Calibration measures on the PATIENT retry, with the QUERY intent.
 *
 * Two axes, and they were confused into one. The INTENT must stay `"query"`:
 * a floor has to be measured through the same vendor task label the door will
 * use, or the number describes a space nothing serves. The RETRY POLICY must be
 * the ingest plane's: calibration is build-plane batch work with nobody
 * waiting, which is the case `isRetryable`'s own comment describes.
 *
 * `aembedIntent` never retries a 429, and is right not to — a rate-limited
 * search should degrade to keyword-only in under a second rather than stall a
 * reader behind backoff. Calibration inherited that fail-fast policy, and on a
 * free-tier key that meant the single command which turns on this product's
 * headline feature was refused mid-measurement (walked live, 2026-09-01).
 *
 * Asserted as a property of the SOURCE, because the alternative is a live
 * rate-limited provider, which is exactly the thing that cannot be arranged on
 * demand. Crude, and it fails on the one edit that would reintroduce the bug.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
// Comments stripped: this file's own prose names `aembedIntent` to explain why
// it is not used, and a bare word-match reads that as the defect. Caught by
// running the assertion before mutating anything — it failed on the fixed code.
const run = readFileSync(path.join(here, "run.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

describe("the calibration runner's embed call", () => {
  it("uses the ingest plane's patient door, which retries a 429", () => {
    expect(
      /embedIntent\(\[query\]/.test(run),
      "calibration must embed through `embedIntent` — the patient retry",
    ).toBe(true);
  });

  it("does NOT use the fail-fast query door", () => {
    // The one edit that reintroduces the defect is swapping this back.
    expect(
      /aembedIntent\s*\(/.test(run),
      "`aembedIntent` never retries a 429: correct for a live search, wrong for " +
        "a measurement nobody is waiting on",
    ).toBe(false);
  });

  it("keeps the QUERY intent — the other axis, which must not move", () => {
    // Measuring through the document label would produce a floor for a space
    // the door does not search in.
    expect(/intent: "query"/.test(run)).toBe(true);
  });
});
