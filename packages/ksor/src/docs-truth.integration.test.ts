/**
 * Sentences a reader ACTS on, held against what the code actually does.
 *
 * Product principle 1 is that docs are priority #1 — an agent reads them before
 * it runs the product — and AGENTS.md adds that a count or a list rendered into
 * a doc is generated from source with a drift test, or not rendered at all.
 * `verbs-documented` and `env-documented` are that rule applied to two lists;
 * this is it applied to the individual claims that a review found false, each
 * anchored to the thing that decides it: a template's own frontmatter, a
 * schema's declaration, a refusal in the code, a golden capture.
 *
 * Every assertion here failed before its fix, and each names in its message the
 * file:line a reader would have followed. When the CODE changes so that a
 * sentence becomes true (or false) again, this fails on the sentence rather
 * than in production.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string): string => readFileSync(path.join(repoRoot, rel), "utf8");

const SCAFFOLD = "packages/ksor/templates/scaffold";

/**
 * One line, single-spaced. Every prose assertion below runs against this:
 * markdown hard-wraps at 80 columns, so a sentence a reader sees whole is
 * split by newlines in the file, and a phrase match against the raw bytes
 * fails on where the wrap happened rather than on what the sentence says.
 */
const flat = (text: string): string => text.replace(/\s+/g, " ");

/** Every fenced block in a markdown document, fences included. */
const fencedBlocks = (text: string): string[] =>
  [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);

/**
 * `ksor migrate --write` demotes every `approved` document to `draft` unless
 * `--approve-by` names the human doing the approving (migrate/rules.ts
 * STATUS_MAP + the `--approve-by` escape), and a draft reaches NO machine
 * surface. So a runbook that shows `migrate --write` without the flag, followed
 * by `ksor build`, empties the record's llms.txt, its markdown twins and its
 * MCP door — at exit 0, with nothing red.
 *
 * The demotion was disclosed in prose beside three of these blocks and in none
 * of the blocks themselves, which is the half a reader copies.
 */
describe("every runbook that migrates a record shows how to keep it published", () => {
  const RUNBOOKS = [
    ".changeset/okf-native.md",
    "README.md",
    "research/okf-native.md",
    "packages/ksor/README.md",
    "docs/status.md",
  ];

  it.each(RUNBOOKS)("%s — no `migrate --write` block omits --approve-by", (file) => {
    const offenders = fencedBlocks(read(file))
      .filter((block) => /ksor migrate\b[^\n]*--write/.test(block))
      .filter((block) => !block.includes("--approve-by"));
    expect(
      offenders,
      `${file}: a copy-pasteable \`ksor migrate --write\` without \`--approve-by\` ` +
        `demotes every approved document to draft, and the next \`ksor build\` admits ` +
        `nothing to any machine surface. Show the flag in the block, not only in the prose.`,
    ).toEqual([]);
  });

  it("the demotion is stated as a consequence, not only as a mapping", () => {
    // The changeset is the release note an upgrading adopter reads first.
    const text = read(".changeset/okf-native.md");
    expect(text).toContain("--approve-by");
    expect(
      /reaches no machine surface|0 admitted to a machine surface|publishes nothing/i.test(
        flat(text),
      ),
      ".changeset/okf-native.md: says `approved` becomes `draft` but never says what that " +
        "costs — the record's machine surfaces go empty until a human approves.",
    ).toBe(true);
  });
});

/**
 * The starter documents ship as drafts, and a build admits a draft to NO
 * surface — not the pages, not the sidebar, not llms.txt (record spec §2.5).
 * That is decision 27's "day one publishes nothing until a human approves",
 * and it is deliberate. What was missing is that the two documents the adopter
 * and their coding agent actually read said nothing about it, while the emitted
 * README told them to verify a deploy by loading "one document page" — an
 * artefact a fresh record does not have.
 *
 * The premise is read from the templates, so if the starter ever ships
 * approved again these assertions stop being demanded rather than going stale.
 */
describe("the emitted scaffold says what its all-draft starter publishes", () => {
  const starterStatuses = (): string[] => {
    const dir = path.join(repoRoot, SCAFFOLD, "knowledge");
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) return walk(full);
        if (!e.name.endsWith(".md") || e.name === "index.md") return [];
        const m = /^status:\s*(\S+)\s*$/m.exec(readFileSync(full, "utf8"));
        return m === null ? [] : [m[1] as string];
      });
    return walk(dir);
  };

  const allDrafts = (): boolean => {
    const s = starterStatuses();
    return s.length > 0 && s.every((v) => v === "draft");
  };

  it("has starter documents to judge", () => {
    expect(starterStatuses().length).toBeGreaterThan(0);
  });

  it("README does not promise a document page the starter does not publish", () => {
    if (!allDrafts()) return;
    const text = read(`${SCAFFOLD}/README.md`);
    expect(
      text.includes("one document page"),
      `${SCAFFOLD}/README.md: every starter document is a draft, so a fresh ` +
        `\`ksor build\` publishes no document page at all — verifying a deploy by loading ` +
        `one sends the adopter looking for an artefact that does not exist.`,
    ).toBe(false);
  });

  it.each([
    [`${SCAFFOLD}/README.md`, "the human's first read"],
    [`${SCAFFOLD}/AGENTS.md`, "the coding agent's first read"],
  ])("%s says the starter is unpublished until approved", (file, why) => {
    if (!allDrafts()) return;
    const text = read(file);
    expect(
      /\bdraft/i.test(text) && /approv/i.test(text),
      `${file} (${why}): the starter ships as drafts and a build publishes none of ` +
        `them. Say so where the reader meets it, and name the act that fixes it.`,
    ).toBe(true);
  });
});

/**
 * What `ksor init` emits is decided by the template directory, so the README's
 * list of it is checkable against that directory rather than against memory.
 *
 * The README claimed the takedown ledger was emitted "beside" the policy while
 * its own tree diagram, eight lines below, showed `.ksor/` holding only
 * `governance.yaml` — and the spec states the absence deliberately: an empty
 * ledger would assert an act nobody performed.
 */
describe("the README's list of what `ksor init` emits matches the template", () => {
  const emitted = (rel: string): boolean =>
    readdirSync(path.join(repoRoot, SCAFFOLD, path.dirname(rel))).includes(path.basename(rel));

  it("`.ksor/governance.yaml` IS emitted", () => {
    expect(emitted(".ksor/governance.yaml")).toBe(true);
  });

  it("no README claims init emits a ledger the template does not hold", () => {
    if (emitted(".ksor/takedowns.yaml")) return;
    for (const file of ["README.md", `${SCAFFOLD}/README.md`, "packages/ksor/README.md"]) {
      const claim = /`ksor init` emits[^.]*takedown ledger/.exec(read(file));
      expect(
        claim,
        `${file}: the scaffold template holds no .ksor/takedowns.yaml, so init emits none — ` +
          `the ledger appears at the first \`ksor takedown\`. Offending sentence: ${claim?.[0] ?? ""}`,
      ).toBeNull();
    }
  });
});

/**
 * The `## Skills` list is the index a coding agent reads to find out what it
 * can be asked to do, and it had lost a sentence: a later commit inserted the
 * `make-summary` bullet BETWEEN the two lines of the `make-slides` bullet, so
 * one item ended mid-sentence on the word "document" and the other rendered as
 * "…attach it and attach it, so it renders on that document's page."
 *
 * Structure catches this where prose review did not: every list item is one
 * sentence, so every item ends in a full stop, and no directory ships without
 * a line naming it.
 */
describe("the scaffold's Skills list is whole", () => {
  const section = (): string => {
    const text = read(`${SCAFFOLD}/AGENTS.md`);
    const m = /\n## Skills\n([\s\S]*?)\n## /.exec(text);
    if (m === null) throw new Error(`${SCAFFOLD}/AGENTS.md: no "## Skills" section`);
    return m[1] as string;
  };

  /** One entry per bullet, its lazy continuation lines folded in. */
  const items = (): string[] =>
    section()
      .split(/\n(?=- )/)
      .map(flat)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("- "));

  it("names every skill the scaffold ships", () => {
    const shipped = readdirSync(path.join(repoRoot, SCAFFOLD, ".agents", "skills")).sort();
    const missing = shipped.filter((s) => !items().some((i) => i.includes(`skills/${s}/`)));
    expect(
      missing,
      `${SCAFFOLD}/AGENTS.md "## Skills" does not name: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every bullet is a finished sentence", () => {
    const unfinished = items().filter((i) => !i.endsWith("."));
    expect(
      unfinished,
      `${SCAFFOLD}/AGENTS.md "## Skills": a bullet ends mid-sentence — ${unfinished.join(" | ")}`,
    ).toEqual([]);
  });

  it("no bullet repeats itself", () => {
    for (const item of items()) {
      const words = item.split(" ");
      const repeats = words
        .map((_, i) => words.slice(i, i + 3).join(" "))
        .filter(
          (tri, i) =>
            tri.split(" ").length === 3 &&
            words
              .slice(i + 3)
              .join(" ")
              .startsWith(tri),
        );
      expect(repeats, `${SCAFFOLD}/AGENTS.md "## Skills": duplicated phrase in — ${item}`).toEqual(
        [],
      );
    }
  });
});

/**
 * `env.example` is the ONE emitted file that is copied byte-for-byte rather
 * than prose-translated: `materialize.ts`'s `isTextFile` keys on an extension
 * list plus two hardcoded basenames, and `.example` is in neither. So an npm
 * or bun adopter was told to set three variables "before `pnpm build`" in a
 * project that ships no pnpm files and whose own build script is `npm run` or
 * `bun run`. The conformance guard that forbids a foreign manager's token
 * scans by the same extension list, so it never read this file either.
 *
 * The fix is to name no manager at all in a file no manager's emit can rewrite.
 */
describe("the verbatim-copied scaffold files name no package manager", () => {
  it.each(["env.example"])("%s", (file) => {
    const offenders = flat(read(`${SCAFFOLD}/${file}`))
      .split(" ")
      .filter((w) => /^`?(pnpm|bun|npx)$/.test(w) || w === "npm");
    expect(
      offenders,
      `${SCAFFOLD}/${file} is copied byte-for-byte into the npm and bun scaffolds — ` +
        `naming a manager there is wrong for two of the three. Say "the site build", ` +
        `not "\`pnpm build\`". Found: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * `--revoke` takes a LEDGER ENTRY id, and the docs pointed at `ksor takedown
 * --ledger` as the way to obtain one — which on a record with no `database:`
 * (the rung `ksor init` emits) refused with exit 1, leaving no tool path to the
 * id at all. The read-only modes are being taught to read the committed ledger,
 * but the durable fact is the one asserted here: the denial that WRITES an
 * entry prints its id, so the id is reachable from the act itself and no
 * document should present `--ledger` as the only route to it.
 */
describe("the way to a takedown entry id does not depend on a database", () => {
  it("the denial echoes the id it just wrote", () => {
    const src = read("packages/content/src/commands.ts");
    expect(
      /recorded as[^\n]*\.ksor\/takedowns\.yaml/.test(flat(src)),
      "packages/content/src/commands.ts no longer echoes the ledger entry id when it " +
        "writes one — the scaffold AGENTS.md and packages/ksor/docs/ingesting.md both " +
        "tell the adopter it does, and it is the only route to the id that never needs " +
        "a database.",
    ).toBe(true);
  });

  it.each([
    [`${SCAFFOLD}/AGENTS.md`, "the agent operating the record"],
    ["packages/ksor/docs/ingesting.md", "the operator following the ingest runbook"],
  ])("%s does not present --ledger as the only route", (file, who) => {
    expect(
      /which\s+`?--ledger`? lists|which\s+`ksor takedown --ledger` lists/.test(flat(read(file))),
      `${file} (${who}): says the entry id is "which --ledger lists", full stop. Name the ` +
        `denial's own echo and the committed ledger too, so a record with no database has a route.`,
    ).toBe(false);
  });
});
