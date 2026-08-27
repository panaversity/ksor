/**
 * The scaffold, proven under the manager that asked for it (issue #28).
 *
 * `ksor init` reads npm_config_user_agent and emits the invoking manager's
 * scaffold. The emitted-bytes contract lives in
 * init-manager.integration.test.ts; what THIS walk holds is the claim those
 * bytes make — that an adopter on npm or bun can install, resolve the pinned
 * `ksor` bin, run the checker, and build the static site, with no pnpm on the
 * machine's path anywhere in the walk.
 *
 * It installs the LOCAL build rather than the published one (the tier rule
 * paid for with shipped defects: the test must install the same tree the
 * artifact installs) — the stamped registry version may not exist yet when CI
 * runs, so the dependency is swapped to the packed tarball, and that swap is
 * the ONLY divergence from the emitted scaffold.
 *
 * Usage: node scripts/manager-acceptance.mjs <npm|bun>
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(repoRoot, "packages", "ksor", "dist", "cli.mjs");

const manager = process.argv[2];
const AGENTS = {
  npm: "npm/11.6.0 node/v24.5.0 linux x64 workspaces/false",
  bun: "bun/1.3.6 npm/? node/v24.3.0 linux x64",
};
if (!(manager in AGENTS)) {
  console.error("usage: node scripts/manager-acceptance.mjs <npm|bun>");
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  return execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...opts });
}

const work = mkdtempSync(path.join(tmpdir(), `ksor-mgr-${manager}-`));
const project = path.join(work, "demo");
try {
  // Pack the local build with pnpm — the manifest uses the pnpm-only
  // `catalog:` protocol, which only `pnpm pack` resolves.
  run("pnpm", [
    "--dir",
    path.join(repoRoot, "packages", "ksor"),
    "pack",
    "--out",
    path.join(work, "ksor-local.tgz"),
  ]);
  const tarball = path.join(work, "ksor-local.tgz");

  run(process.execPath, [cli, "init", "demo"], {
    cwd: work,
    env: { ...process.env, npm_config_user_agent: AGENTS[manager] },
  });

  // The one divergence: the stamped version becomes the packed tarball.
  const manifestPath = path.join(project, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.dependencies["@panaversity/ksor"] = `file:${tarball}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const opts = { cwd: project, env: { ...process.env } };
  if (manager === "npm") {
    run("npm", ["install", "--no-audit", "--no-fund"], opts);
    const version = run("npx", ["--no-install", "ksor", "--version"], opts).trim();
    console.log(`ksor resolves: ${version}`);
    run("npm", ["run", "check"], opts);
    run("npm", ["run", "build"], opts);
  } else {
    run("bun", ["install"], opts);
    const version = run("bunx", ["ksor", "--version"], opts).trim();
    console.log(`ksor resolves: ${version}`);
    run("bun", ["run", "check"], opts);
    run("bun", ["run", "build"], opts);
  }

  for (const artifact of ["index.html", "llms.txt", "llms-full.txt"]) {
    const p = path.join(project, "system", "site", "out", artifact);
    if (!existsSync(p)) {
      console.error(`MISSING from the built site: ${artifact}`);
      process.exit(1);
    }
  }
  // The walk built the site with the adopter's manager; the lockfile their
  // first install writes is the reproducibility record the README told them
  // to commit — assert it actually appeared.
  const lock = manager === "npm" ? "package-lock.json" : "bun.lock";
  if (!existsSync(path.join(project, lock))) {
    console.error(`first install did not write ${lock}`);
    process.exit(1);
  }
  console.log(`manager acceptance (${manager}): ok`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
