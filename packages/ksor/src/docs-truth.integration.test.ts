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

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { releaseNote } from "./release-note.js";

import { verbs } from "./index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string): string =>
  rel.startsWith(".changeset/")
    ? releaseNote(repoRoot, rel).text
    : readFileSync(path.join(repoRoot, rel), "utf8");
/** True when this note is still a pending changeset a reviewer can change. */
const isPending = (rel: string): boolean =>
  !rel.startsWith(".changeset/") || releaseNote(repoRoot, rel).pending;

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
    // Structure, not presence: this scans EVERY fenced block, so once a
    // changeset is folded into the changelog it would scan the whole published
    // history and assert today's rule against prose written before it existed.
    // Skipped there rather than run against the wrong text — which is how the
    // first version of this fix turned the case vacuous instead of red.
    if (!isPending(file)) return;
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
 * The starter PUBLISHES on the first build (decision 27 revision 2026-08-25):
 * all five samples ship `status: stable` with a `ksor.approval` naming the
 * producer that generated them, and the emitted policy authorises that actor.
 * It replaces the all-draft starter, whose first build reported `0 admitted to
 * a machine surface` and left the adopter with an empty `llms.txt`.
 *
 * The exchange has a cost and the emitted documents have to carry it: a
 * PRODUCER now appears in the adopter's own `.ksor/governance.yaml`, and an
 * adopter who never reads the samples publishes five documents they did not
 * write. So what these clauses demand is that the two documents the adopter and
 * their coding agent actually read say what shipped approved and how to stop
 * approving it.
 *
 * The premise is ASSERTED rather than used as a guard: a starter that goes back
 * to drafts must fail here, naming the documents to rewrite, instead of quietly
 * making these clauses vacuous.
 */
describe("the emitted scaffold says what its published starter publishes", () => {
  const starterFrontmatter = (): { path: string; status: string; approver: string | null }[] => {
    const dir = path.join(repoRoot, SCAFFOLD, "knowledge");
    const walk = (d: string): { path: string; status: string; approver: string | null }[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) return walk(full);
        if (!e.name.endsWith(".md") || e.name === "index.md" || e.name.endsWith(".summary.md")) {
          return [];
        }
        const text = readFileSync(full, "utf8");
        const status = /^status:\s*(\S+)\s*$/m.exec(text)?.[1];
        if (status === undefined) return [];
        return [
          {
            path: path.relative(path.join(repoRoot, SCAFFOLD), full),
            status,
            approver: /^ {2}approval: \{ by: "([^"]+)"/m.exec(text)?.[1] ?? null,
          },
        ];
      });
    return walk(dir).sort((a, b) => (a.path < b.path ? -1 : 1));
  };

  it("every starter document ships approved by the starter producer", () => {
    const docs = starterFrontmatter();
    expect(docs.length, "the starter ships no document to judge").toBeGreaterThan(0);
    // One readable line per document, so a failure names the file that moved
    // rather than printing a truncated array of arrays.
    expect(
      docs.map((d) => `${d.path} status=${d.status} approver=${d.approver ?? "none"}`),
      "the starter no longer publishes on the first build — the emitted README, " +
        "AGENTS.md and intake-interview skill describe a record that publishes, and " +
        "every clause below is written against that",
    ).toEqual(docs.map((d) => `${d.path} status=stable approver=ksor-starter/KSOR-STAMP-VERSION`));
  });

  it("the emitted policy authorises the producer, and says to delete it", () => {
    const policy = read(`${SCAFFOLD}/.ksor/governance.yaml`);
    expect(
      policy,
      `${SCAFFOLD}/.ksor/governance.yaml: the samples are approved by ` +
        `ksor-starter/KSOR-STAMP-VERSION, so a policy that does not name it refuses the ` +
        `first build with ksor-approver-unauthorised`,
    ).toContain("ksor-starter/KSOR-STAMP-VERSION");
    expect(
      /delete/i.test(policy),
      `${SCAFFOLD}/.ksor/governance.yaml: a tool holding approval authority in the ` +
        `adopter's own policy is the cost of publishing on day one. Say, in the file, ` +
        `that it goes once the samples do.`,
    ).toBe(true);
  });

  it.each([
    [`${SCAFFOLD}/README.md`, "the human's first read"],
    [`${SCAFFOLD}/AGENTS.md`, "the coding agent's first read"],
  ])("%s says the starter publishes, and who approved it", (file, why) => {
    const text = flat(read(file));
    expect(
      /ksor-starter/.test(text),
      `${file} (${why}): five documents publish on the first build under an approval ` +
        `the adopter did not make. Name the actor that made it where the reader meets it.`,
    ).toBe(true);
    expect(
      /replace|delete/i.test(text) && /approv/i.test(text),
      `${file} (${why}): say what the first act on this record is — replacing the ` +
        `samples — and that the producer leaves the policy with them.`,
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

/**
 * `ksor.owner` is declared `z.string().min(1).optional()` — the ONE actor-named
 * slot in the profile that is never parsed. Every other one (`generated.by`,
 * `verified[].by`, `ksor.approval.by`, `ksor.deprecated.by`) is built from the
 * `actor` codec and refuses anything malformed.
 *
 * The spec said the convention holds "everywhere" and listed `ksor-actor-form`
 * among the refusals with `ksor.owner` named as the slot `team:<id>` is allowed
 * IN — permission language that reads as a check. It is not one, and `ksor
 * migrate` manufactures the shape it appeared to forbid: a pre-profile
 * `owner: Product` is carried through verbatim and the tree passes `ksor build`.
 * Where spec and code disagree the code wins (AGENTS.md authority rule 1).
 *
 * This asserts the disagreement cannot come back silently: while the schema
 * leaves owner unparsed, the documents must say so; if owner is ever given the
 * actor codec, this fails and asks for the sentences back.
 */
describe("the actor convention is documented as far as it is enforced", () => {
  const ownerIsUnchecked = (): boolean => {
    const src = read("packages/content/src/record/profile.ts");
    const block = /const ksorBlock = z\.object\(\{([\s\S]*?)\n\}\);/.exec(src);
    if (block === null) throw new Error("profile.ts: no ksorBlock literal to read");
    const owner = /^\s*owner:\s*(.+?),\s*$/m.exec(block[1] as string);
    if (owner === null) throw new Error("profile.ts: ksorBlock declares no owner key");
    return !(owner[1] as string).includes("actor");
  };

  /**
   * The VALUE, not the type. `expect(typeof … ).toBe("boolean")` is the
   * assertion this same file post-mortems 50 lines below as one that cannot
   * fail — and it was guarding the fact the two `if (!ownerIsUnchecked())
   * return;` cases below depend on, so giving `owner` the actor codec would
   * have turned all three green while leaving two documents false.
   */
  it("the owner declaration IS unchecked today, and this is where that is pinned", () => {
    expect(
      ownerIsUnchecked(),
      "profile.ts now parses `ksor.owner` with the actor codec — delete the " +
        '"NOT form-checked" sentence from specs/ksor/record/spec.md and the scaffold\'s ' +
        "AGENTS.md, and flip this pin to false. `check.ts` also stops needing the " +
        "reason it records for not falling back to `concept.owner`.",
    ).toBe(true);
  });

  it.each([
    ["specs/ksor/record/spec.md", "the contract"],
    [`${SCAFFOLD}/AGENTS.md`, "what an author is told"],
  ])("%s says `ksor.owner` is not form-checked", (file, why) => {
    if (!ownerIsUnchecked()) return;
    const text = flat(read(file));
    expect(
      /`ksor.owner` is free text and is NOT form-checked|`ksor.owner` is not checked for its shape/.test(
        text,
      ),
      `${file} (${why}): profile.ts declares \`owner\` as a bare string, so no actor form is ` +
        `enforced on it and \`ksor migrate\` carries a pre-profile bare word through. Say that, ` +
        `rather than describing a check that does not run.`,
    ).toBe(true);
  });

  it("no document claims the actor form applies everywhere", () => {
    if (!ownerIsUnchecked()) return;
    for (const file of ["specs/ksor/record/spec.md", `${SCAFFOLD}/AGENTS.md`]) {
      expect(
        /<producer>\/<version>` everywhere/.test(flat(read(file))),
        `${file}: "everywhere" is false while \`ksor.owner\` is unparsed.`,
      ).toBe(false);
    }
  });
});

/**
 * The FIRST line of the published upgrade path was bare `ksor migrate`,
 * annotated "prints the diff, writes nothing". A pre-profile record has no
 * `.ksor/governance.yaml` by definition, and migrate refuses without `--actor`
 * when it must write one — so the preview step exited 1 on every record the
 * runbook is for, before anything downstream could be reached.
 *
 * `--actor` on the preview line is right in BOTH worlds, which is why the
 * assertion below is unconditional. When the refusal covers the dry run, the
 * flag is what makes the step run at all. When it does not — which is where
 * migrate stands today, the guard having gained `&& parsed.write` — the
 * preview still SUBSTITUTES a placeholder actor into the policy it renders in
 * the diff, so a runbook that omits the flag shows the owner a diff naming
 * somebody who does not exist and leaves them to notice.
 *
 * Nothing here is gated on reading the precondition, and that is deliberate:
 * the premise used to be a bare regex over migrate's SOURCE TEXT, every
 * assertion early-returned when it missed, and the only thing guarding it was
 * `expect(typeof … ).toBe("boolean")` — an assertion that cannot fail. Renaming
 * one local (`hadPolicy`) disarmed the whole block silently; and the regex was
 * already reporting a precondition the code had outgrown. The premise is still
 * read, because a change to it changes what a reader must be told, but it is
 * PINNED in a test of its own and it THROWS rather than reporting `false` when
 * it cannot find what it came for.
 */
describe("the migrate preview step runs on the records the runbook is for", () => {
  /**
   * True when migrate refuses a DRY RUN that names no actor — i.e. when the
   * flag is a precondition of the preview rather than a courtesy.
   *
   * Throws when the guard cannot be found at all, because "the rule moved" and
   * "the rule does not apply" are different answers and a bare `.test()`
   * returns the second for both.
   */
  const previewNeedsActor = (): boolean => {
    const src = read("packages/ksor/src/migrate/index.ts");
    const guard = /\n\s*if \(([^)]*parsed\.actor === null[^)]*)\) \{\s*\n\s*return badArgs\(/.exec(
      src,
    );
    if (guard === null) {
      throw new Error(
        "migrate/index.ts: no `parsed.actor === null` guard returning badArgs — the " +
          "precondition this block reads has moved, and its absence is not evidence that " +
          "the preview runs without --actor",
      );
    }
    // `parsed.write` among the operands scopes the refusal to the writing run.
    return !/parsed\.write/.test(guard[1] as string);
  };

  it("the preview does NOT need --actor today, and this is where that is pinned", () => {
    expect(
      previewNeedsActor(),
      "migrate now refuses a dry run with no --actor. That is a stricter contract than the one " +
        "recorded here: say so in this block's comment, and check that every runbook's preview " +
        "line carries the flag (they do — the assertion below is unconditional).",
    ).toBe(false);
  });

  /**
   * A fenced block naming EVERY verb the binary has is the CLI's vocabulary
   * listing — a list of words, not instructions to run in order. That is the
   * only block a `ksor migrate` line may sit in unflagged, and it is exempted
   * by what it IS rather than by what it lacks: the previous filter kept only
   * blocks containing `--`, so a single-line `ksor migrate` fence — the exact
   * defect this block exists for — was dropped before it could be judged.
   */
  const isVerbVocabulary = (block: string): boolean =>
    verbs.every((verb) => new RegExp(`^\\s*ksor ${verb}\\b`, "m").test(block));

  it.each([".changeset/okf-native.md", "README.md", "research/okf-native.md"])(
    "%s — every runnable `ksor migrate` line carries --actor",
    (file) => {
      const bare = fencedBlocks(read(file))
        .filter((block) => !isVerbVocabulary(block))
        .flatMap((block) => block.split("\n"))
        .filter((line) => /^\s*ksor migrate\b/.test(line))
        .filter((line) => !line.includes("--actor"));
      expect(
        bare,
        `${file}: a copy-pasteable \`ksor migrate\` without \`--actor\`. On a pre-profile ` +
          `record there is no .ksor/governance.yaml, so migrate has to write one — and it will ` +
          `not guess who is performing the act (decision 21). Without the flag the write run ` +
          `exits 1 with \`error: bad-args\`, and the preview renders a policy naming a ` +
          `placeholder. Show the flag in the block, not only in the prose.`,
      ).toEqual([]);
    },
  );
});

/**
 * `verified` is the one governance input a document declares about ITSELF and
 * nothing checks against the policy. Record spec §2.3 says so outright — the
 * Governance Policy has no verification family, so `verified[].by` is checked
 * for its actor FORM and for nothing else, and any well-formed `human:` actor
 * promotes the trust tier to `human-reviewed`. That is asymmetric with
 * `ksor.approval.by`, which `resolveApprovers` refuses outright when no rule
 * matches: `ksor.approval.by: human:mallory` is refused by name, and
 * `verified: [{ by: human:mallory }]` is accepted from anyone.
 *
 * The mechanism is a recorded, owner-gated design (closing it means adding a
 * `verification_authorities` family, which widens a public surface), so it
 * stands. What did NOT stand is that the surfaces an adopter and an agent
 * actually read contradicted it, and one of them inverted it: at
 * `KSOR_MIN_TRUST_TIER=human-reviewed` the only document served out of a
 * record was the self-asserting one, carrying the sentence "This sentence was
 * never read by a human being" (found 2026-08-25).
 *
 * So every surface that mentions the tier has to say whose claim it is. These
 * assert against the SERVED bytes and the EMITTED template, not against the
 * prose in this repo, because those are what an agent and an operator get.
 */
describe("every surface says who the trust tier is a claim by", () => {
  /**
   * The premise, read from the policy schema rather than asserted: the closed
   * root key set of `.ksor/governance.yaml` names no verification family, so
   * nothing in the policy can gate `verified`. THROWS when it cannot find what
   * it came for, rather than quietly disarming the block below.
   */
  const policyGatesVerification = (): boolean => {
    const src = read("packages/content/src/record/policy.ts");
    const root = /"\(root\)":\s*\[([^\]]*)\]/.exec(src);
    if (root === null) throw new Error("policy.ts: no `(root)` key list in POLICY_KEYS");
    return /verif/i.test(root[1] as string);
  };

  /** The BYTES an agent receives, from the committed capture of `tools/list`. */
  const servedTool = (name: string): string => {
    const tools = JSON.parse(
      read("packages/ksor/src/__fixtures__/served-surface.golden.json"),
    ) as ReadonlyArray<{ name: string; description?: string }>;
    const tool = tools.find((t) => t.name === name);
    if (tool?.description === undefined) throw new Error(`served surface has no ${name} tool`);
    return flat(tool.description);
  };

  it("reads the policy's key set, and finds no verification family", () => {
    expect(policyGatesVerification()).toBe(false);
  });

  it("the search floor scopes `trust_tier` the way it already scopes `approval`", () => {
    if (policyGatesVerification()) return;
    const search = servedTool("search");
    // The shape the approval sentence already has, applied to the other signal.
    expect(
      search,
      "search's floor tells an agent `approval.checked` is only `policy` and says nothing " +
        "at all about where `trust_tier` comes from — so `human-reviewed` reads as a check " +
        "this record performed. It is the document's own declaration (record spec §2.3).",
    ).toContain("the document's own claim that a human read it");
  });

  it("the read floor does not present the whole governance block as checked", () => {
    if (policyGatesVerification()) return;
    const readTool = servedTool("read");
    expect(
      readTool,
      'read\'s floor says "governance" is what the record "checked and stored". Its ' +
        "`trust_tier` was neither: it was derived from what the document declares about " +
        "itself. Say which fields were checked against what.",
    ).not.toMatch(/carries, checked and stored/);
    expect(readTool).toMatch(/trust_tier/);
  });

  it("the emitted .env.example does not promise the trust floor serves only reviewed work", () => {
    if (policyGatesVerification()) return;
    const whole = read(`${SCAFFOLD}/env.example`);
    // THIS variable's own block. `.ksor/governance.yaml` is named elsewhere in
    // the file, so a whole-file match would pass on a paragraph about audiences.
    const start = whole.indexOf("# The LOWEST trust tier");
    const end = whole.indexOf("KSOR_MIN_TRUST_TIER=", start);
    if (start === -1 || end === -1) throw new Error("env.example: no KSOR_MIN_TRUST_TIER block");
    const block = flat(whole.slice(start, end));
    expect(
      block,
      "`.env.example` tells the operator that `human-reviewed` on a record with no reviews " +
        "serves nothing at all — true only until one document declares its own review, which " +
        "nothing checks. That is the state in which the floor served the self-asserting " +
        "document and no other.",
    ).not.toMatch(/with no reviews serves nothing at all/);
    expect(
      block,
      "the operator raising this floor has to be told, HERE, that the entries under it are " +
        "declared by the document and gated by review of the change — not by the policy",
    ).toMatch(/governance\.yaml/);
  });

  it("the emitted AGENTS.md marks the asymmetry beside the approval it sits next to", () => {
    if (policyGatesVerification()) return;
    const agents = flat(read(`${SCAFFOLD}/AGENTS.md`));
    expect(
      agents,
      "AGENTS.md describes `ksor.approval` as `by an actor the policy authorises` and " +
        "`verified` as simply setting the tier, two lines apart — an author reads them as " +
        "the same kind of act. The policy gates one and not the other.",
    ).toMatch(/verified[\s\S]{0,400}?the policy does not gate WHO may appear here/);
  });
});

/**
 * The emitted AGENTS.md told an adopter, unconditionally, that a document
 * "whose `stale_after` has passed" is not an `llms.txt` entry "at all, so an
 * agent is never handed a withdrawn document as plain prose". It is false about
 * the artefact `ksor build` had just written: admission is decided ONCE, at the
 * build's `as_of`, and static output cannot re-decide itself — so the moment
 * that instant passes, `llms.txt` and the markdown twins keep publishing what
 * `ksor serve`, which evaluates per request, already refuses (record spec §2.5
 * specifies the divergence; the sentence denied it).
 *
 * Nothing in the emitted repo carried the obligation that follows: the shipped
 * `validate.yml` has no `schedule`, `vercel.json` has no cron, and the README
 * did not contain the word "stale" once. The whole statement of it was a code
 * comment in this repository (found 2026-08-25).
 */
describe("the emitted docs are true about the artefact they ship with", () => {
  /** Read from the rule, not asserted: only these two keys turn on the clock. */
  const clockDecidesAdmission = (): boolean => {
    const rule = read("packages/content/src/lib/lifecycle-rule.ts");
    return rule.includes("doc.staleAfter !== null") && rule.includes("doc.effectiveFrom !== null");
  };

  it("reads the lifecycle rule, and finds admission decided at an instant", () => {
    expect(clockDecidesAdmission()).toBe(true);
  });

  it("AGENTS.md does not claim a stale document is excluded whenever it goes stale", () => {
    if (!clockDecidesAdmission()) return;
    const agents = flat(read(`${SCAFFOLD}/AGENTS.md`));
    expect(
      agents,
      "`llms.txt` excludes what was stale WHEN THE BUILD RAN. Stated unconditionally, this " +
        "tells an adopter the static half re-decides itself, which is the one thing it " +
        "cannot do — build/lifecycle-notice.ts and record spec §2.5.",
    ).not.toMatch(/one whose `stale_after` has passed are not entries at all/);
  });

  it.each([
    [`${SCAFFOLD}/AGENTS.md`, "the working rules an agent reads"],
    [`${SCAFFOLD}/README.md`, "the operator's own front door"],
  ])("%s names the rebuild obligation the snapshot creates", (file, why) => {
    if (!clockDecidesAdmission()) return;
    const text = flat(read(file));
    expect(
      /stale_after/.test(text),
      `${file} (${why}): nothing in the emitted repo says a build's admissions expire and ` +
        `only a rebuild moves the line. The emitted validate.yml has no schedule and ` +
        `vercel.json has no cron, so if this is unwritten it is nowhere.`,
    ).toBe(true);
    expect(
      /rebuild/i.test(text),
      `${file} (${why}): says stale_after exists but not that a rebuild is what applies it.`,
    ).toBe(true);
  });
});

/**
 * No document may claim the door decides audience PER REQUEST.
 *
 * It does not. `content-gateway/src/compose.ts` reads `KSOR_AUDIENCE` from the
 * environment once at boot into a per-process viewer; the request path never
 * touches it, so every caller holding a valid token for a door gets a
 * byte-identical view of the record. `docs/authorization.md` says exactly that
 * ("Any caller holding a valid token gets the whole record"), and
 * `specs/ksor/serve/spec.md` names per-request visibility filtering as out of
 * scope — and one shipped page said the opposite anyway, under the heading of
 * the requirement it fails.
 *
 * That is the most expensive kind of documentation defect this product can
 * have: it would walk an adopter with genuinely restricted documents into
 * pointing every reader at one door and serving them the internal half. The
 * earlier guards check that a named command EXISTS; this checks the CLAIM,
 * which is the half that was wrong (the same shape as the scaffold's "no
 * document claims that serving publishes").
 */
describe("no document claims the door scopes audience per request", () => {
  /** Shapes that assert it, in any phrasing a rewrite is likely to reach for. */
  const CLAIMS: readonly RegExp[] = [
    /audience scope\s+(?:\*\*)?per[- ]request/i,
    /per[- ]request\s+(?:\*\*)?audience/i,
    /scopes?\s+the\s+audience\s+per\s+request/i,
    /applies\s+the\s+audience[^.]{0,40}per\s+request/i,
  ];

  const pages = readdirSync(path.join(repoRoot, "packages/ksor/docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `packages/ksor/docs/${name}`)
    .concat([`${SCAFFOLD}/README.md`, `${SCAFFOLD}/AGENTS.md`, "README.md"]);

  it.each(pages)("%s", (rel) => {
    const text = read(rel);
    for (const shape of CLAIMS) {
      const hit = shape.exec(text);
      expect(
        hit,
        `${rel} says the door scopes audience per request: ${JSON.stringify(hit?.[0] ?? "")}. ` +
          "It does not — compose.ts resolves the viewer once at boot. A reader who believes " +
          "this points every caller at one door and serves them the restricted half.",
      ).toBeNull();
    }
  });
});

/**
 * `docs/status.md` names the version an adopter can actually install.
 *
 * Authority rule 3 makes that file "the only authority on what is actually
 * built", and it is the first thing a serious evaluator's coding agent reads.
 * It went ELEVEN releases stale before anyone noticed — the failure mode of a
 * fact kept in prose and nowhere else, in a repository shipping several
 * releases a day.
 *
 * Anchored on the PUBLISHED-PACKAGE sentence, not on the version appearing
 * anywhere in the file: the release summary below it names every version ever
 * shipped, so a bare `toContain` passes while the line an evaluator actually
 * reads is eleven releases stale. Found by mutation — the first version of this
 * assertion did not fail on the state it was written for.
 */
describe("docs/status.md names the version that is actually published", () => {
  it("matches packages/ksor/package.json", () => {
    const version = (JSON.parse(read("packages/ksor/package.json")) as { version: string }).version;
    const published = /`@panaversity\/ksor`\s+\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*\s+on npm/.exec(
      read("docs/status.md"),
    );
    expect(published, "docs/status.md must name the published package version").not.toBeNull();
    expect(
      published?.[1],
      `docs/status.md says the published package is ${published?.[1]}; package.json says ` +
        `${version}. It is the authority on what is built, and the first thing an ` +
        "evaluator's agent reads.",
    ).toBe(version);
  });
});

/**
 * A printed `build_id` is version-scoped, and any document showing one has to
 * say so.
 *
 * `buildIdOf` hashes `ksor_version` along with the record, deliberately — "what
 * produced this" is part of what a publication is. So a captured id is correct
 * for exactly one release, and a tutorial that prints one and tells the reader
 * "your `build_id` will not differ" is false for everyone on a later version.
 * That sentence shipped in 0.0.54's tutorial fix and was already false when
 * 0.0.55 published it, which is how this assertion came to exist: found by
 * walking the published package rather than by reading the diff.
 *
 * The rule is the general one, not the sentence: never show an id without
 * saying what moves it.
 */
describe("documents that print a build_id say what moves one", () => {
  const DOCS = [
    "docs/tutorials/01-hello-world.md",
    "docs/tutorials/02-make-it-yours.md",
    "packages/ksor/docs/building.md",
    "packages/ksor/README.md",
    "README.md",
  ] as const;

  for (const doc of DOCS) {
    it(`${doc}`, () => {
      let text: string;
      try {
        text = read(doc);
      } catch {
        return; // the document does not exist in this tree; nothing to hold
      }
      // PROXIMITY, not presence. The first version of this assertion asked
      // whether the word "toolchain" appeared anywhere in the file, and the
      // file already used it once for an unrelated reason — so removing the
      // caveat next to the id left it green. Caught by mutation.
      const WINDOW = 700;
      for (const m of text.matchAll(/build_id\s+sha256:[0-9a-f]{8}/g)) {
        const after = text.slice(m.index, m.index + WINDOW);
        expect(
          /toolchain/i.test(after),
          `${doc} prints a concrete build_id at offset ${m.index} and the next ${WINDOW} ` +
            "characters never say the id hashes the TOOLCHAIN as well as the record — so a " +
            "reader on any other ksor version is shown a hash that will not match theirs, " +
            "with nothing nearby explaining why",
        ).toBe(true);
      }
    });
  }
});

/**
 * Every link into `docs/tutorials/` resolves to a file that exists.
 *
 * The tutorials were renumbered into reading order on 2026-09-02, and three
 * documents pointed at the old name — the root README, the package README
 * that ships on npm, and the tutorials index. A stale link there is the first
 * thing an evaluator (or their agent) follows and the last thing anyone
 * re-checks. Relative links and GitHub blob URLs alike are held; the pointer
 * stub left for one release counts as existing, which is the point of it.
 */
describe("every link into docs/tutorials resolves", () => {
  const READMES = ["README.md", "packages/ksor/README.md", "docs/tutorials/README.md"] as const;
  const GH = "https://github.com/panaversity/ksor/blob/main/docs/tutorials/";

  it.each(READMES)("%s", (file) => {
    const text = read(file);
    const targets = new Set<string>();
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1] as string;
      if (href.startsWith(GH)) targets.add(`docs/tutorials/${href.slice(GH.length)}`);
      else if (href.includes("docs/tutorials/"))
        targets.add(href.replace(/^.*?(docs\/tutorials\/)/, "$1"));
      else if (file === "docs/tutorials/README.md" && href.startsWith("./"))
        targets.add(`docs/tutorials/${href.slice(2)}`);
    }
    const missing = [...targets].filter(
      (t) => !existsSync(path.join(repoRoot, t.split("#")[0] as string)),
    );
    expect(
      missing,
      `${file} links to tutorial file(s) that do not exist: ${missing.join(", ")}`,
    ).toEqual([]);
    expect(targets.size, `${file} links into docs/tutorials at all`).toBeGreaterThan(0);
  });
});

/**
 * "Nothing is downloaded at build time, and nothing phones home" (README.md's
 * quick start, repeated by the introduction) is a claim about the ARTIFACT,
 * and Next.js ships with anonymous usage telemetry switched ON: `next build`
 * and `next dev` each post to telemetry.nextjs.org unless
 * `NEXT_TELEMETRY_DISABLED` is set. The scaffold set it nowhere, so every
 * emitted site phoned home on its first build while the README said otherwise.
 *
 * The switch is the process ENVIRONMENT, not `next.config.mjs`. Read in
 * 16.3.3's source: `next build` constructs its `Telemetry` after loading the
 * config, but the `next dev` PARENT (`cli/next-dev.js`) never loads the config
 * and still constructs one on exit to record the session — an assignment in
 * the config would have left exactly that event in place, with nothing red.
 * So it sits at the front of the site's own scripts, which is where every
 * manager's root script (`pnpm -C system/site build`, `npm --prefix
 * system/site run build`, `cd system/site && bun run build`) and the deploy's
 * `pnpm build` all end up. The emitted-tree half is held in
 * init.integration.test.ts; this half ties the sentence to the bytes.
 */
describe("the scaffold makes 'nothing phones home' true", () => {
  it.each(["README.md", "docs/tutorials/00-introduction-to-ksor.md"])(
    "%s makes the claim",
    (file) => {
      // Pinned so the assertion below cannot go vacuous: a document that stops
      // making the claim fails here and asks whether the switch still matters.
      expect(
        flat(read(file)),
        `${file} no longer says nothing phones home — if that was dropped on purpose, ` +
          "retire this block with it rather than leaving a guard for a claim nobody makes",
      ).toMatch(/nothing phones home/);
    },
  );

  it("every site script that runs next switches telemetry off first", () => {
    const { scripts } = JSON.parse(read(`${SCAFFOLD}/system/site/package.json`)) as {
      scripts: Record<string, string>;
    };
    const runsNext = Object.entries(scripts).filter(([, body]) => /\bnext\b/.test(body));
    expect(
      runsNext.map(([name]) => name),
      "the site's build and dev scripts run next",
    ).toEqual(expect.arrayContaining(["build", "dev"]));
    for (const [name, body] of runsNext) {
      expect(
        body,
        `${SCAFFOLD}/system/site/package.json script "${name}" runs next with Next.js ` +
          "telemetry ON, and README.md says nothing phones home. The switch is the " +
          "environment, not the config: the `next dev` parent never loads next.config.mjs.",
      ).toMatch(/^NEXT_TELEMETRY_DISABLED=1 next\b/);
    }
  });

  it("the emitted .env.example says where the switch lives", () => {
    expect(
      read(`${SCAFFOLD}/env.example`),
      `${SCAFFOLD}/env.example: an adopter looking for the telemetry switch looks here ` +
        "first — say that it is already set, and where",
    ).toContain("NEXT_TELEMETRY_DISABLED");
  });
});

/**
 * Sentences a 2026-09-02 review of the root README found describing a product
 * that does not ship, each held against the thing that decides it: the
 * scaffold's manifest, the CI workflow, the record checker, the tutorial.
 * Every assertion here was red before its sentence was rewritten.
 */
describe("the README describes the scaffold that ships", () => {
  /** The prose under one heading, up to the next `##`/`###`, flattened. */
  const section = (file: string, heading: string): string => {
    const text = read(file);
    const start = text.indexOf(`\n${heading}\n`);
    if (start === -1) throw new Error(`${file}: no heading ${JSON.stringify(heading)}`);
    const rest = text.slice(start + heading.length + 2);
    const end = rest.search(/\n#{2,3} /);
    return flat(end === -1 ? rest : rest.slice(0, end));
  };

  it("`pnpm serve` serves; `pnpm refresh` publishes", () => {
    // The premise, from the manifest: serve is ONE process that publishes
    // nothing, and the build-ingest-collect chain is a separate script.
    const { scripts } = JSON.parse(read(`${SCAFFOLD}/package.json`)) as {
      scripts: Record<string, string>;
    };
    expect(scripts["serve"]).toBe("ksor serve");
    expect(scripts["refresh"]).toMatch(/^ksor build && .*ingest.* && .*gc$/);
    const served = section("README.md", "### Serve to AI Agents");
    expect(
      served,
      "README.md `### Serve to AI Agents`: `pnpm serve` runs `ksor serve` and nothing " +
        "else — it neither provisions nor ingests, so it is not 'the only command this " +
        "rung needs'. The first-run and re-run story belongs to `pnpm provision` and " +
        "`pnpm refresh`.",
    ).not.toMatch(/`pnpm serve` is the only command this rung needs/);
    // The skip needs BOTH halves — `sameCorpus`, the set of (id, content,
    // governance, toolchain) tuples, AND `sameCommit`, the run's recorded
    // source commit (ingest/build.ts: "a new commit over identical bytes is
    // still a new build fact") — so the sentence has to name the commit.
    const build = read("packages/content/src/ingest/build.ts");
    expect(build).toMatch(/async function sameCorpus\(/);
    expect(build).toMatch(/async function sameCommit\(/);
    expect(served, "README.md: the re-run command is `pnpm refresh`").toMatch(
      /`pnpm refresh`[^.]*unchanged/,
    );
    expect(
      served,
      "README.md: ingest reports `unchanged` only when the source commit matches too — " +
        "a sentence that names documents, governance and toolchain and not the commit " +
        "promises a skip the code refuses",
    ).toMatch(/commit[^.]*unchanged|unchanged[^.]*commit/);
  });

  it("the gate paragraph names what CI runs — no more, no less", () => {
    const jobs = [...read(".github/workflows/ci.yml").matchAll(/^    name: (.+)$/gm)].map(
      (m) => m[1] as string,
    );
    expect(jobs.length, "ci.yml declares named jobs").toBeGreaterThan(5);
    const text = read("README.md");
    const start = text.indexOf("The development gate is defined in");
    if (start === -1) throw new Error("README.md: no gate paragraph");
    const paragraph = flat(text.slice(start, text.indexOf("\n\n", start)));
    expect(
      paragraph,
      "README.md: browser and deployment acceptance have run in ci.yml for weeks — " +
        "say what the gate runs instead of promising it",
    ).not.toMatch(/will join it when a site surface exists/);
    // TWO-WAY: a suite the paragraph names must exist, and a suite CI runs
    // must be named — so removing a job or overclaiming one both go red.
    const PAIRS: ReadonlyArray<readonly [RegExp, RegExp, string]> = [
      [/browser/i, /^Scaffold walkthrough \(browser\)/, "the browser walkthrough (KSOR_E2E)"],
      [/Postgres/, /^Kernel acceptance \(Postgres\)/, "the kernel's Postgres tier"],
      [/Windows/, /^Init acceptance \(Windows\)/, "init on Windows"],
      [/npm and bun/, /^Manager acceptance/, "the npm and bun scaffolds"],
      [/Docker/, /^Container acceptance/, "the emitted Dockerfile on plain Docker"],
    ];
    for (const [keyword, job, what] of PAIRS) {
      const claimed = keyword.test(paragraph);
      const runs = jobs.some((name) => job.test(name));
      expect(
        claimed,
        `README.md's gate paragraph ${claimed ? "names" : "omits"} ${what} while ci.yml ` +
          `${runs ? "runs it" : "has no such job"} — the two must agree. Paragraph: ${paragraph}`,
      ).toBe(runs);
    }
  });

  it("`log.md` is refused and `index.md` is generated — nobody 'manages' either", () => {
    // The premise, from the checker: an authored log.md is refused by name, and
    // a committed index that differs from the generated one is refused too.
    const check = read("packages/content/src/record/check.ts");
    expect(check).toMatch(/slug: "ksor-reserved-name"/);
    expect(check).toMatch(/slug: "ksor-index-stale"/);
    const structure = section("README.md", "## Project Structure");
    expect(
      structure,
      "README.md `## Project Structure`: publishers neither generate nor manage " +
        "`log.md` — the checker refuses an authored one (ksor-reserved-name) and ksor " +
        "never writes one; `index.md` is written by `ksor build` and drift-checked",
    ).not.toMatch(/Publishers generate or manage those files/);
    expect(structure, "README.md: say that an authored `log.md` is refused").toMatch(
      /`log\.md`[^.]*refus/,
    );
    expect(structure, "README.md: say that `index.md` is generated").toMatch(
      /`index\.md`[^.]*generat|generat[^.]*`index\.md`/,
    );
  });

  it.each(["README.md", "packages/ksor/README.md"])(
    "%s's hello-world row says what Part 2 needs",
    (file) => {
      // The premise, from the tutorial: Part 1 is Node only; Part 2 is not.
      const tutorial = read("docs/tutorials/01-hello-world.md");
      const part2 = tutorial.slice(tutorial.indexOf("## Part 2"));
      expect(part2, "the tutorial's Part 2 asks for a Postgres").toMatch(/Postgres/);
      expect(part2, "…and an embedding key").toMatch(/embedding API key/);
      const row = /^\|[^\n]*01 · Hello world[^\n]*$/m.exec(read(file))?.[0];
      if (row === undefined) throw new Error(`${file}: no hello-world row in the tutorials table`);
      expect(
        row,
        `${file}: hello world is "Node only, nothing else" for Part 1 alone — Part 2 needs a ` +
          "Postgres and an embedding key, both free. The row is what a reader picks by.",
      ).not.toMatch(/Node only, nothing else/);
      expect(row, `${file}: the row names the Postgres Part 2 needs`).toMatch(/Postgres/);
      expect(row, `${file}: the row names the key Part 2 needs`).toMatch(/key/);
    },
  );
});

/**
 * The README's project-structure tree is presented as what `ksor init` emits,
 * and nothing held it to the emitted tree — a renamed sample or a moved policy
 * file would have left it wrong with nothing red. So it is parsed and every
 * path it names is looked for in a scaffold freshly emitted by the BUILT CLI,
 * the way the acceptance suite emits one. The tree is a picture, not an
 * inventory: it must say so when it leaves files out, and it does.
 */
describe("the README's project-structure tree names paths `ksor init` emits", () => {
  const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
  const FENCE = "```text\nmy-ksor/\n";

  const readTree = (): { intro: string; paths: string[]; abridged: boolean } => {
    const text = read("README.md");
    const at = text.indexOf(FENCE);
    if (at === -1) throw new Error("README.md: no project-structure tree (```text / my-ksor/)");
    const before = text.slice(0, at).trimEnd();
    const intro = flat(before.slice(before.lastIndexOf("\n\n") + 2));
    const body = text.slice(at + FENCE.length, text.indexOf("\n```", at));
    const stack: string[] = [];
    const paths: string[] = [];
    let abridged = false;
    for (const line of body.split("\n")) {
      // Four columns per level, then a connector; spacer lines and the
      // continuation of an annotation carry no connector and are skipped.
      const m = /^((?:│   |    )*)(?:├── |└── )(.*)$/.exec(line);
      if (m === null) continue;
      const depth = (m[1] as string).length / 4;
      const name = ((m[2] as string).split(/\s{2,}|\s*←/)[0] as string).trim();
      if (name === "...") {
        abridged = true;
        continue;
      }
      stack.length = depth;
      stack[depth] = name;
      paths.push(stack.join(""));
    }
    return { intro, paths, abridged };
  };

  /** Every file under a scaffold, as relative paths, .git excluded. */
  const filesUnder = (root: string): string[] => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.name === ".git") return [];
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [path.relative(root, full)];
      });
    return walk(root);
  };

  it("every path exists in a freshly emitted scaffold, and the tree says it is abridged", () => {
    const { intro, paths, abridged } = readTree();
    expect(paths.length, `parsed the tree into: ${paths.join(", ")}`).toBeGreaterThan(5);
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-readme-tree-"));
    try {
      const r = spawnSync(process.execPath, [distCli, "init", "my-ksor"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, npm_config_user_agent: "pnpm/11.22.0 npm/? node/v24" },
      });
      expect(r.status, r.stderr).toBe(0);
      const root = path.join(dir, "my-ksor");
      const missing = paths.filter((p) => {
        const full = path.join(root, p);
        if (!existsSync(full)) return true;
        return p.endsWith("/") !== statSync(full).isDirectory();
      });
      expect(
        missing,
        `README.md's project-structure tree names paths \`ksor init\` does not emit ` +
          `(a trailing slash means the tree shows a directory): ${missing.join(", ")}`,
      ).toEqual([]);
      // Abridgement is a FACT about the two trees, not a flag: whenever the
      // scaffold holds a file the picture omits, the picture must say so.
      const omitted = filesUnder(root).filter(
        (f) => !paths.includes(f) && !paths.some((p) => p.endsWith("/") && f.startsWith(p)),
      );
      if (omitted.length > 0 || abridged) {
        expect(
          intro,
          `README.md: the tree omits ${omitted.length} emitted file(s) (e.g. ` +
            `${omitted.slice(0, 3).join(", ")}) — the sentence introducing it must say ` +
            `it is abridged. Sentence: ${intro}`,
        ).toMatch(/abridged/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
