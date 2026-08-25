/**
 * Staging on the profile — build spec §3, run against the SHIPPED
 * `system/site/lib/stage-knowledge.ts` in a temporary record, with no Next
 * install: the module runs under Node's type stripping the way
 * `stage-concurrency` runs it, and every assertion reads the stage it wrote.
 *
 * The record here is a conformant fixture of its own (the scaffold's starter is
 * being rewritten in parallel), with one document per state the §2.5 table
 * names, an `[internal]` canary, a folder that only an internal viewer may see,
 * a companion, an asset, and a ledger with a denial, a revocation and a subtree.
 */

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ledgerDigests, parseLedger } from "@panaversity/ksor-content/record";

const SITE = fileURLToPath(new URL("../templates/scaffold/system/site/", import.meta.url));
const KSOR_NODE_MODULES = fileURLToPath(new URL("../node_modules/", import.meta.url));

/** Node strips types but resolves neither `./x` nor `./x.js` to `x.ts`. */
const RELATIVE_IMPORT = /(from ")(\.{1,2}\/[A-Za-z0-9._/-]+?)(\.js)?(")/g;

const HARNESS = `
import { readFileSync } from "node:fs";
import path from "node:path";
try {
  const { knowledgeSourceDir } = await import("./lib/stage-knowledge.ts");
  const dir = path.resolve(knowledgeSourceDir());
  const manifest = JSON.parse(readFileSync(path.resolve(".staged-knowledge.json"), "utf8"));
  console.log(JSON.stringify({ dir, manifest }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
`;

const STABLE = (
  title: string,
  description: string,
  audience: string,
  extra = "",
  order = "",
): string =>
  `---
type: Document
title: ${title}
description: ${description}
status: stable
${order === "" ? "" : `order: ${order}\n`}generated: { by: "ksor-test/1.0", at: 2026-08-01T00:00:00Z }
${extra}ksor:
  audience: [${audience}]
  approval: { by: "human:kim", at: 2026-08-02T00:00:00Z }
---

Body of ${title}.
`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A second 1x1 PNG — valid, and different bytes. The staleness assertion below
 * needs an asset that CHANGED and is otherwise unimpeachable: the record's own
 * checker runs before the lock's file-by-file comparison, so garbage bytes are
 * refused as `ksor-asset-corrupt` (the better diagnosis, and not the one that
 * test is about) and never reach it.
 */
const PNG_EDITED = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);

const AS_OF = "2026-08-25T12:00:00Z";

/** What the record loader skips (`packages/content/src/record/load.ts`). */
const OS_JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

interface Fixture {
  readonly root: string;
  readonly site: string;
  readonly stage: string;
}

function writeRecord(root: string): Fixture {
  const site = path.join(root, "system", "site");
  const knowledge = path.join(root, "knowledge");
  mkdirSync(path.join(root, ".ksor"), { recursive: true });
  mkdirSync(path.join(knowledge, "guides"), { recursive: true });
  mkdirSync(path.join(knowledge, "secret"), { recursive: true });
  mkdirSync(path.join(knowledge, "archive"), { recursive: true });
  mkdirSync(path.join(knowledge, "empty"), { recursive: true });

  writeFileSync(
    path.join(root, "instance.md"),
    `---
format: 2
name: acme
title: Acme Handbook
description: Authoritative for how Acme runs internally.
toolchain: { requires: ">=0.1.0", scaffolded: "0.1.0" }
---

You are answering from the Acme Handbook. Cite every passage.
`,
  );
  writeFileSync(
    path.join(root, ".ksor", "governance.yaml"),
    `version: "0.1"
audiences:
  internal:
    description: Employees
approval_authorities:
  - actors: [human:kim]
takedown_authorities:
  actors: [human:ciso]
`,
  );
  writeFileSync(
    path.join(root, ".ksor", "takedowns.yaml"),
    `- id: 2026-08-20T10:00:00Z-aaaaaa
  stable_id: knowledge/denied
  scope: node
  expected: present
  by: human:ciso
  at: 2026-08-20T10:00:00Z
- id: 2026-08-20T11:00:00Z-bbbbbb
  stable_id: knowledge/revoked
  scope: node
  expected: present
  by: human:ciso
  at: 2026-08-20T11:00:00Z
- id: 2026-08-21T11:00:00Z-cccccc
  revokes: 2026-08-20T11:00:00Z-bbbbbb
  by: human:ciso
  at: 2026-08-21T11:00:00Z
- id: 2026-08-22T11:00:00Z-dddddd
  stable_id: knowledge/archive#section
  scope: subtree
  expected: present
  by: human:ciso
  at: 2026-08-22T11:00:00Z
`,
  );

  const w = (rel: string, text: string | Buffer): void =>
    writeFileSync(path.join(knowledge, rel), text);
  w(
    "public-policy.md",
    STABLE("Public policy PUBTITLE1", "PUBDESC1 in one line", "public", "", "1"),
  );
  // A summary that references an asset the PARENT's body never mentions. The
  // checker validates a companion's links (record/check.ts), so this image is
  // in the lock and inside `build_id` — and the stage used to scan the concept's
  // body only, so the byte never arrived and the export died on it.
  w(
    "public-policy.summary.md",
    "---\ntype: Summary\n---\n\nSUMMARYBODY1\n\n![s](./sumchart.png)\n",
  );
  w("sumchart.png", PNG);
  w(
    "internal-note.md",
    STABLE("Internal note CANARYTITLE", "CANARYDESC internal only", "internal", "", "2"),
  );
  w(
    "draft-doc.md",
    `---
type: Document
title: Draft DRAFTTITLE
description: DRAFTDESC still being written
status: draft
ksor:
  audience: [public]
---

DRAFTBODY
`,
  );
  w(
    "old-policy.md",
    `---
type: Document
title: Old policy OLDTITLE
description: OLDDESC replaced
status: deprecated
generated: { by: "ksor-test/1.0", at: 2026-08-01T00:00:00Z }
ksor:
  audience: [public]
  superseded_by: public-policy
  deprecated: { by: "human:ciso", at: 2026-08-10T00:00:00Z }
---

OLDBODY
`,
  );
  w(
    "future.md",
    STABLE("Future FUTURETITLE", "FUTUREDESC", "public", "", "").replace(
      "ksor:\n",
      "ksor:\n  effective_from: 2030-01-01T00:00:00Z\n",
    ),
  );
  w(
    "stale.md",
    STABLE("Stale STALETITLE", "STALEDESC", "public", "stale_after: 2020-01-01T00:00:00Z\n"),
  );
  w("denied.md", STABLE("Denied DENIEDTITLE", "DENIEDDESC", "public"));
  w("revoked.md", STABLE("Revoked REVOKEDTITLE", "REVOKEDDESC", "public"));
  w(
    "guides/getting-started.md",
    STABLE("Getting started GUIDETITLE", "GUIDEDESC", "public", "", "1").replace(
      "Body of",
      "![diagram](./diagram.png)\n\nBody of",
    ),
  );
  w("guides/diagram.png", PNG);
  w("guides/unused.png", PNG);
  w("secret/plan.md", STABLE("Plan SECRETPLAN", "SECRETDESC", "internal"));
  w("archive/gone.md", STABLE("Gone ARCHIVETITLE", "ARCHIVEDESC", "public"));

  // The shipped site lib, extensions made explicit for Node; the record module
  // beside it; the two runtime deps it needs linked from this package.
  const copy = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isDirectory()) copy(source, target);
      else {
        const text = readFileSync(source, "utf8");
        writeFileSync(target, text.replace(RELATIVE_IMPORT, "$1$2.ts$4"));
      }
    }
  };
  copy(path.join(SITE, "lib"), path.join(site, "lib"));
  copy(path.join(SITE, "record"), path.join(site, "record"));
  writeFileSync(
    path.join(site, "lib", "rules-version.ts"),
    'export const RULES_VERSION: string = "0.1.0";\n',
  );
  mkdirSync(path.join(site, "node_modules"), { recursive: true });
  for (const dep of ["yaml", "zod"]) {
    symlinkSync(path.join(KSOR_NODE_MODULES, dep), path.join(site, "node_modules", dep), "dir");
  }
  writeFileSync(path.join(site, "stage.mjs"), HARNESS);
  return { root, site, stage: path.join(site, ".staged-knowledge") };
}

/** The lock `ksor build` writes (build spec §2), reduced to what the site reads. */
function writeLock(
  root: string,
  options: { asOf?: string; drafts?: "hidden" | "shown"; ksorVersion?: string } = {},
): void {
  // The three control files are hashed the way `composeLock` hashes them: over
  // the text `loadRecord` read, and the empty string for a ledger that is not
  // there. They are part of the lock's freshness claim, not commentary on it.
  const controlText = (rel: string): string | null =>
    existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), "utf8") : null;
  const ledgerText = controlText(".ksor/takedowns.yaml");
  const parsedLedger = parseLedger(ledgerText, ".ksor/takedowns.yaml");
  const ledgerEntries = parsedLedger.ok ? ledgerDigests(parsedLedger.ledger) : [];
  const knowledge = path.join(root, "knowledge");
  const documents: { path: string; sha256: string }[] = [];
  const companions: { path: string; sha256: string }[] = [];
  const assets: { path: string; sha256: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`;
      // What `ksor build` would have written: the record loader skips OS junk
      // and never reads a symlink as bytes, so a lock containing either is a
      // state no real build can produce — and a fabricated lock like that made
      // the symlink case below reach the checker for the wrong reason.
      if (entry.isSymbolicLink() || OS_JUNK.has(entry.name)) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}/`);
      else if (/\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/.test(entry.name)) {
        companions.push({ path: rel, sha256: sha(path.join(dir, entry.name)) });
      } else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
        documents.push({ path: rel, sha256: sha(path.join(dir, entry.name)) });
      } else if (!entry.name.endsWith(".md")) {
        assets.push({ path: rel, sha256: sha(path.join(dir, entry.name)) });
      }
    }
  };
  walk(knowledge, "");
  writeFileSync(
    path.join(root, "build.lock.json"),
    JSON.stringify(
      {
        format: 1,
        build_id: "sha256:0123456789abcdef",
        ksor_version: options.ksorVersion ?? "0.1.0",
        okf: { version: "0.2", commit: "ad30107c", spec_sha256: "26aa5da0" },
        source_commit: "abc1234",
        dirty: false,
        as_of: options.asOf ?? AS_OF,
        drafts: options.drafts ?? "hidden",
        instance_sha256: sha256Text(controlText("instance.md") ?? ""),
        policy_sha256: sha256Text(controlText(".ksor/governance.yaml") ?? ""),
        ledger_sha256: sha256Text(ledgerText ?? ""),
        ledger_entries: ledgerEntries,
        audiences: { registry: ["internal"], viewers: { public: ["public"] } },
        documents,
        companions,
        assets,
      },
      null,
      2,
    ),
  );
}

function sha(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

interface Staged {
  readonly status: number | null;
  readonly stderr: string;
  readonly dir: string;
  readonly manifest: Record<string, unknown> & {
    readonly pages: Record<string, Record<string, unknown>>;
    readonly stamps: Record<string, unknown>;
  };
}

/**
 * A whole evaluation of this fixture stages in milliseconds, so anything near
 * this is a child that will never return — and `spawnSync` waits forever by
 * default, which is how one hung evaluation became a silent 15-minute CI
 * timeout with no file named (Integration tests, 2026-08-25). A named failure
 * is worth more than a job that dies with nothing to read.
 */
const EVALUATION_TIMEOUT_MS = 60_000;

function stage(fixture: Fixture, env: Record<string, string> = {}): Staged {
  const clean = { ...process.env };
  delete clean["NODE_ENV"];
  delete clean["KSOR_AUDIENCE"];
  delete clean["KSOR_DRAFTS"];
  const result = spawnSync(process.execPath, ["stage.mjs"], {
    cwd: fixture.site,
    encoding: "utf8",
    env: { ...clean, NODE_ENV: "production", ...env },
    timeout: EVALUATION_TIMEOUT_MS,
  });
  // A killed child reports `null` and carries the reason in `error`; without
  // this the assertion downstream says only "expected null to be 0".
  const timedOut =
    result.status === null
      ? `\nthe evaluation did not exit within ${EVALUATION_TIMEOUT_MS}ms and was killed (${String(result.error ?? result.signal ?? "no reason given")})`
      : "";
  const line = (result.stdout ?? "").trim().split("\n").pop() ?? "";
  const parsed = result.status === 0 ? JSON.parse(line) : { dir: "", manifest: { pages: {} } };
  return { status: result.status, stderr: `${result.stderr ?? ""}${timedOut}`, ...parsed };
}

function walkFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walkFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    )
    .sort();
}

function bytesOf(dir: string): Buffer {
  return Buffer.concat(
    walkFiles(dir).map((f) => Buffer.concat([Buffer.from(f), readFileSync(path.join(dir, f))])),
  );
}

describe("staging on the profile (build spec §3)", () => {
  let work: string;
  let fixture: Fixture;

  beforeAll(() => {
    work = realpathSync(mkdtempSync(path.join(tmpdir(), "ksor-site-stage-")));
    fixture = writeRecord(path.join(work, "record"));
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("refuses without a lock outside development — ksor-lock-missing", () => {
    const r = stage(fixture);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-missing/);
    expect(r.stderr).toMatch(/ksor build/);
    expect(existsSync(fixture.stage), "a refused build left a stage").toBe(false);
  });

  it("[public] with a fresh lock: admits by the §2.5 table, regenerates every index, leaks nothing", () => {
    writeLock(fixture.root);
    const r = stage(fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(r.dir).toBe(fixture.stage);

    const files = walkFiles(fixture.stage);
    expect(files).toEqual([
      "future.md",
      "guides/diagram.png",
      "guides/getting-started.md",
      "guides/index.md",
      "index.md",
      "old-policy.md",
      "public-policy.md",
      "public-policy.summary.md",
      "revoked.md",
      "stale.md",
      "sumchart.png",
    ]);

    // Acceptance 3: no byte of the internal concept's title, path or
    // description anywhere in the stage — indexes included.
    const all = bytesOf(fixture.stage).toString("latin1");
    for (const canary of ["CANARYTITLE", "CANARYDESC", "internal-note", "SECRETPLAN", "secret/"]) {
      expect(all, `${canary} reached the [public] stage`).not.toContain(canary);
    }
    for (const canary of ["DRAFTTITLE", "DENIEDTITLE", "ARCHIVETITLE", "archive/"]) {
      expect(all, `${canary} reached the build`).not.toContain(canary);
    }

    // The regenerated root index, in OKF §8 form, from the STAGED tree — never
    // the committed one (there is none). ONE bullet list: concepts and folders
    // by `order:` then name, so `guides/` lands BETWEEN two documents rather
    // than behind all of them; the internal-only folder gets no bullet.
    const root = readFileSync(path.join(fixture.stage, "index.md"), "utf8");
    expect(root).toBe(
      `---
okf_version: "0.2"
---

# Acme Handbook

* [Guides](guides/)
* [Public policy PUBTITLE1](public-policy.md) - PUBDESC1 in one line
* [Future FUTURETITLE](future.md) - FUTUREDESC
* [Old policy OLDTITLE](old-policy.md) - OLDDESC replaced
* [Revoked REVOKEDTITLE](revoked.md) - REVOKEDDESC
* [Stale STALETITLE](stale.md) - STALEDESC
`,
    );
    expect(readFileSync(path.join(fixture.stage, "guides", "index.md"), "utf8")).toBe(
      "# Guides\n\n* [Getting started GUIDETITLE](getting-started.md) - GUIDEDESC\n",
    );

    // The manifest: machine admission and the badge, per page, at the lock's as_of.
    const pages = r.manifest.pages;
    expect(pages["public-policy.md"]).toMatchObject({ machine: true, badge: null });
    expect(pages["future.md"]).toMatchObject({ machine: false, badge: "effective-from" });
    expect(pages["stale.md"]).toMatchObject({ machine: false, badge: "stale" });
    expect(pages["old-policy.md"]).toMatchObject({
      machine: false,
      badge: "deprecated",
      supersededBy: "public-policy",
    });
    expect(pages["revoked.md"]).toMatchObject({ machine: true });
    expect(Object.keys(pages).sort()).toEqual([
      "future.md",
      "guides/getting-started.md",
      "old-policy.md",
      "public-policy.md",
      "revoked.md",
      "stale.md",
    ]);
    expect(r.manifest.stamps).toEqual({
      build_id: "sha256:0123456789abcdef",
      source_commit: "abc1234",
      dirty: false,
      ksor_version: "0.1.0",
      unstamped: false,
    });
    expect(r.manifest["viewer"]).toEqual(["public"]);
    expect(r.manifest["asOf"]).toBe(AS_OF);
    expect(r.manifest["drafts"]).toBe("hidden");
    expect(r.manifest["title"]).toBe("Acme Handbook");
    expect(r.manifest["description"]).toBe("Authoritative for how Acme runs internally.");
  });

  it("the old denylist export is not read: a stray .ksor-denylist.json changes nothing", () => {
    writeFileSync(
      path.join(fixture.root, ".ksor-denylist.json"),
      JSON.stringify({
        format: 1,
        source: "database",
        denied: [{ stable_id: "knowledge/public-policy" }],
      }),
    );
    const r = stage(fixture);
    rmSync(path.join(fixture.root, ".ksor-denylist.json"));
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(fixture.stage, "public-policy.md"))).toBe(true);
  });

  it("a comma-list viewer including a registered audience admits its concepts and folder", () => {
    const r = stage(fixture, { KSOR_AUDIENCE: "public,internal" });
    expect(r.status, r.stderr).toBe(0);
    const files = walkFiles(fixture.stage);
    expect(files).toContain("internal-note.md");
    expect(files).toContain("secret/plan.md");
    expect(files).toContain("secret/index.md");
    const root = readFileSync(path.join(fixture.stage, "index.md"), "utf8");
    expect(root).toContain(
      "* [Internal note CANARYTITLE](internal-note.md) - CANARYDESC internal only",
    );
    expect(root).toContain("* [Secret](secret/)");
    expect(r.manifest["viewer"]).toEqual(["public", "internal"]);
    // Denials apply to every viewer.
    expect(files).not.toContain("denied.md");
    expect(files).not.toContain("archive/gone.md");
  });

  it("a viewer that omits public is refused — ksor-viewer-omits-public", () => {
    const r = stage(fixture, { KSOR_AUDIENCE: "internal" });
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-viewer-omits-public/);
    expect(existsSync(fixture.stage), "a refused build left the previous stage").toBe(false);
  });

  it("a viewer naming an unregistered audience is refused — ksor-viewer-unregistered", () => {
    const r = stage(fixture, { KSOR_AUDIENCE: "public, board" });
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-viewer-unregistered/);
    expect(r.stderr).toContain("board");
    expect(r.stderr).toContain("internal");
  });

  it("drafts: hidden on every build; KSOR_DRAFTS=show admits them to human surfaces only when the lock agrees", () => {
    const hidden = stage(fixture, { KSOR_DRAFTS: "show" });
    expect(hidden.status).not.toBe(0);
    expect(hidden.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(hidden.stderr).toContain("KSOR_DRAFTS=show");

    writeLock(fixture.root, { drafts: "shown" });
    const shown = stage(fixture, { KSOR_DRAFTS: "show" });
    expect(shown.status, shown.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).toContain("draft-doc.md");
    expect(shown.manifest.pages["draft-doc.md"]).toMatchObject({ machine: false, badge: "draft" });
    expect(shown.manifest["drafts"]).toBe("shown");
    writeLock(fixture.root);
  });

  it("moving as_of across an effectivity boundary moves the machine set", () => {
    writeLock(fixture.root, { asOf: "2031-01-01T00:00:00Z" });
    const r = stage(fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(r.manifest.pages["future.md"]).toMatchObject({ machine: true, badge: null });
    writeLock(fixture.root);
  });

  it("a stale lock is refused — ksor-lock-stale names the document", () => {
    const file = path.join(fixture.root, "knowledge", "public-policy.md");
    const before = readFileSync(file, "utf8");
    writeFileSync(file, before.replace("PUBDESC1 in one line", "PUBDESC1 edited"));
    const r = stage(fixture);
    writeFileSync(file, before);
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(r.stderr).toContain("public-policy.md");
    expect(existsSync(fixture.stage)).toBe(false);
  });

  it("a lock built by a newer ksor than the site's rules is refused — ksor-site-outdated", () => {
    writeLock(fixture.root, { ksorVersion: "0.2.0" });
    const r = stage(fixture);
    writeLock(fixture.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-site-outdated/);
    expect(r.stderr).toContain("0.2.0");
    expect(r.stderr).toContain("ksor migrate --write-site");
  });

  it("a checker refusal refuses the build by its slug, before anything is staged", () => {
    // `stale.md`: nothing points at it, so the one refusal is its own.
    const file = path.join(fixture.root, "knowledge", "stale.md");
    const before = readFileSync(file, "utf8");
    writeFileSync(file, before.replace("  audience: [public]\n", ""));
    writeLock(fixture.root);
    const r = stage(fixture);
    writeFileSync(file, before);
    writeLock(fixture.root);
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-audience-missing/);
    expect(r.stderr).toContain("knowledge/stale.md");
    expect(existsSync(fixture.stage)).toBe(false);
  });

  it("a record with nothing approved yet builds — the empty stage is not a refusal", () => {
    // The emitted starter is all drafts (research/okf-native.md §1.1) and build
    // spec §4 acceptance 4 requires it to BUILD: "a level-0 record with one
    // draft and a committed index builds out/ with no byte of the draft's
    // title". `ksor-audience-empty` is about a mis-scoped VIEWER, and a record
    // nobody has approved yet is a different state with a different remedy.
    const alt = writeRecord(path.join(work, "all-draft"));
    // The draft is the ONE document left: a record with no concept at all is a
    // different state again, and `ksor-record-empty` refuses it by name.
    for (const rel of walkFiles(path.join(alt.root, "knowledge"))) {
      if (rel !== "draft-doc.md") rmSync(path.join(alt.root, "knowledge", rel));
    }
    // Its denials name concepts that are gone, which is its own refusal.
    writeFileSync(path.join(alt.root, ".ksor", "takedowns.yaml"), "");
    writeLock(alt.root);

    const r = stage(alt);
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(alt.stage)).toEqual(["index.md"]);
    expect(readFileSync(path.join(alt.stage, "index.md"), "utf8")).not.toContain("DRAFTTITLE");
    expect(Object.keys(r.manifest.pages)).toEqual([]);
  });

  it("a viewer that admits no concept the record has is still refused — ksor-audience-empty", () => {
    // Same emptiness, the other cause: every concept is stable and in the
    // record, and this viewer's slice of it is empty. The message says which.
    const alt = writeRecord(path.join(work, "viewer-empty"));
    for (const rel of walkFiles(path.join(alt.root, "knowledge"))) {
      if (rel !== "internal-note.md") rmSync(path.join(alt.root, "knowledge", rel));
    }
    writeFileSync(path.join(alt.root, ".ksor", "takedowns.yaml"), "");
    writeLock(alt.root);

    const r = stage(alt);
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-audience-empty/);
    expect(r.stderr).toContain("KSOR_AUDIENCE");
    expect(existsSync(alt.stage), "a refused build left a stage").toBe(false);
  });

  /**
   * Errors are documentation (product principle 4). The lock's freshness claim
   * is a statement ABOUT a record, so asking whether it still holds for a tree
   * that is not a legal record answers the wrong question — and answers it in a
   * way the operator cannot act on: `.mdx` under `knowledge/` is refused BY
   * NAME (`ksor-file-type`, the bundle is CommonMark), so no `ksor build` can
   * ever have put it in the lock, and "the lock does not match the tree, run
   * ksor build again" names neither the rule nor the fix.
   */
  it("an .mdx in the record is diagnosed as ksor-file-type, not as a stale lock", () => {
    // The lock first, then the file — an adopter adds one after their last
    // `ksor build`, which is the only way this state exists at all.
    writeLock(fixture.root);
    const file = path.join(fixture.root, "knowledge", "notes.mdx");
    writeFileSync(file, "# Notes\n\n<Callout>Not CommonMark.</Callout>\n");
    const r = stage(fixture);
    rmSync(file);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-file-type: knowledge\/notes\.mdx/);
    expect(r.stderr).toContain("CommonMark");
    expect(
      r.stderr,
      "the operator was told to re-run the build that refuses this file",
    ).not.toContain("ksor-lock-stale");
    expect(existsSync(fixture.stage), "a refused build left a stage").toBe(false);
  });

  /**
   * The record watcher runs in development only, and it may never be the reason
   * a process refuses to exit — `spawnSync` waits for the child, so a watcher
   * that holds the event loop open is a build that never ends.
   *
   * This passes on macOS whatever the code does, because a recursive watch is
   * NATIVE there and `unref()` works. On Linux — every container, every CI
   * runner — Node substitutes a JS implementation whose `unref()` is a no-op,
   * so only `persistent: false` keeps this promise. Green here, and the thing
   * that goes red there: one CI job died at its 15-minute timeout on exactly
   * this (2026-08-25), with no file named.
   */
  it("a development evaluation exits on its own, watcher and all", () => {
    const before = Date.now();
    const r = stage(fixture, { NODE_ENV: "development" });
    expect(r.status, r.stderr).toBe(0);
    expect(
      Date.now() - before,
      "the evaluation took long enough to suggest the watcher held the process open",
    ).toBeLessThan(EVALUATION_TIMEOUT_MS / 2);
  });

  /**
   * A companion is staged with its parent or not at all — that is the whole of
   * decision 24's "it inherits its parent's tier and its parent's takedown",
   * obtained by POSITION rather than by a second rule.
   *
   * The asset probe was a second position. It resolves a link against the
   * FILESYSTEM, where a denied document's deck is an ordinary file, and the
   * link rules cannot stop it: they judge a companion by its parent's AUDIENCE
   * (`nonConceptWidens`), and a takedown is not an audience — so a public
   * document linking a taken-down document's deck admitted the deck, past a
   * ledger that had withdrawn it.
   */
  it("a taken-down document's companion is not staged by linking it from a published one", () => {
    const knowledge = path.join(fixture.root, "knowledge");
    const doc = path.join(knowledge, "public-policy.md");
    const before = readFileSync(doc, "utf8");
    writeFileSync(
      path.join(knowledge, "denied.flashcards.yaml"),
      "cards:\n  - front: DENIEDCARDFRONT\n    back: DENIEDCARDBACK\n",
    );
    writeFileSync(doc, before.replace("Body of", "[Cards](./denied.flashcards.yaml)\n\nBody of"));
    writeLock(fixture.root);
    const r = stage(fixture);
    writeFileSync(doc, before);
    rmSync(path.join(knowledge, "denied.flashcards.yaml"));
    writeLock(fixture.root);

    // The build is legal — the link widens nothing — so this is not a refusal;
    // it is what the stage may hold.
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).not.toContain("denied.flashcards.yaml");
    expect(
      bytesOf(fixture.stage).toString("latin1"),
      "a denied document's deck reached the stage through a link in a published one",
    ).not.toContain("DENIEDCARD");
  });

  it("development needs no lock: drafts admitted and marked, stamps null and unstamped", () => {
    rmSync(path.join(fixture.root, "build.lock.json"));
    const r = stage(fixture, { NODE_ENV: "development" });
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).toContain("draft-doc.md");
    expect(r.manifest.pages["draft-doc.md"]).toMatchObject({ machine: false, badge: "draft" });
    expect(r.manifest["drafts"]).toBe("shown");
    expect(r.manifest.stamps).toEqual({
      build_id: null,
      source_commit: null,
      dirty: false,
      ksor_version: null,
      unstamped: true,
    });
    // Lifecycle at now: the 2030 concept is still not effective.
    expect(r.manifest.pages["future.md"]).toMatchObject({ machine: false });
  });
});

/**
 * The lock's freshness claim has to cover the CONTROL files, not only the
 * documents. It did not, and the hole was the whole governance surface: with a
 * lock written and untouched, deleting a denial's four lines from
 * `.ksor/takedowns.yaml` staged the denied document, deleting the ledger
 * outright staged the denied document AND the subtree, and editing
 * `instance.md`'s title published a title nothing checked — all exit 0, no
 * slug. `readLock`'s own refusal text claims "the lock records the exact record
 * `ksor build` checked", which was false for the two files holding the
 * governance (reproduced 2026-08-25).
 */
describe("the lock's freshness claim covers the control files", () => {
  let work: string;
  let fixture: Fixture;

  beforeAll(() => {
    work = realpathSync(mkdtempSync(path.join(tmpdir(), "ksor-lock-control-")));
    fixture = writeRecord(path.join(work, "record"));
    writeLock(fixture.root);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  const restore = (rel: string, before: string): void =>
    writeFileSync(path.join(fixture.root, rel), before);

  it("a denial deleted from the ledger refuses ksor-lock-stale, naming the ledger", () => {
    const rel = ".ksor/takedowns.yaml";
    const before = readFileSync(path.join(fixture.root, rel), "utf8");
    writeFileSync(
      path.join(fixture.root, rel),
      before.replace(
        `- id: 2026-08-20T10:00:00Z-aaaaaa
  stable_id: knowledge/denied
  scope: node
  expected: present
  by: human:ciso
  at: 2026-08-20T10:00:00Z
`,
        "",
      ),
    );
    const r = stage(fixture);
    restore(rel, before);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(r.stderr).toContain(".ksor/takedowns.yaml");
    expect(existsSync(fixture.stage), "a refused build left a stage").toBe(false);
  });

  it("the whole ledger deleted refuses too, and never stages the denied documents", () => {
    const rel = ".ksor/takedowns.yaml";
    const before = readFileSync(path.join(fixture.root, rel), "utf8");
    rmSync(path.join(fixture.root, rel));
    const r = stage(fixture);
    restore(rel, before);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain(".ksor/takedowns.yaml");
    expect(existsSync(fixture.stage)).toBe(false);
  });

  it("an edited instance.md refuses, naming instance.md", () => {
    const rel = "instance.md";
    const before = readFileSync(path.join(fixture.root, rel), "utf8");
    writeFileSync(path.join(fixture.root, rel), before.replace("Acme Handbook", "TAMPERED TITLE"));
    const r = stage(fixture);
    restore(rel, before);
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(r.stderr).toContain("instance.md");
  });

  it("an edited governance policy refuses, naming the policy", () => {
    const rel = ".ksor/governance.yaml";
    const before = readFileSync(path.join(fixture.root, rel), "utf8");
    writeFileSync(path.join(fixture.root, rel), `${before}# a comment nobody checked\n`);
    const r = stage(fixture);
    restore(rel, before);
    expect(r.status).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(r.stderr).toContain(".ksor/governance.yaml");
  });

  it("a ledger entry RETARGETED in place refuses ksor-ledger-amended at the site build", () => {
    // Same id, same actor, a different `stable_id`: the id set is unchanged, so
    // only the entry digests the lock carries can see it.
    const rel = ".ksor/takedowns.yaml";
    const before = readFileSync(path.join(fixture.root, rel), "utf8");
    writeFileSync(
      path.join(fixture.root, rel),
      before.replace("stable_id: knowledge/denied", "stable_id: knowledge/revoked"),
    );
    // The lock is re-written so the FILE hash agrees; only the entry moved.
    const lockBefore = readFileSync(path.join(fixture.root, "build.lock.json"), "utf8");
    const lock = JSON.parse(lockBefore) as Record<string, unknown>;
    lock["ledger_sha256"] = sha256Text(readFileSync(path.join(fixture.root, rel), "utf8"));
    writeFileSync(path.join(fixture.root, "build.lock.json"), JSON.stringify(lock, null, 2));
    const r = stage(fixture);
    restore(rel, before);
    writeFileSync(path.join(fixture.root, "build.lock.json"), lockBefore);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain("ksor-ledger-amended");
    expect(r.stderr).toContain("2026-08-20T10:00:00Z-aaaaaa");
  });

  /**
   * The lock is hand-editable and travels in the SAME change as the ledger, so
   * it cannot prove on its own that an entry was never deleted — the reasoning
   * that gave the emitted checker a git-history baseline. The site is the
   * surface that publishes, and it had only the lock: recorded a denial,
   * committed it, deleted the entry, recomputed `ledger_sha256` and emptied
   * `ledger_entries`, and the denied document was staged again with exit 0.
   */
  it("a denial deleted from BOTH the ledger and the lock is caught by git history", () => {
    const repo = path.join(work, "history");
    const f = writeRecord(repo);
    const git = (...args: string[]): void => {
      const r = spawnSync("git", args, { cwd: f.root, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    };
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    git("add", "-A");
    git("commit", "-qm", "record with the denial in the ledger");

    const rel = ".ksor/takedowns.yaml";
    const ledger = readFileSync(path.join(f.root, rel), "utf8");
    writeFileSync(
      path.join(f.root, rel),
      ledger.replace(
        `- id: 2026-08-20T10:00:00Z-aaaaaa
  stable_id: knowledge/denied
  scope: node
  expected: present
  by: human:ciso
  at: 2026-08-20T10:00:00Z
`,
        "",
      ),
    );
    // The forgery: a lock that AGREES with the shrunken ledger.
    writeLock(f.root);
    const r = stage(f);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain("ksor-ledger-shrank");
    expect(r.stderr).toContain("2026-08-20T10:00:00Z-aaaaaa");
    expect(r.stderr).toContain("git history");
    expect(existsSync(f.stage)).toBe(false);
  });

  it("an as_of that is not an instant refuses instead of admitting everything", () => {
    // NaN made every date comparison false, which is fail-OPEN on both sides:
    // a policy effective in 2030 was published as current and carried no badge.
    for (const bad of ["not-a-date", "yesterday", "2026-08-25"]) {
      writeLock(fixture.root, { asOf: bad });
      const r = stage(fixture);
      expect(r.status, `as_of ${bad} was accepted`).not.toBe(0);
      expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
      expect(r.stderr).toContain("as_of");
    }
    writeLock(fixture.root);
  });

  it("a ksor_version the site cannot compare refuses instead of passing the outdated gate", () => {
    for (const bad of ["999", "next"]) {
      writeLock(fixture.root, { ksorVersion: bad });
      const r = stage(fixture);
      expect(r.status, `ksor_version ${bad} was accepted`).not.toBe(0);
      expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
      expect(r.stderr).toContain("ksor_version");
    }
    writeLock(fixture.root);
  });

  it("a lock built with drafts shown refuses a plain build — the switch must agree both ways", () => {
    // One accidental `KSOR_DRAFTS=show ksor build` committed would otherwise
    // publish every draft on every later production deploy, with no
    // environment signal and nothing red; noindex is a hint, not a control.
    writeLock(fixture.root, { drafts: "shown" });
    const r = stage(fixture);
    writeLock(fixture.root);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(r.stderr).toContain("KSOR_DRAFTS");
    expect(existsSync(fixture.stage)).toBe(false);
  });

  /**
   * `assetTarget` checked that the resolved LINK PATH stays under the record,
   * then followed the link with `statSync`/`readFileSync`, so a symlink inside
   * `knowledge/` published any file the build could read under the record's own
   * name (real run, 2026-08-25: `TOP-SECRET-OUTSIDE-THE-RECORD` staged as
   * `guides/leak.png`). The record loader refuses a symlink by name, so both
   * halves are asserted here: the refusal fires, and nothing is staged.
   */
  it("a symlinked asset is refused as ksor-symlink and never staged", () => {
    const outside = path.join(work, "OUTSIDE-SECRET.txt");
    writeFileSync(outside, "TOP-SECRET-OUTSIDE-THE-RECORD\n");
    const link = path.join(fixture.root, "knowledge", "guides", "leak.png");
    symlinkSync(outside, link);
    const doc = path.join(fixture.root, "knowledge", "guides", "getting-started.md");
    const before = readFileSync(doc, "utf8");
    writeFileSync(doc, `${before}\n![leak](./leak.png)\n`);
    writeLock(fixture.root);
    const r = stage(fixture);
    rmSync(link);
    writeFileSync(doc, before);
    writeLock(fixture.root);
    expect(r.status, r.stderr).not.toBe(0);
    // The stage used to re-walk the tree itself and see the link as an ordinary
    // asset, so the lock read stale before the checker ever ran and the operator
    // was handed `ksor-lock-stale` — a diagnosis naming the wrong problem and a
    // fix (`ksor build`) that could not apply. The record must refuse the LINK,
    // by name. (`ksor-link-dead` on the linking document prints first only
    // because refusals sort by path; both are the symlink, said twice.)
    expect(r.stderr).not.toContain("ksor-lock-stale");
    expect(r.stderr).toContain("ksor-symlink: knowledge/guides/leak.png");
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-[a-z-]+: knowledge\//);
    expect(existsSync(fixture.stage)).toBe(false);
  });

  /**
   * Finder writes `.DS_Store` the first time an adopter opens `knowledge/`.
   * The record loader skips it, so `ksor build` can never list it in the lock;
   * the stage re-walked the tree with no exclusions, saw a file the lock did
   * not have, and refused `ksor-lock-stale` — whose own fix line says to run
   * `ksor build`, which writes the identical lock. Every local `pnpm build` on
   * a mac was unbuildable and unfixable, and the scaffold's gitignore hides the
   * file from review.
   */
  it("an OS junk file in the record does not make the build unfixable", () => {
    const junk = path.join(fixture.root, "knowledge", ".DS_Store");
    writeFileSync(junk, Buffer.from([0x00, 0x00, 0x00, 0x01]));
    const r = stage(fixture);
    rmSync(junk);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(fixture.stage, ".DS_Store"))).toBe(false);
  });

  /**
   * Assets were absent from the lock entirely, so the bytes the site publishes
   * for every image were never compared against anything `ksor build` checked.
   * Real run: replacing `knowledge/guides/diagram.png` after the lock was
   * written → exit 0, tampered bytes staged and published. For a record whose
   * diagrams and PDFs carry the substance, "a projection only publishes what
   * was checked" stopped at the markdown.
   */
  it("an asset whose bytes changed since the lock refuses, naming it", () => {
    const file = path.join(fixture.root, "knowledge", "guides", "diagram.png");
    const before = readFileSync(file);
    writeFileSync(file, PNG_EDITED);
    const r = stage(fixture);
    writeFileSync(file, before);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-lock-stale/);
    expect(r.stderr).toContain("guides/diagram.png");
    expect(existsSync(fixture.stage)).toBe(false);
  });

  /**
   * The other half of the same ordering: bytes that are not a PNG at all are a
   * RECORD problem, and the record is judged by its own rules before the lock's
   * file-by-file claim is asked (see `assertLockCoversTree`). This one used to
   * be reported as a stale lock, whose fix — re-run `ksor build` — leads to
   * this refusal anyway, one step later and under the wrong name.
   */
  it("bytes that are not an image are refused as ksor-asset-corrupt, not as a stale lock", () => {
    const file = path.join(fixture.root, "knowledge", "guides", "diagram.png");
    const before = readFileSync(file);
    writeFileSync(file, Buffer.from("TAMPERED-ASSET-BYTES"));
    const r = stage(fixture);
    writeFileSync(file, before);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-asset-corrupt: knowledge\/guides\/diagram\.png/);
    expect(existsSync(fixture.stage)).toBe(false);
  });

  it("still builds when every control file is the one the lock recorded", () => {
    const r = stage(fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).not.toContain("denied.md");
  });
});

/**
 * A SIM is a page the record carries — `<name>.sim.html`, framed click-to-load
 * at the point in the prose its link sits at (`lib/embed-rule.ts`). It is an
 * ASSET, not a study attachment: named freely, many per document, and reaching
 * a reader only through a link in a document that survived every filter.
 *
 * Which makes its governance entirely inherited, and worth asserting rather
 * than assuming — a sim is the one asset that becomes a URL of its own, so a
 * copy that escapes the filter is not an unreferenced byte in the bundle, it is
 * a page anyone can open. The four states below are the ones that decide it.
 */
describe("a carried sim inherits its document's governance", () => {
  let work: string;
  let fixture: Fixture;
  let publicSims: string;

  /** Put `link` in this document's body, where an author would write it. */
  const linkFrom = (root: string, rel: string, target: string): void => {
    const file = path.join(root, "knowledge", rel);
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace("Body of", `[Play it](${target} "embed")\n\nBody of`),
    );
  };

  beforeAll(() => {
    work = realpathSync(mkdtempSync(path.join(tmpdir(), "ksor-site-sims-")));
    fixture = writeRecord(path.join(work, "record"));
    publicSims = path.join(fixture.site, "public", "sims");
    const knowledge = path.join(fixture.root, "knowledge");
    const sim = (rel: string, marker: string): void =>
      writeFileSync(path.join(knowledge, rel), `<!doctype html><title>${marker}</title>\n`);

    sim("pubsim.sim.html", "PUBSIMBODY");
    linkFrom(fixture.root, "public-policy.md", "pubsim.sim.html");
    sim("secret/plansim.sim.html", "SECRETSIMBODY");
    linkFrom(fixture.root, "secret/plan.md", "plansim.sim.html");
    sim("deniedsim.sim.html", "DENIEDSIMBODY");
    linkFrom(fixture.root, "denied.md", "deniedsim.sim.html");
    sim("archive/gonesim.sim.html", "ARCHIVESIMBODY");
    linkFrom(fixture.root, "archive/gone.md", "gonesim.sim.html");
    // Linked by nothing. The record has never refused an unreferenced asset,
    // so what has to be true is that it never reaches a url either.
    sim("orphan.sim.html", "ORPHANSIMBODY");
    writeLock(fixture.root);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("a public document's sim is staged and published where it can be served", () => {
    const r = stage(fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).toContain("pubsim.sim.html");
    // The record path is the identity, and `.sim.html` becomes `.html`.
    expect(readFileSync(path.join(publicSims, "pubsim.html"), "utf8")).toContain("PUBSIMBODY");
  });

  it("an internal document's sim reaches no public build, bytes or name", () => {
    const r = stage(fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).not.toContain("secret/plansim.sim.html");
    expect(existsSync(path.join(publicSims, "secret", "plansim.html"))).toBe(false);
    expect(bytesOf(publicSims).toString("utf8")).not.toContain("SECRETSIMBODY");
  });

  it("and the internal viewer, who may read the document, gets its sim", () => {
    const r = stage(fixture, { KSOR_AUDIENCE: "public,internal" });
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).toContain("secret/plansim.sim.html");
    expect(readFileSync(path.join(publicSims, "secret", "plansim.html"), "utf8")).toContain(
      "SECRETSIMBODY",
    );
  });

  it("a taken-down document's sim is denied with it — node and subtree alike", () => {
    // Widest possible viewer, so nothing here is explained by the audience
    // filter: a takedown beats every other consideration, for every viewer.
    const r = stage(fixture, { KSOR_AUDIENCE: "public,internal" });
    expect(r.status, r.stderr).toBe(0);
    const staged = walkFiles(fixture.stage);
    expect(staged).not.toContain("deniedsim.sim.html");
    expect(staged).not.toContain("archive/gonesim.sim.html");
    const published = bytesOf(publicSims).toString("utf8");
    expect(published, "a denied document's sim was published").not.toContain("DENIEDSIMBODY");
    expect(published, "a subtree denial's sim was published").not.toContain("ARCHIVESIMBODY");
  });

  /**
   * The order the cases above happen to run in is what makes them pass: the
   * public build comes FIRST, so `public/sims/` has never held the internal
   * sim when it is asserted absent. Reverse it — the documented sequence, since
   * `KSOR_AUDIENCE=public,internal pnpm build` beside a plain `pnpm build` is
   * how a record produces its two staged surfaces — and the internal sim is
   * still sitting there, at a live URL, in a directory `.gitignore` hides.
   *
   * `publishSims` copied and never pruned, and static export ships `public/`
   * verbatim, so the narrower build inherits every byte the wider one left.
   * Nothing else would have gone red: the STAGE is correct in both builds, and
   * every existing assertion reads the stage or a directory that happened to
   * be clean (2026-08-25 review, second BLOCKING finding).
   */
  it("a wider build's sim does not survive into the next narrower one", () => {
    const wide = stage(fixture, { KSOR_AUDIENCE: "public,internal" });
    expect(wide.status, wide.stderr).toBe(0);
    expect(
      existsSync(path.join(publicSims, "secret", "plansim.html")),
      "the two-audience build did not publish the internal sim, so this proves nothing",
    ).toBe(true);

    const narrow = stage(fixture);
    expect(narrow.status, narrow.stderr).toBe(0);
    expect(
      existsSync(path.join(publicSims, "secret", "plansim.html")),
      "the internal sim survived a public-only build and is served at /sims/secret/plansim.html",
    ).toBe(false);
    expect(bytesOf(publicSims).toString("utf8")).not.toContain("SECRETSIMBODY");
    // …and the public one is still there, so this prunes rather than empties.
    expect(readFileSync(path.join(publicSims, "pubsim.html"), "utf8")).toContain("PUBSIMBODY");
  });

  it("a sim no document links is never published, so it is never a url", () => {
    const r = stage(fixture, { KSOR_AUDIENCE: "public,internal" });
    expect(r.status, r.stderr).toBe(0);
    expect(walkFiles(fixture.stage)).not.toContain("orphan.sim.html");
    expect(existsSync(path.join(publicSims, "orphan.html"))).toBe(false);
  });
});

/**
 * The stage is a deterministic function of the record, the ledger and the
 * lock, so the SECOND evaluation of one build must find the stage it wants
 * already there and touch nothing (`stageHolds`). That check is not a saving:
 * a wipe-and-refill has a window in which the stage is not the record, and an
 * evaluation that has already returned is reading it — the shape that shorted
 * 27 of 48 measured runs and PUBLISHED the result.
 *
 * `stageHolds` compares a COUNT before it compares bytes, so one path emitted
 * twice makes it answer false forever: the plan holds n+1 entries, the disk
 * holds n, and every evaluation wipes and refills a stage that was already
 * correct. The count is invisible from outside the module; what it decides is
 * not, and that is what these assert.
 */
describe("the stage holds when nothing changed", () => {
  let work: string;
  let fixture: Fixture;

  /** Identity and last write of every staged file — what a rewrite moves. */
  const stamps = (dir: string): Record<string, string> =>
    Object.fromEntries(
      walkFiles(dir).map((rel) => {
        const s = statSync(path.join(dir, rel));
        return [rel, `ino ${s.ino} · mtime ${s.mtimeMs}`] as const;
      }),
    );

  beforeAll(() => {
    work = realpathSync(mkdtempSync(path.join(tmpdir(), "ksor-stage-holds-")));
    fixture = writeRecord(path.join(work, "record"));
    // A deck named after its document, linked from the document the way an
    // author would link it. Legal in the record — the checker resolves the
    // target to its parent concept and admits it — and staged by POSITION,
    // because its parent survived every filter. Probing the filesystem for
    // link targets then found it a SECOND time, as an asset.
    writeFileSync(
      path.join(fixture.root, "knowledge", "public-policy.flashcards.yaml"),
      "cards:\n  - front: What is the record?\n    back: The governed markdown.\n",
    );
    const doc = path.join(fixture.root, "knowledge", "public-policy.md");
    writeFileSync(
      doc,
      readFileSync(doc, "utf8").replace(
        "Body of",
        "[Cards](./public-policy.flashcards.yaml)\n\nBody of",
      ),
    );
    writeLock(fixture.root);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("a companion the document links is staged once, and the second evaluation rewrites nothing", () => {
    const first = stage(fixture);
    expect(first.status, first.stderr).toBe(0);
    expect(walkFiles(fixture.stage).filter((f) => f.endsWith(".flashcards.yaml"))).toEqual([
      "public-policy.flashcards.yaml",
    ]);

    const before = stamps(fixture.stage);
    const second = stage(fixture);
    expect(second.status, second.stderr).toBe(0);
    expect(
      stamps(fixture.stage),
      "the stage was wiped and refilled though the record, the ledger and the lock all stood still",
    ).toEqual(before);
  });

  it("…and an edit still rewrites it, so the observation above can move", () => {
    const first = stage(fixture);
    expect(first.status, first.stderr).toBe(0);
    const before = stamps(fixture.stage);

    const doc = path.join(fixture.root, "knowledge", "public-policy.md");
    const original = readFileSync(doc, "utf8");
    writeFileSync(doc, original.replace("Body of", "EDITEDBODY\n\nBody of"));
    writeLock(fixture.root);
    const second = stage(fixture);
    writeFileSync(doc, original);
    writeLock(fixture.root);
    expect(second.status, second.stderr).toBe(0);
    expect(stamps(fixture.stage)).not.toEqual(before);
  });
});

/**
 * A build tool may not hang on a lock file, and this one did — twice, live:
 * `pnpm dev` repeating "waiting on .staged-knowledge.lock" on every request
 * with no build running, until the file was deleted by hand.
 *
 * The mechanism is not exotic. A holder killed mid-stage (Ctrl-C on `pnpm dev`,
 * a cancelled CI job, an OOM) never runs the `finally` that removes its lock,
 * so a lock outliving its holder is ordinary — and the waiter breaks one only
 * when the recorded pid is GONE. A pid that has since been recycled reads as
 * alive, and on Linux a recycled pid owned by another user reads as alive
 * through EPERM as well, so the waiter polls forever.
 *
 * Breaking the lock on a timeout is NOT the fix: `fillStage` removes the stage
 * and refills it IN PLACE, so a lock broken under a live holder hands the next
 * reader a half-written record — the 27-of-48 partial stage this file already
 * carries scar tissue for. So it refuses, and the refusal carries the evidence.
 */
describe("the stage lock refuses rather than waiting forever", () => {
  let work: string;
  let fixture: Fixture;
  let lockFile: string;

  beforeAll(() => {
    work = realpathSync(mkdtempSync(path.join(tmpdir(), "ksor-stage-lock-")));
    fixture = writeRecord(path.join(work, "record"));
    lockFile = `${fixture.stage}.lock`;
    writeLock(fixture.root);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  /** A lock held by a process that is certainly alive, taken `agoMs` ago. */
  const holdLock = (pid: number, agoMs: number): void => {
    writeFileSync(lockFile, String(pid));
    const when = new Date(Date.now() - agoMs);
    utimesSync(lockFile, when, when);
  };

  it("a lock held past the give-up point refuses ksor-stage-locked with its evidence", () => {
    // THIS test runner's pid: alive beyond argument, so `lockIsAbandoned`
    // cannot break the lock — which is exactly the state that used to spin.
    holdLock(process.pid, 10 * 60_000);
    const r = stage(fixture);
    rmSync(lockFile, { force: true });
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr.split("\n")[0]).toMatch(/^ksor-stage-locked/);
    // The three things an operator needs: which file, which pid, and what the
    // tool actually knows about that pid — never a guess dressed as a fact.
    expect(r.stderr).toContain(".staged-knowledge.lock");
    expect(r.stderr).toContain(String(process.pid));
    expect(r.stderr).toMatch(/alive/);
    expect(r.stderr).toContain("delete");
    // A refusal may not leave a stage behind, like every other refusal here.
    expect(existsSync(fixture.stage), "a refused build left a stage").toBe(false);
  });

  it("a lock with no pid in it is broken, not waited on", () => {
    // The one write that can be interrupted: `wx` creates the file and records
    // the pid in one call, so a blank lock is a holder that died inside it.
    holdLock(NaN, 0);
    writeFileSync(lockFile, "");
    const r = stage(fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(lockFile), "the broken lock was not released").toBe(false);
  });

  it("…and a lock a live holder took a moment ago is still waited on, then honoured", async () => {
    // The case the lock exists FOR. Held for a beat by a live process, then
    // released: the waiter must sit through it and go on to stage, not refuse.
    holdLock(process.pid, 0);
    const child = spawn(process.execPath, ["stage.mjs"], {
      cwd: fixture.site,
      env: { ...process.env, NODE_ENV: "production" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(existsSync(lockFile), "the waiter broke a lock a live holder still held").toBe(true);
    rmSync(lockFile, { force: true });
    expect(await exited, stderr).toBe(0);
    expect(walkFiles(fixture.stage)).toContain("public-policy.md");
  });
});
