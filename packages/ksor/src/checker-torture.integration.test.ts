import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The scaffolded format-checker, tortured. Each case plants a defect an
// adopter can really create (a Finder .DS_Store, a reference-style link out of
// the record, an unclosed frontmatter block) and asserts the checker names it —
// or plants the benign twin and asserts it stays silent, because a checker that
// cries wolf on valid CommonMark gets switched off.
//
// Stages the template tree directly: this suite tests the shipped checker, not
// the CLI that copies it.
const templateDir = fileURLToPath(new URL("../templates/scaffold", import.meta.url));

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".css",
  ".txt",
]);

function stage(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    // The shipped template has no node_modules; a local `pnpm install` inside
    // it must not decide whether this suite can run (found live 2026-08-18:
    // pnpm's symlink farm failed the copy with ENOTSUP before any test ran).
    if (entry.name === "node_modules") continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      stage(src, dest);
      continue;
    }
    const isText =
      /^\.?git(ignore|attributes)$/.test(entry.name) ||
      TEXT_EXTENSIONS.has(path.extname(entry.name));
    if (isText) {
      const text = readFileSync(src, "utf8")
        .replaceAll("KSOR-STAMP-NAME", "torture-sor")
        .replaceAll("KSOR-STAMP-VERSION", "0.0.0");
      writeFileSync(dest, text);
    } else {
      copyFileSync(src, dest);
    }
  }
}

interface Probe {
  readonly status: number;
  readonly output: string;
}

/** A governed document with the two level-0 keys, unless the caller says otherwise. */
function doc(body: string, front = "title: Probe\nstatus: draft"): string {
  return `---\n${front}\n---\n\n${body}\n`;
}

const INSTANCE_BASE =
  'format: 1\nname: torture-sor\nksor:\n  requires: ">=0.0.0"\n  scaffolded: "0.0.0"';
const INSTANCE_BODY = "\n\n# torture-sor\n\nAuthoritative for the torture suite.\n";
/** The three-tier audience model of specs/ksor/visibility/spec.md. */
const MODEL = "audiences:\n  - public\n  - internal\n  - restricted\ndefault_visibility: public";

/** instance.md exactly as the scaffold ships it, plus the given frontmatter keys. */
function instance(extra: string): string {
  return `---\n${INSTANCE_BASE}\n${extra}\n---${INSTANCE_BODY}`;
}

describe("scaffolded format-checker — torture", () => {
  let work: string;
  let project: string;

  beforeAll(() => {
    work = mkdtempSync(path.join(tmpdir(), "ksor-checker-"));
    project = path.join(work, "torture-sor");
    stage(templateDir, project);
  });

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  function runChecker(): Probe {
    const checker = path.join(project, ".agents", "skills", "format-checker", "check.mjs");
    const run = spawnSync(process.execPath, [checker], { cwd: project, encoding: "utf8" });
    return { status: run.status ?? -1, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
  }

  function firstMissingAncestor(target: string): string | null {
    let dir = path.dirname(target);
    let missing: string | null = null;
    while (dir !== project && dir.startsWith(project) && !existsSync(dir)) {
      missing = dir;
      dir = path.dirname(dir);
    }
    return missing;
  }

  /** Plant files (null deletes), run the checker, then put the scaffold back as found. */
  function probe(files: Record<string, string | null>): Probe {
    const restore: { rel: string; prior: string | null }[] = [];
    const prune: string[] = [];
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(project, rel);
      restore.push({ rel, prior: existsSync(target) ? readFileSync(target, "utf8") : null });
      if (content === null) {
        rmSync(target, { force: true });
        continue;
      }
      const missing = firstMissingAncestor(target);
      if (missing !== null) prune.push(missing);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    try {
      return runChecker();
    } finally {
      for (const { rel, prior } of restore) {
        const target = path.join(project, rel);
        if (prior === null) rmSync(target, { force: true });
        else writeFileSync(target, prior);
      }
      for (const dir of prune) rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Like probe, for binary fixtures that never pre-exist in the scaffold. */
  function probeBytes(files: Record<string, Buffer>): Probe {
    for (const [rel, bytes] of Object.entries(files)) {
      const target = path.join(project, rel);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    try {
      return runChecker();
    } finally {
      for (const rel of Object.keys(files)) {
        rmSync(path.join(project, rel), { force: true });
      }
    }
  }

  it("passes on the pristine scaffold", () => {
    const result = runChecker();
    expect(result.status, result.output).toBe(0);
    expect(result.output, "checker stdout").toContain("ok — the record is well-formed");
  });

  it("scans reference-style link definitions", () => {
    const result = probe({
      "knowledge/refs.md": doc(
        "See [the leak][r1] and [the gap][r2].\n\n[r1]: ../../etc/passwd\n[r2]: ./missing.md",
      ),
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output, "checker output").toContain("link escapes the record: ../../etc/passwd");
    expect(result.output, "checker output").toContain("dead link: ./missing.md");

    // A definition is a whole line: prose that merely starts with a bracket is prose.
    const prose = probe({
      "knowledge/prose.md": doc("[TODO]: fix this before the review, then delete the line."),
    });
    expect(prose.status, prose.output).toBe(0);
  });

  it("sees the destination through single-quoted, parenthesized and double-quoted titles", () => {
    const result = probe({
      "knowledge/titles.md": doc(
        "[a](./gone-single.md 'a title')\n\n[b](./gone-paren.md (a title))\n\n[c](./gone-double.md \"a title\")",
      ),
    });
    expect(result.status, result.output).toBe(1);
    for (const target of ["./gone-single.md", "./gone-paren.md", "./gone-double.md"]) {
      expect(result.output, `dead link for ${target}`).toContain(`dead link: ${target}`);
    }
  });

  it("resolves angle-bracketed destinations without their brackets", () => {
    const benign = probe({ "knowledge/angle-ok.md": doc("[a](<./example.md>)") });
    expect(benign.status, benign.output).toBe(0);

    const broken = probe({ "knowledge/angle-bad.md": doc("[a](<./missing.md>)") });
    expect(broken.status, broken.output).toBe(1);
    expect(broken.output, "checker output").toContain("dead link: ./missing.md");
    expect(broken.output, "the brackets are syntax, not part of the path").not.toContain(
      "dead link: <./missing.md>",
    );
  });

  it("refuses frontmatter values YAML would reject, and accepts them quoted", () => {
    // found live: an unquoted colon in a title passed the check and killed
    // both site builds with a raw YAMLException from node_modules.
    const broken = probe({
      "knowledge/colon.md": "---\ntitle: Note: colons happen\nstatus: draft\n---\n\nBody.\n",
      "knowledge/bracket.md": "---\ntitle: [draft] policy\nstatus: draft\n---\n\nBody.\n",
    });
    expect(broken.status, broken.output).toBe(1);
    expect(broken.output).toContain("frontmatter value needs quoting: title: Note: colons happen");
    expect(broken.output).toContain("frontmatter value needs quoting: title: [draft] policy");

    const quotedDoc = probe({
      "knowledge/quoted.md": '---\ntitle: "Note: colons happen"\nstatus: draft\n---\n\nBody.\n',
    });
    expect(quotedDoc.status, quotedDoc.output).toBe(0);

    // Round-3 findings: a TRAILING colon fails YAML the same way, and a
    // bare ` #` starts a YAML comment — the page would silently truncate.
    const edges = probe({
      "knowledge/trailing.md": "---\ntitle: Q4:\nstatus: draft\n---\n\nBody.\n",
      "knowledge/comment.md": "---\ntitle: Pay # policy\nstatus: draft\n---\n\nBody.\n",
    });
    expect(edges.status, edges.output).toBe(1);
    expect(edges.output).toContain("frontmatter value needs quoting: title: Q4:");
    expect(edges.output).toContain("frontmatter value needs quoting: title: Pay # policy");
  });

  it("refuses YAML shapes the parser tolerated: tight colons, tabs, misplaced lists", () => {
    const result = probe({
      "knowledge/tight.md": "---\ntitle:Quarterly policy\nstatus: draft\n---\n\nBody.\n",
      "knowledge/tabbed.md":
        "---\ntitle: Tabbed\nstatus: draft\nprovenance:\n\t- cfo interview\n---\n\nBody.\n",
      "knowledge/listtitle.md": "---\ntitle: [complete list]\nstatus: draft\n---\n\nBody.\n",
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("missing space after the colon: title:Quarterly policy");
    expect(result.output).toContain("tab-indented frontmatter");
    expect(result.output).toContain("title is one value, not a list");

    // A complete flow list is valid YAML and valid for provenance — the rule
    // must not refuse a correct document (its printed remedy once looped).
    const flow = probe({
      "knowledge/flow.md":
        '---\ntitle: Flow\nstatus: draft\nprovenance: ["a", "b"]\n---\n\nBody.\n',
    });
    expect(flow.status, flow.output).toBe(0);
  });

  it("round-7 edges: quoting beats shape rules, and YAML's own escapes parse", () => {
    // Quoted values are strings whatever they look like: "[Draft]" is a
    // fine title, and a QUOTED provenance is a scalar the schema refuses.
    const fine = probe({
      "knowledge/qtitle.md": '---\ntitle: "[Draft]"\nstatus: draft\n---\n\nBody.\n',
      "knowledge/obrien.md": "---\ntitle: Irish\nstatus: draft\nowner: 'O''Brien'\n---\n\nBody.\n",
    });
    expect(fine.status, fine.output).toBe(0);

    const quotedProv = probe({
      "knowledge/qprov.md": '---\ntitle: P\nstatus: draft\nprovenance: "[a, b]"\n---\n\nBody.\n',
    });
    expect(quotedProv.status, quotedProv.output).toBe(1);
    expect(quotedProv.output).toContain("provenance is a list, not a value");

    // A multi-line code span inside one paragraph is real code; the checker
    // must not flag the link-shaped text inside it.
    const span = probe({
      "knowledge/mlspan.md": doc("Use `a\n[not a link](./nope.md)\nb` as one span."),
    });
    expect(span.status, span.output).toBe(0);
  });

  it("holds instance.md to the same YAML-shape rules as the record", () => {
    const original = readFileSync(path.join(project, "instance.md"), "utf8");
    const duplicated = probe({
      "instance.md": original.replace(/^name: (.*)$/m, "name: $1\nname: other-name"),
    });
    expect(duplicated.status, duplicated.output).toBe(1);
    expect(duplicated.output).toContain("duplicate frontmatter key: name");
  });

  it("accepts the kernel's serve config blocks — the checker must not fight the kernel", () => {
    // The kernel's instance parser REQUIRES database: to serve; if the scaffold
    // checker (which runs in adopter CI) rejected it, no instance.md could
    // satisfy both serving and CI — the "two parsers, one file" contradiction
    // (review 2026-08-20). Verify all four groups pass.
    const result = probe({
      "instance.md": instance(
        "database:\n  dsn_env: KSOR_DB_URL\n" +
          "embedding:\n  provider: gemini\n  model: gemini-embedding-001\n  dim: 1536\n" +
          "retrieval:\n  vector_floor: 0.55\n" +
          "budgets:\n  maximum_response_characters: 120000",
      ),
    });
    expect(result.status, result.output).toBe(0);
  });

  it("still catches a misspelled field inside a kernel block", () => {
    const result = probe({ "instance.md": instance("database:\n  dsn_evn: KSOR_DB_URL") });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("unknown key under database: dsn_evn");
  });

  it("reports symlinks in the record instead of crashing on a dangling one", () => {
    const target = path.join(project, "knowledge", "dangling.md");
    symlinkSync(path.join(project, "knowledge", "no-such-file.md"), target);
    try {
      const result = runChecker();
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain("symlink in the record");
      expect(result.output, "no raw stack").not.toContain("ENOENT");
    } finally {
      rmSync(target, { force: true });
    }
  });

  it("refuses duplicate frontmatter keys — YAML would, after a green check", () => {
    const result = probe({
      "knowledge/dup.md": "---\ntitle: One\nstatus: draft\ntitle: Two\n---\n\nBody.\n",
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("duplicate frontmatter key: title");
  });

  it("refuses malformed quoting instead of treating it as quoted", () => {
    const result = probe({
      "knowledge/mq1.md": '---\ntitle: "a" and "b"\nstatus: draft\n---\n\nBody.\n',
      "knowledge/mq2.md": "---\ntitle: 'unclosed\nstatus: draft\n---\n\nBody.\n",
      "knowledge/mq3.md": "---\ntitle: - foo\nstatus: draft\n---\n\nBody.\n",
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('frontmatter quoting is malformed: title: "a" and "b"');
    expect(result.output).toContain("frontmatter quoting is malformed: title: 'unclosed");
    expect(result.output).toContain("frontmatter value needs quoting: title: - foo");
  });

  // The governance-rendering slice put these frontmatter keys on the PAGE, so
  // a shape the checker waved through stopped being cosmetic and started
  // publishing wrong or leaked text. Every case below was reproduced against
  // the real checker before the rule existed (2026-08-20).
  describe("governance keys the site now publishes", () => {
    const instanceWith = (block: string): string =>
      readFileSync(path.join(project, "instance.md"), "utf8").replace(
        "\nksor:\n",
        `\n${block}\nksor:\n`,
      );

    it("refuses a group written as a flow mapping, which parses as a scalar with no children", () => {
      // `site: { governance: false }` passed the check AND was ignored by the
      // site — the owner's setting dropped in silence, and the closed key set
      // voided for every nested group at the same time.
      const flow = probe({ "instance.md": instanceWith("site: { governance: false }") });
      expect(flow.status, flow.output).toBe(1);
      expect(flow.output).toContain("site: has an inline value");

      const misspelledInside = probe({
        "instance.md": instanceWith('database: { dsn_evn: "KSOR_DB_URL" }'),
      });
      expect(misspelledInside.status, misspelledInside.output).toBe(1);
    });

    it("accepts a YAML comment on a group key — the site's own reader allows it", () => {
      // `governanceVisible()` matches /^site:[ \t]*(?:#.*)?$/ explicitly, and
      // `audiences: # …` already passed here. Refusing it made the checker
      // stricter than the surface it protects, and told the owner their
      // settings were being dropped when they were not.
      const commented = probe({
        "instance.md": instanceWith("site: # publication settings\n  governance: false"),
      });
      expect(commented.status, commented.output).toBe(0);
    });

    it("accepts the capitalised booleans YAML and the site both accept", () => {
      for (const value of ["False", "TRUE", "True"]) {
        const result = probe({ "instance.md": instanceWith(`site:\n  governance: ${value}`) });
        expect(result.status, `${value} → ${result.output}`).toBe(0);
      }
      // …and still refuses a value neither parser can read.
      const nonsense = probe({ "instance.md": instanceWith("site:\n  governance: banana") });
      expect(nonsense.status, nonsense.output).toBe(1);
    });

    it("refuses a duplicated NESTED key: the map kept the last, the site reads the first", () => {
      const dup = probe({
        "instance.md": instanceWith("site:\n  governance: true\n  governance: false"),
      });
      expect(dup.status, dup.output).toBe(1);
      expect(dup.output).toContain("duplicate frontmatter key: site.governance");
    });

    it("accepts a block-style governance switch — the shape an owner is told to write", () => {
      const ok = probe({ "instance.md": instanceWith("site:\n  governance: false") });
      expect(ok.status, ok.output).toBe(0);
    });

    // `effective` is published inside <time datetime> as fact. Three rounds of
    // narrower rules each leaked a different way for the page to say a day the
    // record never wrote, so the contract is now: a calendar-valid YYYY-MM-DD
    // unquoted, or quoted text published verbatim.
    it("refuses every unquoted shape YAML would republish as a different day", () => {
      const cases: readonly [string, string][] = [
        // js-yaml's date path is Date.UTC(y, m, d) with NO validation, so an
        // impossible date rolls into the next month silently.
        ["2026-06-31", "rolls to July 1st"],
        ["2026-13-01", "rolls a year forward"],
        ["2026-02-29", "2026 is not a leap year"],
        // carries a time → read back in a timezone, can land a day early
        ["2026-04-01 00:00:00 +05:00", "timestamp with an offset"],
        ["2026-4-1 00:00:00 +05:00", "one-digit month and day"],
        ["2026-04-01t00:00:00+05:00", "lowercase t separator"],
        // types as a NUMBER and used to vanish from the page entirely
        ["2026", "a bare year"],
        // free text YAML leaves alone, but which is not a date either
        ["2026-04-01 for new customers", "trailing prose"],
      ];
      for (const [value, why] of cases) {
        const result = probe({
          "knowledge/tz.md": `---\ntitle: TZ\nstatus: approved\neffective: ${value}\n---\n\nBody.\n`,
        });
        expect(result.status, `${value} (${why}) → ${result.output}`).toBe(1);
        expect(result.output).toContain("effective is not a calendar date");
      }
    });

    it("accepts a real date, and any text the author QUOTES", () => {
      // Quoted is the escape hatch: it is published verbatim and never parsed
      // as a date, so "Q1 2026" and a legal-sounding phrase both work.
      const real = probe({
        "knowledge/tz.md":
          "---\ntitle: TZ\nstatus: approved\neffective: 2026-04-01\n---\n\nBody.\n",
      });
      expect(real.status, real.output).toBe(0);
      for (const quoted of ['"Q1 2026"', '"2026-04-01 for new customers"', '"2026-06-31"']) {
        const result = probe({
          "knowledge/tz.md": `---\ntitle: TZ\nstatus: approved\neffective: ${quoted}\n---\n\nBody.\n`,
        });
        expect(result.status, `${quoted} → ${result.output}`).toBe(0);
      }
    });

    it("prints a remedy that is itself valid — following it must produce a green check", () => {
      // The previous rule's remedy sliced 10 characters off the value, so for
      // `2026-4-1 00:00:00 +05:00` it advised writing `2026-4-1 0` — garbage
      // that the checker then accepted (round 3).
      const refused = probe({
        "knowledge/tz.md":
          "---\ntitle: TZ\nstatus: approved\neffective: 2026-4-1 00:00:00 +05:00\n---\n\nBody.\n",
      });
      expect(refused.status).toBe(1);
      const quotedRemedy = /effective: "([^"]*)"/.exec(refused.output)?.[1];
      expect(quotedRemedy, refused.output).toBeDefined();
      const following = probe({
        "knowledge/tz.md": `---\ntitle: TZ\nstatus: approved\neffective: "${quotedRemedy}"\n---\n\nBody.\n`,
      });
      expect(following.status, `following the remedy → ${following.output}`).toBe(0);
    });

    it("accepts a comment line an author writes inside their own frontmatter", () => {
      // YAML allows it, both surfaces read the record perfectly, and the rule
      // that refused it was meant for WRAPPED VALUES — it caught annotations
      // instead and turned the adopter's CI red (round 4).
      const annotated = probe({
        "knowledge/note.md":
          "---\ntitle: Note\nstatus: approved\nprovenance:\n  - Board minute 2026-02-11\n" +
          "  # add the signed PDF once it lands\n---\n\nBody.\n",
      });
      expect(annotated.status, annotated.output).toBe(0);

      const topLevelComment = probe({
        "knowledge/note.md":
          "---\n# the two sources this rests on\ntitle: Note\nstatus: approved\n---\n\nBody.\n",
      });
      expect(topLevelComment.status, topLevelComment.output).toBe(0);
    });

    it("refuses a value wrapped onto a second line, which YAML folds back", () => {
      // The parser skipped indented continuations, so every rule inspected a
      // string that was not the published value: this exact document passed
      // the date rule and then shipped 2026-03-31 (round 3).
      const wrapped = probe({
        "knowledge/tz.md":
          "---\ntitle: TZ\nstatus: approved\neffective: 2026-04-01\n  00:00:00 +05:00\n---\n\nBody.\n",
      });
      expect(wrapped.status, wrapped.output).toBe(1);

      const nextLine = probe({
        "knowledge/tz.md":
          "---\ntitle: TZ\nstatus: approved\neffective:\n  2026-04-01 00:00:00 +05:00\n---\n\nBody.\n",
      });
      expect(nextLine.status, nextLine.output).toBe(1);
    });

    it("names a source that YAML would cut short at a #", () => {
      // `- Invoice #4471 from Acme Ltd` publishes as "Invoice": a citation is
      // supposed to point at exactly one source, and most of this one is gone.
      const cut = probe({
        "knowledge/inv.md":
          "---\ntitle: Inv\nstatus: approved\nprovenance:\n  - Invoice #4471 from Acme Ltd\n---\n\nBody.\n",
      });
      expect(cut.status, cut.output).toBe(1);
      expect(cut.output).toContain("cut short at a #");

      // Quoted keeps the whole thing.
      const quoted = probe({
        "knowledge/inv.md":
          '---\ntitle: Inv\nstatus: approved\nprovenance:\n  - "Invoice #4471 from Acme Ltd"\n---\n\nBody.\n',
      });
      expect(quoted.status, quoted.output).toBe(0);
    });

    it("validates EVERY superseded_by, not only ones shaped like a path", () => {
      // `legal/terms` matched neither shape test, so it skipped existence, the
      // escape-the-record rule AND the cross-audience leak rule — and the
      // notice then published the raw pointer.
      const shapeless = probe({
        "knowledge/gone.md":
          "---\ntitle: Gone\nstatus: superseded\nsuperseded_by: legal/terms\n---\n\nBody.\n",
      });
      expect(shapeless.status, shapeless.output).toBe(1);
      expect(shapeless.output).toContain("superseded_by is not a document pointer");
    });

    it("refuses a superseded_by that names a directory", () => {
      const dir = probe({
        "knowledge/folder/child.md": "---\ntitle: Child\nstatus: approved\n---\n\nBody.\n",
        "knowledge/gone.md":
          "---\ntitle: Gone\nstatus: superseded\nsuperseded_by: ./folder/\n---\n\nBody.\n",
      });
      expect(dir.status, dir.output).toBe(1);
    });

    it("refuses a successor pointer on a document the record calls current", () => {
      // Otherwise the site publishes an unmissable "Superseded" banner over a
      // live document — the natural state after an author edits status back
      // and forgets the pointer.
      const stale = probe({
        "knowledge/live.md":
          "---\ntitle: Live\nstatus: approved\nsuperseded_by: ./example.md\n---\n\nStill current.\n",
      });
      expect(stale.status, stale.output).toBe(1);
      expect(stale.output).toContain("superseded_by on a document that is status: approved");
    });

    it("does not blame a correct pointer when the SUCCESSOR is the broken one", () => {
      // The successor exists but has not been given frontmatter yet — the
      // ordinary state mid-edit. That is one problem, against the successor.
      // It used to raise a second, false one against the pointer, telling the
      // author to check capitalisation that was already right.
      const result = probe({
        "knowledge/new-policy.md": "# New policy\n\nStill being written.\n",
        "knowledge/old-policy.md":
          "---\ntitle: Old\nstatus: superseded\nsuperseded_by: ./new-policy.md\n---\n\nBody.\n",
      });
      expect(result.status, result.output).toBe(1);
      expect(result.output).not.toContain("does not name a document in the record");
    });

    it("refuses a supersession that leads back to itself", () => {
      const itself = probe({
        "knowledge/self.md":
          "---\ntitle: Self\nstatus: superseded\nsuperseded_by: ./self.md\n---\n\nBody.\n",
      });
      expect(itself.status, itself.output).toBe(1);
      expect(itself.output).toContain("points at this document itself");

      const cycle = probe({
        "knowledge/cyc-a.md":
          "---\ntitle: A\nstatus: superseded\nsuperseded_by: ./cyc-b.md\n---\n\nBody.\n",
        "knowledge/cyc-b.md":
          "---\ntitle: B\nstatus: superseded\nsuperseded_by: ./cyc-a.md\n---\n\nBody.\n",
      });
      expect(cycle.status, cycle.output).toBe(1);
      expect(cycle.output).toContain("supersession cycle");
    });

    it("names the documents actually in the cycle, and no edge the record lacks", () => {
      // a → b → c → b. The cycle is b ⇄ c; `a` merely leads into it and its own
      // pointer is correct. The first version reported "a → b → c → a" against
      // a — blaming the innocent document and inventing the closing edge.
      const result = probe({
        "knowledge/lead-a.md":
          "---\ntitle: A\nstatus: superseded\nsuperseded_by: ./cyc-b.md\n---\n\nBody.\n",
        "knowledge/cyc-b.md":
          "---\ntitle: B\nstatus: superseded\nsuperseded_by: ./cyc-c.md\n---\n\nBody.\n",
        "knowledge/cyc-c.md":
          "---\ntitle: C\nstatus: superseded\nsuperseded_by: ./cyc-b.md\n---\n\nBody.\n",
      });
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain(
        "supersession cycle: knowledge/cyc-b.md → knowledge/cyc-c.md → knowledge/cyc-b.md",
      );
      // The edge c → a does not exist and must not be printed, and the innocent
      // document must not be the one blamed.
      expect(result.output).not.toContain("knowledge/lead-a.md → ");
      expect(result.output).not.toMatch(/→ knowledge\/lead-a\.md/);
    });

    it("accepts a supersession CHAIN, which ends at a current document", () => {
      // a → b → c is not a cycle: the reader arrives somewhere real.
      const chain = probe({
        "knowledge/ch-a.md":
          "---\ntitle: A\nstatus: superseded\nsuperseded_by: ./ch-b.md\n---\n\nBody.\n",
        "knowledge/ch-b.md":
          "---\ntitle: B\nstatus: superseded\nsuperseded_by: ./ch-c.md\n---\n\nBody.\n",
        "knowledge/ch-c.md": "---\ntitle: C\nstatus: approved\n---\n\nCurrent.\n",
      });
      expect(chain.status, chain.output).toBe(0);
    });

    it("still accepts a fully governed document — the rules must not fight the record", () => {
      const good = probe({
        "knowledge/successor.md": "---\ntitle: Successor\nstatus: approved\n---\n\nNew.\n",
        "knowledge/replaced.md":
          "---\ntitle: Replaced\nstatus: superseded\nowner: Finance\neffective: 2026-04-01\n" +
          "provenance:\n  - Board minutes 2026-03-11\nsuperseded_by: ./successor.md\n---\n\nOld.\n",
      });
      expect(good.status, good.output).toBe(0);
    });
  });

  it("keeps checking links after a stray unpaired backtick", () => {
    const result = probe({
      "knowledge/stray.md": doc(
        "A stray ` backtick here.\n\nLater, [a dead link](./missing-after-stray.md) and `real code`.",
      ),
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("dead link: ./missing-after-stray.md");
  });

  it("refuses a scalar provenance and accepts the list form", () => {
    const scalar = probe({
      "knowledge/prov.md": doc(
        "Body.",
        "title: Prov\nstatus: draft\nprovenance: internal interview with the CFO",
      ),
    });
    expect(scalar.status, scalar.output).toBe(1);
    expect(scalar.output).toContain("provenance is a list, not a value");

    const list = probe({
      "knowledge/prov-list.md": doc(
        "Body.",
        "title: Prov\nstatus: draft\nprovenance:\n  - internal interview with the CFO",
      ),
    });
    expect(list.status, list.output).toBe(0);
  });

  it("refuses underscore-prefixed names — the record has no hidden documents", () => {
    const result = probe({ "knowledge/_partial.md": doc("Body.") });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("underscore-prefixed name");
  });

  it("holds instance.md's name to the init grammar for life", () => {
    const original = readFileSync(path.join(project, "instance.md"), "utf8");
    const renamed = probe({
      "instance.md": original.replace(/^name: .*$/m, "name: My Project"),
    });
    expect(renamed.status, renamed.output).toBe(1);
    expect(renamed.output).toContain('name "My Project" does not match');
  });

  it("refuses non-ASCII filenames — the path is the address, the title is the name", () => {
    const result = probe({
      "knowledge/política.md": doc("Body."),
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("contains non-ASCII characters");
  });

  it("names a corrupt PNG at check time instead of letting the build 500", () => {
    // A real 4x4 PNG (sips-exported from the KSoR mark), then the same bytes
    // with one bit flipped in the IDAT payload so its CRC no longer matches.
    const valid = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARGVYSWZNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAAAEoAMABAAAAAEAAAAEAAAAAMVs/gIAAAHJaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJYTVAgQ29yZSA2LjAuMCI+CiAgIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFhEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFlEaW1lbnNpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgqWsr5jAAAAP0lEQVQIHQE0AMv/Af////b7/f0B+wsDBgT2+PzL2urzAOk2Jh8CCQcE7ejq1sjrC/8MAP///+bs9dbg8Pz9/kfmIaM5XLTrAAAAAElFTkSuQmCC",
      "base64",
    );
    const corrupt = Buffer.from(valid);
    corrupt[valid.length - 20] = (corrupt[valid.length - 20] ?? 0) ^ 0xff;

    const good = probeBytes({ "knowledge/diagram.png": valid });
    expect(good.status, good.output).toBe(0);

    const bad = probeBytes({ "knowledge/diagram.png": corrupt });
    expect(bad.status, bad.output).toBe(1);
    expect(bad.output).toContain("corrupt PNG");
  });

  it("leaves URI schemes and protocol-relative links alone", () => {
    const result = probe({
      "knowledge/schemes.md": doc(
        "[call](tel:+1-555-0100) · [ftp](ftp://host/x) · [cdn](//cdn.example.com/x) · [mail](mailto:a@b.c)",
      ),
    });
    expect(result.status, result.output).toBe(0);
  });

  it("treats indented code blocks as code, but keeps checking real content", () => {
    const benign = probe({
      "knowledge/indented.md": doc("Prose.\n\n    [sample](./missing-in-code.md)\n\nMore prose."),
    });
    expect(benign.status, benign.output).toBe(0);

    const broken = probe({
      "knowledge/unindented.md": doc("Prose with [a real link](./really-missing.md)."),
    });
    expect(broken.status, broken.output).toBe(1);
    expect(broken.output, "checker output").toContain("dead link: ./really-missing.md");

    // A nested list's continuation sits at code indent but is content — its
    // dead links must still be caught (review finding, 2026-08-18).
    const nested = probe({
      "knowledge/nested-list.md": doc("1. Policies\n\n    - [Leave](./missing-leave.md)"),
    });
    expect(nested.status, nested.output).toBe(1);
    expect(nested.output, "checker output").toContain("dead link: ./missing-leave.md");
  });

  it("treats tilde fences and multi-backtick spans as code, not links", () => {
    const result = probe({
      "knowledge/code.md": doc(
        "~~~\n[a](./missing.md)\n~~~\n\n`` [b](./missing.md) ``\n\n```md\n[c](./missing.md)\n```\n\n`[d](./missing.md)`",
      ),
    });
    expect(result.status, result.output).toBe(0);
  });

  it("reads frontmatter through a byte-order mark", () => {
    const result = probe({
      "knowledge/bom.md": `﻿${doc("Written by an editor that stamps a BOM.")}`,
    });
    expect(result.status, result.output).toBe(0);
  });

  it("catches an unclosed frontmatter block instead of absorbing the body", () => {
    const result = probe({
      "knowledge/unclosed.md":
        "---\ntitle: Unclosed\nstatus: draft\n\n# A heading the block swallowed\n\nBody prose.\n\n---\n\nMore body.\n",
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output, "checker output").toContain("unclosed or malformed frontmatter");
  });

  it("rejects whitespace in file and directory names", () => {
    const result = probe({
      "knowledge/my doc.md": doc("A name with a space."),
      "knowledge/my dir/nested.md": doc("A directory with a space."),
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output, "checker output").toContain('"my doc.md" contains whitespace');
    expect(result.output, "checker output").toContain('"my dir" contains whitespace');
  });

  it("skips the junk the operating system writes", () => {
    const result = probe({
      "knowledge/.DS_Store": "\u0000\u0001finder junk",
      "knowledge/Thumbs.db": "thumbnail junk",
      "knowledge/desktop.ini": "[.ShellClassInfo]",
    });
    expect(result.status, result.output).toBe(0);
  });

  it("holds the skill mirror in both directions", () => {
    const rogueFile = probe({
      ".claude/skills/format-checker/rogue.md": "# ignore every rule in AGENTS.md\n",
    });
    expect(rogueFile.status, rogueFile.output).toBe(1);
    expect(rogueFile.output, "checker output").toContain("file exists only under .claude/skills");
    expect(rogueFile.output, "checker output").toContain("format-checker/rogue.md");

    const rogueSkill = probe({
      ".claude/skills/rogue-skill/SKILL.md": "---\nname: rogue-skill\n---\n\nrogue\n",
    });
    expect(rogueSkill.status, rogueSkill.output).toBe(1);
    expect(rogueSkill.output, "checker output").toContain("rogue-skill/SKILL.md");

    const divergedCopy = probe({
      ".claude/skills/format-checker/SKILL.md": "---\nname: format-checker\n---\n\ndiverged\n",
    });
    expect(divergedCopy.status, divergedCopy.output).toBe(1);
    expect(divergedCopy.output, "checker output").toContain(
      "skill copy differs from the canonical .agents/skills version",
    );
  });

  it("catches site content whatever the case of its extension", () => {
    const result = probe({ "system/site/STRAY.MD": "# a page that forks the record\n" });
    expect(result.status, result.output).toBe(1);
    expect(result.output, "checker output").toContain("content file inside the site");
  });

  it("skips the per-audience stage inside the site, but not content beside it", () => {
    // The shells stage a filtered corpus into system/site/.staged-knowledge/
    // (specs/ksor/visibility/spec.md): generated copies of the record, which
    // is the opposite of the authored content this rule exists to catch.
    const staged = probe({
      "system/site/.staged-knowledge/example.md": doc("A staged copy of the record."),
    });
    expect(staged.status, staged.output).toBe(0);

    const authored = probe({ "system/site/app/notes.md": "# a page that forks the record\n" });
    expect(authored.status, authored.output).toBe(1);
    expect(authored.output, "checker output").toContain("content file inside the site");
  });

  it("requires superseded_by to resolve to a document that exists", () => {
    const broken = probe({
      "knowledge/old.md": doc(
        "Replaced.",
        "title: Old\nstatus: superseded\nsuperseded_by: ./nonexistent.md",
      ),
    });
    expect(broken.status, broken.output).toBe(1);
    expect(broken.output, "checker output").toContain(
      "superseded_by points at a document that does not exist: ./nonexistent.md",
    );

    const escaping = probe({
      "knowledge/escaped.md": doc(
        "Replaced.",
        "title: Escaped\nstatus: superseded\nsuperseded_by: ../../elsewhere.md",
      ),
    });
    expect(escaping.status, escaping.output).toBe(1);
    expect(escaping.output, "checker output").toContain("superseded_by leaves the record");

    const good = probe({
      "knowledge/replaced.md": doc(
        "Replaced by the example.",
        "title: Replaced\nstatus: superseded\nsuperseded_by: ./example.md",
      ),
    });
    expect(good.status, good.output).toBe(0);
  });

  it("refuses an empty record", () => {
    const result = probe({ "knowledge/example.md": null });
    expect(result.status, result.output).toBe(1);
    expect(result.output, "checker output").toContain("the record has no documents");
  });

  it("validates instance.md: present, format 1, closed key set", () => {
    const base =
      'format: 1\nname: torture-sor\nksor:\n  requires: ">=0.0.0"\n  scaffolded: "0.0.0"';
    const body = "\n\n# torture-sor\n\nAuthoritative for the torture suite.\n";

    const missing = probe({ "instance.md": null });
    expect(missing.status, missing.output).toBe(1);
    expect(missing.output, "checker output").toContain("the instance identity file is missing");

    const unknownTop = probe({ "instance.md": `---\n${base}\ngovernance: 4\n---${body}` });
    expect(unknownTop.status, unknownTop.output).toBe(1);
    expect(unknownTop.output, "checker output").toContain("unknown top-level key: governance");

    const unknownNested = probe({
      "instance.md": `---\nformat: 1\nname: torture-sor\nksor:\n  requires: ">=0.0.0"\n  channel: beta\n---${body}`,
    });
    expect(unknownNested.status, unknownNested.output).toBe(1);
    expect(unknownNested.output, "checker output").toContain("unknown key under ksor: channel");

    const wrongFormat = probe({
      "instance.md": `---\nformat: 2\nname: torture-sor\n---${body}`,
    });
    expect(wrongFormat.status, wrongFormat.output).toBe(1);
    expect(wrongFormat.output, "checker output").toContain('format "2" is not 1');

    const noName = probe({ "instance.md": `---\nformat: 1\n---${body}` });
    expect(noName.status, noName.output).toBe(1);
    expect(noName.output, "checker output").toContain("missing frontmatter key: name");

    const reserved = probe({
      "instance.md": `---\n${base}\nsite:\n  url: "https://example.test"\n---${body}`,
    });
    expect(reserved.status, reserved.output).toBe(0);
  });

  // -------------------------------------------------------------------------
  // visibility — the audience model (specs/ksor/visibility/spec.md)
  // -------------------------------------------------------------------------

  it("refuses a visibility the record never declared, and names the declared set", () => {
    const undeclared = probe({
      "instance.md": instance(MODEL),
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: secret"),
    });
    expect(undeclared.status, undeclared.output).toBe(1);
    expect(undeclared.output, "checker output").toContain(
      'visibility "secret" is not a declared audience',
    );
    expect(undeclared.output, "the message names the declared set").toContain(
      "public, internal, restricted",
    );

    const declared = probe({
      "instance.md": instance(MODEL),
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: internal"),
    });
    expect(declared.status, declared.output).toBe(0);
  });

  it("refuses visibility: while the record declares no audience model", () => {
    const keyed = probe({
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: internal"),
    });
    expect(keyed.status, keyed.output).toBe(1);
    expect(keyed.output, "checker output").toContain("the record declares no audience model");

    const plain = probe({ "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft") });
    expect(plain.status, plain.output).toBe(0);
  });

  it("refuses audiences: without default_visibility: — there is no safe inference", () => {
    const noDefault = probe({ "instance.md": instance("audiences:\n  - public\n  - internal") });
    expect(noDefault.status, noDefault.output).toBe(1);
    expect(noDefault.output, "checker output").toContain("audiences: without default_visibility:");

    const withDefault = probe({
      "instance.md": instance("audiences:\n  - public\n  - internal\ndefault_visibility: public"),
    });
    expect(withDefault.status, withDefault.output).toBe(0);
  });

  it("refuses an audience list that does not lead with public, or repeats an audience", () => {
    const notFirst = probe({
      "instance.md": instance("audiences:\n  - internal\n  - public\ndefault_visibility: public"),
    });
    expect(notFirst.status, notFirst.output).toBe(1);
    expect(notFirst.output, "checker output").toContain("does not start with public");

    const duplicated = probe({
      "instance.md": instance(
        "audiences:\n  - public\n  - internal\n  - internal\ndefault_visibility: public",
      ),
    });
    expect(duplicated.status, duplicated.output).toBe(1);
    expect(duplicated.output, "checker output").toContain("duplicate audience: internal");
  });

  it("reads the audience list the way YAML does — a trailing comment is not a name", () => {
    // found live: `- public # the default` refused every public document
    // instead of the list, naming a defect in the wrong file.
    const commented = probe({
      "instance.md": instance(
        "audiences:\n  - public # everyone\n  - internal\ndefault_visibility: public",
      ),
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: public"),
    });
    expect(commented.status, commented.output).toBe(0);
  });

  it("reads default_visibility the way YAML does — a trailing comment is not a tier", () => {
    // found live 2026-08-19: both build scanners stripped the comment, the
    // checker did not — `default_visibility: public # the default` built
    // fine and failed check.
    const commented = probe({
      "instance.md": instance(
        "audiences:\n  - public\n  - internal\ndefault_visibility: public # the default",
      ),
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: public"),
    });
    expect(commented.status, commented.output).toBe(0);
  });

  it("tolerates blank lines and a key-line comment in the model — the shells do too", () => {
    // found live 2026-08-19: both shapes passed this checker and refused
    // every build with ksor-audiences-unreadable before the build scanners
    // learned them; this pins the grammar all three parsers now share.
    const spaced = probe({
      "instance.md": instance(
        "audiences: # least- to most-restricted\n\n  - public\n\n  - internal\ndefault_visibility: public",
      ),
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: internal"),
    });
    expect(spaced.status, spaced.output).toBe(0);
  });

  it("refuses a dash glued to its value — a list item to nobody", () => {
    // found live 2026-08-19: `  -internal` was silently skipped here while
    // both build scanners stopped reading the list at it — one green record,
    // two different audience lists.
    const glued = probe({
      "instance.md": instance("audiences:\n  - public\n  -internal\ndefault_visibility: public"),
    });
    expect(glued.status, glued.output).toBe(1);
    expect(glued.output, "checker output").toContain("-internal");
  });

  it("refuses a default_visibility that is not one of the declared audiences", () => {
    const stray = probe({
      "instance.md": instance("audiences:\n  - public\n  - internal\ndefault_visibility: secret"),
    });
    expect(stray.status, stray.output).toBe(1);
    expect(stray.output, "checker output").toContain(
      'default_visibility "secret" is not one of the declared audiences',
    );
  });

  it("refuses audiences: written as a value, and default_visibility: with no audiences", () => {
    const scalar = probe({
      "instance.md": instance("audiences: public\ndefault_visibility: public"),
    });
    expect(scalar.status, scalar.output).toBe(1);
    expect(scalar.output, "checker output").toContain("audiences is a list, not a value: public");

    const orphan = probe({ "instance.md": instance("default_visibility: public") });
    expect(orphan.status, orphan.output).toBe(1);
    expect(orphan.output, "checker output").toContain("default_visibility: without audiences:");
  });

  it("refuses a visibility written as a list — one document, one audience", () => {
    const block = probe({
      "instance.md": instance(MODEL),
      "knowledge/hr.md": doc(
        "Body.",
        "title: HR\nstatus: draft\nvisibility:\n  - public\n  - internal",
      ),
    });
    expect(block.status, block.output).toBe(1);
    expect(block.output, "checker output").toContain("visibility is one value, not a list");

    const flow = probe({
      "instance.md": instance(MODEL),
      "knowledge/hr.md": doc("Body.", "title: HR\nstatus: draft\nvisibility: [public, internal]"),
    });
    expect(flow.status, flow.output).toBe(1);
    expect(flow.output, "checker output").toContain("visibility is one value, not a list");
  });

  it("refuses a link to a more restricted document — the leak no single build can catch", () => {
    const leak = probe({
      "instance.md": instance(MODEL),
      "knowledge/handbook.md": doc(
        "See [the bands](./bands.md).",
        "title: Handbook\nstatus: draft",
      ),
      "knowledge/bands.md": doc("Body.", "title: Bands\nstatus: draft\nvisibility: restricted"),
    });
    expect(leak.status, leak.output).toBe(1);
    expect(leak.output, "checker output").toContain(
      "link to a more restricted document: ./bands.md — knowledge/bands.md is restricted, this document is public",
    );
    expect(leak.output, "the linking document is named").toContain("knowledge/handbook.md");

    // Down the tiers is fine: a restricted document may link to a public one.
    const downward = probe({
      "instance.md": instance(MODEL),
      "knowledge/handbook.md": doc("Body.", "title: Handbook\nstatus: draft"),
      "knowledge/bands.md": doc(
        "See [the handbook](./handbook.md).",
        "title: Bands\nstatus: draft\nvisibility: restricted",
      ),
    });
    expect(downward.status, downward.output).toBe(0);
  });

  it("sees the cross-audience link through reference and angle-bracket forms", () => {
    const result = probe({
      "instance.md": instance(MODEL),
      "knowledge/ref.md": doc(
        "See [the bands][b].\n\n[b]: ./bands.md",
        "title: Ref\nstatus: draft",
      ),
      "knowledge/angle.md": doc("See [the bands](<./bands.md>).", "title: Angle\nstatus: draft"),
      "knowledge/bands.md": doc("Body.", "title: Bands\nstatus: draft\nvisibility: internal"),
    });
    expect(result.status, result.output).toBe(1);
    const hits = result.output.match(/link to a more restricted document/g) ?? [];
    expect(hits.length, result.output).toBe(2);
    expect(result.output, "checker output").toContain("knowledge/ref.md");
    expect(result.output, "checker output").toContain("knowledge/angle.md");
  });

  it("refuses a superseded_by that strands readers in a more restricted tier", () => {
    const stranded = probe({
      "instance.md": instance(MODEL),
      "knowledge/old.md": doc(
        "Replaced.",
        "title: Old\nstatus: superseded\nsuperseded_by: ./bands.md",
      ),
      "knowledge/bands.md": doc("Body.", "title: Bands\nstatus: draft\nvisibility: internal"),
    });
    expect(stranded.status, stranded.output).toBe(1);
    expect(stranded.output, "checker output").toContain(
      "superseded_by points at a more restricted document: ./bands.md — knowledge/bands.md is internal, this document is public",
    );

    const reachable = probe({
      "instance.md": instance(MODEL),
      "knowledge/old.md": doc(
        "Replaced.",
        "title: Old\nstatus: superseded\nvisibility: internal\nsuperseded_by: ./bands.md",
      ),
      "knowledge/bands.md": doc("Body.", "title: Bands\nstatus: draft\nvisibility: internal"),
    });
    expect(reachable.status, reachable.output).toBe(0);
  });

  it("passes a complete audience model: mixed visibility, links down the tiers", () => {
    const result = probe({
      "instance.md": instance(MODEL),
      "knowledge/handbook.md": doc(
        "The public handbook.",
        "title: Handbook\nstatus: approved\nvisibility: public",
      ),
      "knowledge/onboarding.md": doc(
        "See [the handbook](./handbook.md).",
        "title: Onboarding\nstatus: draft\nvisibility: internal",
      ),
      "knowledge/bands.md": doc(
        "See [onboarding](./onboarding.md) and [the handbook](./handbook.md).",
        "title: Bands\nstatus: draft\nvisibility: restricted",
      ),
      "knowledge/notes.md": doc(
        "Takes the default. See [the handbook](./handbook.md).",
        "title: Notes\nstatus: draft",
      ),
    });
    expect(result.status, result.output).toBe(0);
  });

  it("stays inert while instance.md declares no audiences — the additive guarantee", () => {
    // The same shape that fires under a model: with none declared, nothing to enforce.
    const result = probe({
      "knowledge/handbook.md": doc(
        "See [the bands](./bands.md).",
        "title: Handbook\nstatus: draft",
      ),
      "knowledge/bands.md": doc(
        "Replaced.",
        "title: Bands\nstatus: superseded\nsuperseded_by: ./handbook.md",
      ),
    });
    expect(result.status, result.output).toBe(0);
  });

  it("leaves the scaffold as it found it", () => {
    const result = runChecker();
    expect(result.status, result.output).toBe(0);
  });
});
