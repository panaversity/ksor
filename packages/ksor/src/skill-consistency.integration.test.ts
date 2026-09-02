/**
 * A skill's prose must agree with itself, with the program it names, and with
 * the set of skills that ship.
 *
 * Every defect this holds against was found shipped, in one review of the
 * scaffold as an adopter's agent reads it (2026-09-02):
 *
 *   - `intake-interview`'s DESCRIPTION — the always-resident trigger — said
 *     "seven questions" while its body said "Ask THREE questions" (cut to
 *     three on 2026-08-26; the description was never updated).
 *   - The same body handed off to "question 4" and "question 5", neither of
 *     which existed any more, so the hand-off #50 is about pointed at nothing.
 *   - It claimed `add-sources` writes `verified:` entries; nothing does, and
 *     the scaffold's AGENTS.md says a `verified` entry is a claim a document
 *     makes about itself.
 *   - `ksor-record-empty` — the refusal every adopter meets who deletes the
 *     starters before writing a document — was named by the program and by no
 *     document an adopter reads.
 *
 * The trigger test beside this one (`skill-triggers`) checks that a
 * description still contains its promised phrases. It could not catch any of
 * the above, because a phrase can be present while the sentence around it is
 * false. This file checks the sentences.
 *
 * Deterministic, no model, gating: these are the defects that actually ship.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCAFFOLD = path.resolve(here, "..", "templates", "scaffold");
const SKILLS = path.join(SCAFFOLD, ".agents", "skills");
/**
 * Where the product defines refusal slugs: the kernel's record module, the CLI's
 * own build step (`ksor-build-dirty` lives in build/index.ts), and the site's
 * quiz audit (`ksor-quiz-*` lives in the scaffold). The first version of this
 * test read only `record/refusal.ts` and reported six real slugs as unknown.
 */
const SLUG_SOURCES: readonly string[] = [
  path.resolve(here, "..", "..", "content", "src"),
  path.resolve(here),
  path.join(SCAFFOLD, "system", "site", "lib"),
];

const text = (file: string): string => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const shipped: readonly string[] = readdirSync(SKILLS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const skillMd = (name: string): string => text(path.join(SKILLS, name, "SKILL.md"));

/** Frontmatter `description:` — the trigger — and the body after the fence. */
function split(md: string): { description: string; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(md);
  if (m === null) throw new Error("no frontmatter fence");
  const description = /^description:\s*(.*)$/m.exec(m[1] as string)?.[1] ?? "";
  return { description, body: m[2] as string };
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * Every `ksor-…` slug the record can actually refuse with: the string literals
 * in the kernel's own list. Read as text rather than imported, so the test does
 * not depend on the export's name or on the content package building first.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [full] : [];
  });
}

const KNOWN_SLUGS: ReadonlySet<string> = new Set(
  SLUG_SOURCES.flatMap(sourceFiles).flatMap((f) =>
    [...text(f).matchAll(/"(ksor-[a-z0-9-]+)"/g)].map((m) => m[1] as string),
  ),
);

/** Every document an adopter reads that may name a slug or a skill. */
const ADOPTER_DOCS: readonly string[] = [
  path.join(SCAFFOLD, "AGENTS.md"),
  path.join(SCAFFOLD, "README.md"),
  ...shipped.map((s) => path.join(SKILLS, s, "SKILL.md")),
];

describe("the shipped skill set is small enough to be one list", () => {
  it("is exactly the three that serve making a record", () => {
    // Two companion skills (make-slides, make-summary) were removed on
    // 2026-09-02: 45% of all shipped skill text, 21.6% identical to each
    // other by their own commit's admission, downstream of a record existing,
    // invisible to the agent surface, unused by any fixture or tutorial, and
    // never shown to beat their absence. Their one real rule lives in the
    // scaffold's AGENTS.md. A fourth skill lands by editing this line and
    // recording, in its PR, the with/without comparison AGENTS.md demands.
    expect(shipped).toEqual(["add-sources", "format-checker", "intake-interview"]);
  });
});

describe("a skill's description agrees with its body", () => {
  it.each(shipped)("%s: a question count in the trigger matches the questions asked", (name) => {
    const { description, body } = split(skillMd(name));
    const claimed = /\b(\w+) questions\b/i.exec(description);
    if (claimed === null) return; // this skill's trigger promises no count
    const word = (claimed[1] as string).toLowerCase();
    const n = NUMBER_WORDS[word] ?? Number.parseInt(word, 10);
    expect(Number.isNaN(n), `${name}: "${word} questions" is not a number`).toBe(false);
    // The body numbers its questions "**k of N**"; every N must be the same
    // and must equal what the description promised.
    const ofs = [...body.matchAll(/\*\*\d+ of (\d+)\b/g)].map((m) => Number(m[1]));
    expect(ofs.length, `${name}: body has no "**k of N**" question headings`).toBeGreaterThan(0);
    expect(new Set(ofs).size, `${name}: headings disagree about N — ${ofs.join(",")}`).toBe(1);
    expect(
      ofs[0],
      `${name}: the trigger says "${word} questions" but the body asks ${ofs[0]} — the ` +
        "description is what an agent reads to decide whether to fire, and it promises " +
        "an interview the body does not conduct",
    ).toBe(n);
  });

  it.each(shipped)("%s: every 'question N' it mentions is a question it asks", (name) => {
    const { body } = split(skillMd(name));
    const ofs = [...body.matchAll(/\*\*\d+ of (\d+)\b/g)].map((m) => Number(m[1]));
    const asked = ofs[0] ?? 0;
    const mentioned = [...body.matchAll(/\bquestion (\d+)\b/gi)].map((m) => Number(m[1]));
    const dangling = mentioned.filter((k) => k > asked);
    expect(
      dangling,
      `${name} refers to question(s) ${dangling.join(", ")} but asks only ${asked} — a ` +
        "hand-off to a question that no longer exists hands off to nothing",
    ).toEqual([]);
  });
});

describe("every refusal slug an adopter document names is one the record can raise", () => {
  it("the kernel's slug list was found", () => {
    expect(KNOWN_SLUGS.size).toBeGreaterThan(20);
    expect(KNOWN_SLUGS.has("ksor-record-empty")).toBe(true);
  });

  it.each(ADOPTER_DOCS)("%s", (file) => {
    const named = new Set(
      [...text(file).matchAll(/`(ksor-[a-z0-9-]+)`/g)].map((m) => m[1] as string),
    );
    // `ksor-…` is also the shape of the CLI's own binary and of package names;
    // only slugs the kernel defines are held to exist as refusals.
    const unknown = [...named].filter((s) => !KNOWN_SLUGS.has(s) && s.includes("-"));
    const reallyUnknown = unknown.filter(
      (s) => !/^ksor-(content|postgres|gateway|starter)/.test(s),
    );
    expect(
      reallyUnknown,
      `${path.relative(SCAFFOLD, file)} names refusal(s) the record cannot raise: ` +
        `${reallyUnknown.join(", ")} — a fix pointing at a slug that never fires is a fix nobody can follow`,
    ).toEqual([]);
  });
});

describe("the two refusals on the replace-the-starters path are named where an adopter reads", () => {
  // Found by walking the journey on 0.0.55: deleting all five starters before
  // writing one refuses `ksor-record-empty`; doing the hello-world tutorial and
  // THEN the interview refuses `ksor-approver-unauthorised` on the tutorial's
  // own document. Neither slug appeared in any emitted document.
  it.each(["ksor-record-empty", "ksor-approver-unauthorised"])("README names %s", (slug) => {
    expect(text(path.join(SCAFFOLD, "README.md"))).toContain(`\`${slug}\``);
  });

  it("the interview tells the agent to re-attribute human:you's acts, not just retire the actor", () => {
    const body = skillMd("intake-interview");
    expect(body).toMatch(/re-attribute/i);
    expect(body).toContain("ksor-approver-unauthorised");
  });
});

describe("every skill a document names is one that ships", () => {
  it.each(ADOPTER_DOCS)("%s", (file) => {
    const named = [...text(file).matchAll(/\.agents\/skills\/([a-z-]+)\//g)].map(
      (m) => m[1] as string,
    );
    const missing = [...new Set(named)].filter((s) => !shipped.includes(s));
    expect(
      missing,
      `${path.relative(SCAFFOLD, file)} names skill(s) the scaffold no longer ships: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("no document claims a skill writes `verified:` entries", () => {
    // A `verified` entry is a claim the document makes about itself, gated by
    // pull-request review and by no skill (scaffold AGENTS.md, "Writing
    // knowledge"). A skill that claims to write one claims a review nobody did.
    for (const file of ADOPTER_DOCS) {
      expect(
        /skill[^.]{0,80}`verified:`|`verified:`[^.]{0,40}skill/.test(text(file)),
        `${path.relative(SCAFFOLD, file)} says a skill writes verified: entries`,
      ).toBe(false);
    }
  });
});
