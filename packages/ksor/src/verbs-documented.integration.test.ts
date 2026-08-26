/**
 * Every verb the binary has must be named where a reader looks for verbs.
 *
 * `takedown` and `grant` existed, worked, and appeared in `ksor --help` while
 * the bundled docs and `docs/status.md` — the file AGENTS.md calls "the only
 * authority on what is implemented" — listed neither. The scaffold's own
 * `pnpm build` shells out to `ksor takedown --export`, so an agent operating a
 * scaffolded project met a verb its documentation did not contain (round-6
 * review of #43).
 *
 * Product principle 1 is that docs are priority #1 because agents read them
 * before they ever run the product; AGENTS.md adds that any list rendered into
 * a doc is generated from source with a drift test, or not rendered at all.
 * This is that drift test — the list stays hand-written, and this fails when it
 * stops matching the binary.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { verbs } from "./index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string): string => readFileSync(path.join(repoRoot, rel), "utf8");

/**
 * `init` names the product's entry point and is described at length rather
 * than listed; everything else is a verb a reader has to be able to find.
 */
const EXEMPT = new Set(["init"]);

describe("the verb vocabulary is documented where it is claimed", () => {
  const expected = verbs.filter((v) => !EXEMPT.has(v));

  it("has verbs to check", () => {
    expect(expected.length).toBeGreaterThan(5);
  });

  it.each([
    ["docs/status.md", "the only authority on what is implemented"],
    ["packages/ksor/docs/index.md", "the docs shipped inside the npm tarball"],
    // README carries the CLI vocabulary and was NOT on this list, so it
    // drifted the moment the list was written: the branch edited that very
    // block to add `ksor grant` and left `ksor takedown` out (round-9 review
    // of #43).
    ["README.md", "the product pitch, which carries the CLI vocabulary"],
  ])("%s names every verb", (file, why) => {
    const text = read(file);
    // `ksor <verb>` as a COMMAND: inline code, or a line in a fenced block.
    // A bare `` `serve` `` mentioned in prose is not documenting the verb
    // (round-8 review of #43), and a fenced `ksor serve` line is.
    const fenced = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n");
    const named = (verb: string): boolean =>
      new RegExp(`\`ksor ${verb}\``).test(text) ||
      new RegExp(`^\\s*ksor ${verb}\\b`, "m").test(fenced);
    const missing = expected.filter((verb) => !named(verb));
    expect(missing, `${why} — missing: ${missing.join(", ")}`).toEqual([]);
  });
});

/**
 * `1` and `2` are different promises, so a doc may not make both about one verb.
 *
 * status.md said "`ksor build` and `ksor migrate` are implemented on the
 * unreleased branch and exit `2` in the published package" — while stating
 * correctly, 838 lines earlier, that the published package has no `migrate`
 * verb at all. Verified against @panaversity/ksor@0.0.40: `migrate` prints
 * `error: unknown-verb` and exits 1, `build` prints the not-implemented notice
 * and exits 2. Product principle 4 makes those codes a contract, so an agent
 * probing a verb and reading `2` as "designed, coming" was being told a
 * refusal for an unknown word was a promise.
 */
describe("docs/status.md keeps the two exit codes apart", () => {
  it("never claims exit 2 for a verb it says the published package does not have", () => {
    const flat = read("docs/status.md").replace(/\s+/g, " ");
    const contradictory = verbs.filter((verb) => {
      const absent = new RegExp(`there is no \`${verb}\` verb`).test(flat);
      const exitTwo = new RegExp(`\`ksor ${verb}\`[^.]*exits? \`2\` in the published package`).test(
        flat,
      );
      return absent && exitTwo;
    });
    expect(
      contradictory,
      "a verb the published package does not have is refused with exit 1 and " +
        "`error: unknown-verb`, never the exit-2 not-implemented notice",
    ).toEqual([]);
  });
});
