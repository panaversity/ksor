/**
 * `--instance` resolution, which touches the filesystem — so it belongs in this
 * tier and not beside `usageFor` in the unit file, however small it is
 * (AGENTS.md: the tiers are a contract, not a preference).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { instancePathOf } from "./commands.js";

/**
 * `--instance .` worked for `ksor build` and died on the write-plane verbs with
 * a raw Node errno (found on a live walk, 2026-08-25):
 *
 *     ksor schema|grant|ingest --instance .
 *     cannot read .: EISDIR: illegal operation on a directory, read
 *
 * No rule, no reason, no fix — product principle 4 unmet, and unmet in the one
 * place a reader is most likely to hit it, because `build` documents
 * `--instance <path>` as "instance.md, or a directory at or below the record
 * root" and every other verb shares the flag name. Accepting the directory is
 * the better half of the choice: it is what someone typing `.` means, it makes
 * one flag behave one way across the CLI, and it makes the documented sentence
 * true instead of true-for-one-verb.
 */
describe("instancePathOf — one --instance rule for every verb", () => {
  const root = mkdtempSync(join(tmpdir(), "ksor-instpath-"));
  writeFileSync(join(root, "instance.md"), "---\nformat: 2\nname: x\n---\n");
  mkdirSync(join(root, "knowledge", "deep"), { recursive: true });

  it("a path to the file is used as given", () => {
    expect(instancePathOf(join(root, "instance.md"))).toBe(join(root, "instance.md"));
  });

  it("a DIRECTORY resolves to the instance.md at or above it — the build rule", () => {
    expect(instancePathOf(root)).toBe(join(root, "instance.md"));
    expect(
      instancePathOf(join(root, "knowledge", "deep")),
      "at or BELOW the record root, exactly as `ksor build` documents it",
    ).toBe(join(root, "instance.md"));
  });

  it("a directory with no instance.md above it is left alone, so the reader refuses by name", () => {
    // Not this function's job to invent a refusal: returning the path unchanged
    // lets `loadInstance` produce the ordinary ENOENT-shaped message rather than
    // two competing explanations of the same problem.
    const bare = mkdtempSync(join(tmpdir(), "ksor-noinst-"));
    expect(instancePathOf(bare)).toBe(bare);
  });

  it("a path that does not exist is left alone", () => {
    expect(instancePathOf(join(root, "nope.md"))).toBe(join(root, "nope.md"));
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));
});
