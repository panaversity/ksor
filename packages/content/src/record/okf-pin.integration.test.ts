import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OKF_PIN, sha256Hex } from "./lock.js";

const VENDORED = fileURLToPath(
  new URL("../../../../specs/ksor/record/okf-SPEC.md", import.meta.url),
);
const SPEC = fileURLToPath(new URL("../../../../specs/ksor/record/spec.md", import.meta.url));

/**
 * `okf.spec_sha256` is stamped into every `build.lock.json`, and its whole job
 * is provenance of the format the record claims to conform to. It was pinned to
 * upstream's bytes while the vendored copy had been through the markdown
 * formatter — 36 bytes apart, hashing to something no artefact in the tree
 * carried, and nothing compared the two. This is that comparison.
 */
describe("OKF_PIN against the vendored spec", () => {
  it("hashes the vendored copy to the pinned digest", () => {
    const bytes = readFileSync(VENDORED);
    expect(sha256Hex(bytes)).toBe(OKF_PIN.spec_sha256);
  });

  it("is the digest and byte count record spec §1 states", () => {
    const text = readFileSync(SPEC, "utf8");
    const section = text.slice(0, text.indexOf("## 1 ·"));
    expect(section).toContain(OKF_PIN.spec_sha256);
    expect(section).toContain(OKF_PIN.commit);
    expect(section).toContain(readFileSync(VENDORED).byteLength.toLocaleString("en-US"));
  });
});
