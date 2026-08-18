#!/usr/bin/env node
// Mechanical repository invariants. Every rule prints WHY it exists and HOW to
// fix a violation, so a contributor (human or agent) can self-correct without
// waiting for a reviewer. Temporary exceptions live in
// guard-invariants-baseline.json; the baseline may only shrink — if an entry
// there stops matching a real violation, this guard fails until it is removed.

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "./lib/frontmatter.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const violations = [];

function violate(rule, key, message, why, fix) {
  violations.push({
    key: `${rule}:${key}`,
    text: `rule ${rule} — ${message}\n    why: ${why}\n    fix: ${fix}`,
  });
}

function isSymlinkTo(linkPath, expectedTarget) {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return false;
    return readlinkSync(linkPath) === expectedTarget;
  } catch {
    return false;
  }
}

// Rule 1 — CLAUDE.md must be a symlink pointing at AGENTS.md.
if (!isSymlinkTo(path.join(repoRoot, "CLAUDE.md"), "AGENTS.md")) {
  violate(
    1,
    "claude-md",
    "CLAUDE.md is not a symlink to AGENTS.md",
    "AGENTS.md is the single agent contract; per-tool files are projections of it, so they can never drift",
    "run: ln -sf AGENTS.md CLAUDE.md",
  );
}

// Rule 2 — .claude/skills/ and .agents/skills/ must mirror each other: every
// entry in .claude/skills/ is a symlink into .agents/skills/, and every skill
// in .agents/skills/ has that projection.
{
  const claudeSkills = path.join(repoRoot, ".claude", "skills");
  if (existsSync(claudeSkills)) {
    // Skip OS litter like .DS_Store; a real stray file or directory still fails.
    for (const entry of readdirSync(claudeSkills).filter((e) => !e.startsWith("."))) {
      const p = path.join(claudeSkills, entry);
      const target = `../../.agents/skills/${entry}`;
      if (!isSymlinkTo(p, target)) {
        violate(
          2,
          `claude-skill:${entry}`,
          `.claude/skills/${entry} is not a symlink to ${target}`,
          ".agents/skills/ is the canonical skill tree; tool-specific trees are projections",
          `run: rm -rf .claude/skills/${entry} && ln -s ${target} .claude/skills/${entry}`,
        );
      }
    }
  }
  const agentSkills = path.join(repoRoot, ".agents", "skills");
  if (existsSync(agentSkills)) {
    for (const entry of readdirSync(agentSkills, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)) {
      if (!isSymlinkTo(path.join(claudeSkills, entry), `../../.agents/skills/${entry}`)) {
        violate(
          2,
          `missing-projection:${entry}`,
          `.agents/skills/${entry} has no .claude/skills projection`,
          "a skill without its .claude/skills symlink is invisible to Claude Code",
          `run: ln -s ../../.agents/skills/${entry} .claude/skills/${entry}`,
        );
      }
    }
  }
}

// Rule 3 — a skill's frontmatter name must equal its directory name.
{
  const skillsRoot = path.join(repoRoot, ".agents", "skills");
  if (existsSync(skillsRoot)) {
    const dirs = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const dir of dirs) {
      const skillMd = path.join(skillsRoot, dir, "SKILL.md");
      if (!existsSync(skillMd)) {
        violate(
          3,
          `skill-md:${dir}`,
          `.agents/skills/${dir}/ has no SKILL.md`,
          "a skill directory without SKILL.md is invisible to every agent",
          `create .agents/skills/${dir}/SKILL.md with name + description frontmatter`,
        );
        continue;
      }
      const fm = parseFrontmatter(readFileSync(skillMd, "utf8"));
      if (!fm || fm["name"] !== dir) {
        violate(
          3,
          `skill-name:${dir}`,
          `.agents/skills/${dir}/SKILL.md frontmatter name is ${JSON.stringify(fm?.["name"] ?? null)}, not "${dir}"`,
          "identity derives from the file path — an authored name that disagrees with the path gives one skill two identities",
          `set "name: ${dir}" in the SKILL.md frontmatter (or rename the directory)`,
        );
      }
    }
  }
}

// Rule 4 — research/ plans must carry issue, status, last_updated frontmatter.
{
  const researchRoot = path.join(repoRoot, "research");
  if (existsSync(researchRoot)) {
    const walkMd = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walkMd(path.join(dir, e.name))
          : e.name.endsWith(".md")
            ? [path.join(dir, e.name)]
            : [],
      );
    for (const abs of walkMd(researchRoot)) {
      const file = path.relative(researchRoot, abs);
      const fm = parseFrontmatter(readFileSync(abs, "utf8"));
      const missing = ["issue", "status", "last_updated"].filter(
        (k) => !fm || !(k in fm) || fm[k] === "",
      );
      if (missing.length > 0) {
        violate(
          4,
          `research:${file}`,
          `research/${file} is missing frontmatter: ${missing.join(", ")}`,
          "plans are tracked artifacts, not a shadow backlog — without an owner issue and a status they rot silently",
          "add the missing keys to the frontmatter (issue may name the tracking issue/PR)",
        );
      }
    }
  }
}

// Rule 5 — the published package declares no runtime dependencies that are not
// listed here with a decision reference. Keeping the runtime thin is a product
// guarantee (see AGENTS.md coding principle 3).
{
  const allowedRuntimeDeps = new Map([
    // "package-name": "AGENTS.md Decisions #N — one-line reason",
  ]);
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, "packages", "ksor", "package.json"), "utf8"),
  );
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!allowedRuntimeDeps.has(dep)) {
      violate(
        5,
        `runtime-dep:${dep}`,
        `packages/ksor depends on "${dep}" at runtime without a recorded decision`,
        "every runtime dependency ships to every adopter; each one needs an ADR-level reason",
        `record the decision in AGENTS.md → Decisions, then add "${dep}" to allowedRuntimeDeps in this guard with that reference`,
      );
    }
  }
}

// Rule 6 — nothing may depend on the TypeScript compiler API at runtime.
// TS 7 (the native compiler) has no stable programmatic API until 7.1; code
// that imports "typescript" would pin us to the legacy 6.x line.
{
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, "packages", "ksor", "package.json"), "utf8"),
  );
  if ("typescript" in (pkg.dependencies ?? {})) {
    violate(
      6,
      "ts-api-dep",
      'packages/ksor lists "typescript" in dependencies',
      "TS 7 has no stable compiler API until 7.1; a runtime dependency on it forces the legacy 6.x line onto adopters",
      "remove it; typescript belongs in devDependencies only",
    );
  }
  const srcRoot = path.join(repoRoot, "packages", "ksor", "src");
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  for (const file of existsSync(srcRoot) ? walk(srcRoot) : []) {
    if (!file.endsWith(".ts")) continue;
    if (/from\s+["']typescript["']/.test(readFileSync(file, "utf8"))) {
      violate(
        6,
        `ts-api-import:${path.relative(repoRoot, file)}`,
        `${path.relative(repoRoot, file)} imports the "typescript" package`,
        "TS 7 has no stable compiler API until 7.1; importing it makes the build unshippable on the native compiler",
        "remove the import; if compiler-API work is truly needed, record a decision first",
      );
    }
  }
}

// Rule 7 — no focused or skipped tests may be committed. A committed .only
// silently shrinks the suite to one test; a committed .skip hides a red light.
{
  const testDirs = [path.join(repoRoot, "packages"), path.join(repoRoot, "scripts")];
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const child = path.join(dir, e.name);
      if (e.isDirectory()) {
        return e.name === "node_modules" || e.name === "dist" ? [] : walk(child);
      }
      return e.name.endsWith(".test.ts") ? [child] : [];
    });
  for (const file of testDirs.filter(existsSync).flatMap(walk)) {
    if (/\b(?:describe|it|test)\.(?:only|skip)\(/.test(readFileSync(file, "utf8"))) {
      violate(
        7,
        `test-override:${path.relative(repoRoot, file)}`,
        `${path.relative(repoRoot, file)} contains a focused or skipped test`,
        "a committed .only silently shrinks the suite; a committed .skip hides a red light",
        "remove the .only/.skip modifier before committing",
      );
    }
  }
}

// Baseline handling: known violations may be temporarily accepted, but the
// baseline may only shrink.
const baselinePath = path.join(repoRoot, "scripts", "guard-invariants-baseline.json");
const baseline = new Set(
  existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : [],
);
const active = violations.filter((v) => !baseline.has(v.key));
const stale = [...baseline].filter((k) => !violations.some((v) => v.key === k));

if (stale.length > 0) {
  console.error(
    "guard: stale baseline entries (the violation is gone — the baseline may only shrink):",
  );
  for (const key of stale)
    console.error(
      `  - ${key}\n    fix: delete this entry from scripts/guard-invariants-baseline.json`,
    );
}
if (active.length > 0) {
  console.error(`guard: ${active.length} invariant violation(s):\n`);
  for (const v of active) console.error(`  ${v.text}\n`);
}
if (active.length > 0 || stale.length > 0) process.exit(1);
console.log(`guard: ok (${violations.length} baselined, 7 rules)`);
