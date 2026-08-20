#!/usr/bin/env node
// Mechanical repository invariants. Every rule prints WHY it exists and HOW to
// fix a violation, so a contributor (human or agent) can self-correct without
// waiting for a reviewer. There is no suppression mechanism: a rule that must
// land against existing violations lands together with the fixes (or brings
// back a baseline in that same PR — cut 2026-08-18 while it guarded zero
// entries).

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "./lib/frontmatter.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const violations = [];

function violate(rule, message, why, fix) {
  violations.push(`rule ${rule} — ${message}\n    why: ${why}\n    fix: ${fix}`);
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
          `research/${file} is missing frontmatter: ${missing.join(", ")}`,
          "plans are tracked artifacts, not a shadow backlog — without an owner issue and a status they rot silently",
          "add the missing keys to the frontmatter (issue may name the tracking issue/PR)",
        );
      }
    }
  }
}

// Rule 5 — no workspace package declares a runtime dependency outside its
// OWN allowlist. Keeping the runtime thin is a product guarantee (AGENTS.md
// coding principle 3), and it is PER PACKAGE: `@panaversity/ksor` (the
// published CLI) must stay at ZERO runtime deps, and a shared allowlist
// would silently retire that (review finding, 2026-08-19 — adding zod to the
// CLI would have passed). Each package is enrolled explicitly; an
// unenrolled package with any runtime dep is a violation, and enrolment is a
// decision with a name on it (decision 12).
{
  const P = "@panaversity/";
  const perPackageRuntimeDeps = new Map([
    // The ONE published package (decision 12, publish revision 2026-08-20,
    // owner): the kernel is BUNDLED into the CLI (platform/content/gateway-kit/
    // content-gateway inlined via tsdown noExternal), so their external runtime
    // deps surface HERE. This reverses the decision-1/13 zero-dep guarantee by
    // owner call — every `npx @panaversity/ksor init` now pulls this set, and
    // `ksor serve` runs the gateway in-process. Never add BEYOND the kernel's
    // externals without a recorded decision.
    [
      `${P}ksor`,
      new Set([
        "@modelcontextprotocol/server",
        "hono",
        "@hono/node-server",
        "zod",
        "pg",
        "@types/pg",
        "@google/genai",
        "jose",
      ]),
    ],
    // The kernel packages (decision 12). drizzle-orm was dropped as unused —
    // schema.sql is the DDL source of truth and queries are raw pg. @types/pg
    // is a DECLARED dependency (not a devDep) of every package whose published
    // .d.mts exposes pg.Pool/PoolClient in its public API, so an external TS
    // consumer resolves those types (decision 12, publish revision 2026-08-19).
    [`${P}ksor-postgres`, new Set(["pg", "@types/pg"])],
    [`${P}ksor-content`, new Set(["pg", "@types/pg", "zod", "@google/genai", `${P}ksor-postgres`])],
    [`${P}ksor-gateway-kit`, new Set(["jose"])],
    // The ONE published kernel package (decision 12, publish revision
    // 2026-08-19): platform/content/gateway-kit are BUNDLED in (workspace
    // devDeps, noExternal in tsdown) — never separate npm packages — so their
    // external runtime deps surface HERE as this package's own dependencies.
    [
      `${P}ksor-content-gateway`,
      new Set([
        "@modelcontextprotocol/server",
        // hono + node-server: the SDK's own Web-standard transport shape, and
        // both are ALREADY the SDK's transitive deps (zero new install bytes)
        // — declared directly so the door composes them instead of
        // hand-rolling the HTTP layer three findings landed in (decision 13).
        "hono",
        "@hono/node-server",
        "zod",
        "pg",
        "@types/pg",
        "@google/genai", // bundled content's embedding provider
        "jose", // bundled gateway-kit's JWT verification
      ]),
    ],
  ]);
  for (const dir of readdirSync(path.join(repoRoot, "packages"))) {
    const manifest = path.join(repoRoot, "packages", dir, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    const allowed = perPackageRuntimeDeps.get(pkg.name);
    if (allowed === undefined) {
      if (Object.keys(pkg.dependencies ?? {}).length > 0) {
        violate(
          5,
          `packages/${dir} (${pkg.name}) is not enrolled in rule 5's per-package allowlist`,
          "every package's runtime dependency set is a named decision — a new package with deps must enrol",
          `add "${pkg.name}" to perPackageRuntimeDeps in this guard with its allowed dep set`,
        );
      }
      continue;
    }
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (!allowed.has(dep)) {
        violate(
          5,
          `${pkg.name} depends on "${dep}" at runtime, which its allowlist does not permit`,
          "every runtime dependency ships to every adopter; each one needs an ADR-level reason",
          `record the decision in AGENTS.md → Decisions, then add "${dep}" to ${pkg.name}'s set in this guard`,
        );
      }
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
        `${path.relative(repoRoot, file)} contains a focused or skipped test`,
        "a committed .only silently shrinks the suite; a committed .skip hides a red light",
        "remove the .only/.skip modifier before committing",
      );
    }
  }
}

// Rule 8 — every specs/**/spec.md carries enforced frontmatter: a closed
// status lifecycle and the business claim it serves.
{
  const specsRoot = path.join(repoRoot, "specs");
  const SPEC_STATUS = new Set(["draft", "ratified", "superseded"]);
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : e.name === "spec.md"
          ? [path.join(dir, e.name)]
          : [],
    );
  for (const abs of existsSync(specsRoot) ? walk(specsRoot) : []) {
    const rel = path.relative(repoRoot, abs);
    const fm = parseFrontmatter(readFileSync(abs, "utf8"));
    if (!fm || !SPEC_STATUS.has(fm["status"] ?? "")) {
      violate(
        8,
        `${rel} has status ${JSON.stringify(fm?.["status"] ?? null)}, not draft | ratified | superseded`,
        "a spec's lifecycle is a closed set — an unstated status makes the contract's authority unknowable",
        "set status: draft | ratified | superseded in the frontmatter",
      );
    }
    if (!fm || !fm["claim"]) {
      violate(
        8,
        `${rel} names no business claim`,
        "every change names its business claim (How we work 11); a spec that cannot say which promise it serves does not get built",
        "add a claim: line naming the promise this spec serves",
      );
    }
  }
}

if (violations.length > 0) {
  console.error(`guard: ${violations.length} invariant violation(s):\n`);
  for (const v of violations) console.error(`  ${v}\n`);
  process.exit(1);
}
console.log("guard: ok (8 rules)");
