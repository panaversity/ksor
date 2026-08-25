#!/usr/bin/env node
// PRODUCT-DOCS integrity checks — identity, lifecycle and internal links for
// the markdown shipped inside the npm package. Like the guard, every failure
// states what is wrong, why the rule exists, and how to fix it.
//
// It does NOT check a governed record. It used to, and it carried a second
// implementation of the record's rules to do it — `owner`/`provenance`
// required, a `draft | review | approved | superseded` status set — which the
// KSoR Profile retired. That rule set survived behind a `--corpus <dir>` flag
// after the repo's own record stopped being checked with it, so running the
// flag against this repository's OWN migrated record told the author that
// `status: stable` was invalid and that two retired keys were mandatory. This
// release exists to end two implementations of one decision; that was a second
// one wired to a CLI flag, and it is deleted rather than left loaded.
//
// The record checker is the one rule set for a record: `ksor build` and the
// emitted `check.mjs` run it, and this repository's fixture corpus is checked
// through the real verb in packages/ksor/src/migrate.integration.test.ts.
//
// Usage:
//   node scripts/check-corpus.mjs   # check the product docs shipped in the package

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "./lib/frontmatter.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Product documentation needs identity (title) and lifecycle (status). */
const REQUIRED_KEYS = ["title", "status"];
/**
 * The PRODUCT DOCS' lifecycle, which is not the record's. A record's statuses
 * are `draft | stable | deprecated` and are the record checker's to enforce;
 * these describe a page of the manual on its way to being written.
 */
const DOC_STATUS_VALUES = new Set(["draft", "review", "approved", "superseded"]);
// Identity derives from the file path (AGENTS.md product principle 3): an
// authored id/name that disagrees with the path gives one document two
// identities, so these keys are rejected outright.
const FORBIDDEN_KEYS = new Set(["id", "name"]);

const problems = [];

function problem(file, message, why, fix) {
  problems.push(`${file}\n    problem: ${message}\n    why: ${why}\n    fix: ${fix}`);
}

function walkMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(p);
    return entry.name.endsWith(".md") ? [p] : [];
  });
}

function checkFrontmatter(file, rel) {
  const fm = parseFrontmatter(readFileSync(file, "utf8"));
  if (fm === null) {
    problem(
      rel,
      "no frontmatter block",
      "corpus documents carry their identity and lifecycle in frontmatter; without it the document is ungoverned",
      `start the file with ---\\ntitle: ...\\nstatus: draft\\n--- (required keys: ${REQUIRED_KEYS.join(", ")})`,
    );
    return;
  }
  const missing = REQUIRED_KEYS.filter((k) => !(k in fm));
  if (missing.length > 0) {
    problem(
      rel,
      `missing frontmatter key(s): ${missing.join(", ")}`,
      "documents need identity (title) and lifecycle (status) to be reviewable",
      `add the missing key(s) to the frontmatter`,
    );
  }
  for (const key of Object.keys(fm).filter((k) => FORBIDDEN_KEYS.has(k))) {
    problem(
      rel,
      `authored "${key}:" frontmatter key`,
      "identity derives from the file path — an authored id/name gives one document two identities",
      `remove the "${key}:" key; the document's path is its identity, its route, and its resource URI`,
    );
  }
  if ("status" in fm) {
    const status = fm["status"];
    if (status === "") {
      problem(
        rel,
        "status key has no value",
        "an empty lifecycle state cannot be queried or gated on",
        `set status to one of ${[...DOC_STATUS_VALUES].join(" | ")}`,
      );
    } else if (!DOC_STATUS_VALUES.has(status)) {
      problem(
        rel,
        `status "${status}" is not one of ${[...DOC_STATUS_VALUES].join(" | ")}`,
        "the governance lifecycle is a closed set; free-form states cannot be queried or gated on",
        "pick the closest lifecycle state",
      );
    }
  }
}

function checkRelativeLinks(file, rel) {
  // Code fences and inline code spans SHOW syntax rather than linking, so they
  // are stripped before scanning.
  const text = readFileSync(file, "utf8")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  // The optional quoted part accepts link titles: [a](./x.md "see also").
  for (const match of text.matchAll(/\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*"|\s+'[^']*')?\s*\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target.split("#")[0]);
    if (!existsSync(resolved)) {
      problem(
        rel,
        `dead relative link: ${target}`,
        "a corpus with dead internal links serves different truths depending on the path a reader takes",
        "fix the path or remove the link",
      );
    }
  }
}

// Silence would be the wrong answer to `--corpus`: an operator who runs the
// flag they were told about deserves to be told where the rules went.
const args = process.argv.slice(2);
if (args.length > 0) {
  console.error(
    `check-corpus: unknown argument ${JSON.stringify(args[0])}\n` +
      "    why: this script checks the product docs shipped in the npm package and takes no arguments.\n" +
      "         `--corpus <dir>` checked a governed record with the PRE-PROFILE rule set — `owner` and\n" +
      "         `provenance` required, a draft|review|approved|superseded status set — which the KSoR\n" +
      "         Profile retired; it is gone rather than left loaded and contradicting the record spec.\n" +
      "    fix: check a record with `ksor build`, or with the emitted\n" +
      "         .agents/skills/format-checker/check.mjs — one rule set, run by every surface",
  );
  process.exit(1);
}

const productDocs = path.join(repoRoot, "packages", "ksor", "docs");
if (existsSync(productDocs)) {
  for (const file of walkMarkdown(productDocs)) {
    const rel = path.relative(repoRoot, file);
    checkFrontmatter(file, rel);
    checkRelativeLinks(file, rel);
  }
}

if (problems.length > 0) {
  console.error(`check-corpus: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log("check-corpus: ok");
