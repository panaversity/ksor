#!/usr/bin/env node
// Corpus integrity checks — the product's own guarantees applied to the
// markdown this repo carries. Like the guard, every failure states what is
// wrong, why the rule exists, and how to fix it.
//
// Usage:
//   node scripts/check-corpus.mjs                 # check the repo's corpus roots
//   node scripts/check-corpus.mjs --corpus <dir>  # check one knowledge corpus (used by tests)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Frontmatter requirements per corpus profile.
// "knowledge": governed corpus documents — provenance is mandatory because an
// answer that cannot be traced to a source is not governed knowledge.
// "docs": product documentation — needs identity and lifecycle, not provenance.
const PROFILES = {
  knowledge: { required: ["title", "status", "owner", "provenance"] },
  docs: { required: ["title", "status"] },
};
const STATUS_VALUES = new Set(["draft", "review", "approved", "superseded"]);
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

function frontmatterBlock(rawText) {
  // Normalize CRLF first: a Windows-authored document has valid frontmatter,
  // and "no frontmatter block" would be a lying diagnosis.
  const text = rawText.replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  return match ? match[1] : null;
}

function checkFrontmatter(file, rel, profile) {
  const text = readFileSync(file, "utf8");
  const block = frontmatterBlock(text);
  if (block === null) {
    problem(
      rel,
      "no frontmatter block",
      "corpus documents carry their identity and lifecycle in frontmatter; without it the document is ungoverned",
      `start the file with ---\\ntitle: ...\\nstatus: draft\\n--- (required keys: ${PROFILES[profile].required.join(", ")})`,
    );
    return;
  }
  const keys = new Set(
    block
      .split("\n")
      .map((line) => /^([A-Za-z_][\w-]*):/.exec(line)?.[1])
      .filter(Boolean),
  );
  const missing = PROFILES[profile].required.filter((k) => !keys.has(k));
  if (missing.length > 0) {
    problem(
      rel,
      `missing frontmatter key(s): ${missing.join(", ")}`,
      profile === "knowledge"
        ? "governed knowledge must name its owner and its sources — an untraceable answer is not governed"
        : "documents need identity (title) and lifecycle (status) to be reviewable",
      `add the missing key(s) to the frontmatter`,
    );
  }
  for (const key of [...keys].filter((k) => FORBIDDEN_KEYS.has(k))) {
    problem(
      rel,
      `authored "${key}:" frontmatter key`,
      "identity derives from the file path — an authored id/name gives one document two identities",
      `remove the "${key}:" key; the document's path is its identity, its route, and its resource URI`,
    );
  }
  // [ \t]* only — \s* would cross the newline and read the next line's key as
  // the status value.
  const statusLine = /^status:[ \t]*(.*)$/m.exec(block);
  if (statusLine !== null) {
    const status = statusLine[1].trim();
    if (status === "") {
      problem(
        rel,
        "status key has no value",
        "an empty lifecycle state cannot be queried or gated on",
        `set status to one of ${[...STATUS_VALUES].join(" | ")}`,
      );
    } else if (!STATUS_VALUES.has(status)) {
      problem(
        rel,
        `status "${status}" is not one of ${[...STATUS_VALUES].join(" | ")}`,
        "the governance lifecycle is a closed set; free-form states cannot be queried or gated on",
        "pick the closest lifecycle state",
      );
    }
  }
}

function checkRelativeLinks(file, rel) {
  const text = readFileSync(file, "utf8");
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

function checkKnowledgeCorpus(corpusRoot, label) {
  if (!existsSync(path.join(corpusRoot, "instance.md"))) {
    problem(
      `${label}/instance.md`,
      "missing instance.md",
      "instance.md declares the identity and purpose of a KSoR instance; a corpus without one is anonymous",
      "create instance.md describing what this corpus is authoritative for",
    );
  }
  const knowledgeDir = path.join(corpusRoot, "knowledge");
  if (existsSync(knowledgeDir)) {
    for (const file of walkMarkdown(knowledgeDir)) {
      const rel = path.join(label, path.relative(corpusRoot, file));
      checkFrontmatter(file, rel, "knowledge");
      checkRelativeLinks(file, rel);
    }
  }
}

const corpusFlag = process.argv.indexOf("--corpus");
if (corpusFlag !== -1) {
  const dir = process.argv[corpusFlag + 1];
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error("check-corpus: --corpus requires an existing directory");
    process.exit(1);
  }
  checkKnowledgeCorpus(path.resolve(dir), path.basename(dir));
} else {
  checkKnowledgeCorpus(
    path.join(repoRoot, "workbench", "example-corpus"),
    "workbench/example-corpus",
  );
  const productDocs = path.join(repoRoot, "packages", "ksor", "docs");
  if (existsSync(productDocs)) {
    for (const file of walkMarkdown(productDocs)) {
      const rel = path.relative(repoRoot, file);
      checkFrontmatter(file, rel, "docs");
      checkRelativeLinks(file, rel);
    }
  }
}

if (problems.length > 0) {
  console.error(`check-corpus: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log("check-corpus: ok");
