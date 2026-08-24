import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * Issue #28: the scaffold meets the adopter's package manager instead of
 * conscripting one. `ksor init` reads npm_config_user_agent — set by every
 * manager for the process it spawns, so the run that scaffolds is the run
 * that knows the toolchain — and emits that manager's scaffold. Unrecognized
 * or absent, it emits pnpm, the most-protected posture and the one every
 * scaffold got before this existed.
 *
 * All three shapes were proven END TO END against the published 0.0.35
 * before this landed: install, `ksor` bin resolution, and a full static
 * site build under pnpm, npm (341 packages, scripts denied), and bun
 * (bun's own default-deny lifecycle posture). What this suite holds cheaply
 * is the EMITTED BYTES per manager; the install walks live in the gated e2e.
 */

const distCli = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "dist",
  "cli.mjs",
);

const AGENTS = {
  pnpm: "pnpm/11.22.0 npm/? node/v24.5.0 darwin arm64",
  npm: "npm/11.6.0 node/v24.5.0 darwin arm64 workspaces/false",
  bun: "bun/1.3.6 npm/? node/v24.3.0 darwin arm64",
} as const;

let workDirs: string[] = [];
afterEach(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
  workDirs = [];
});

function scaffold(userAgent: string | undefined): { root: string; stdout: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-mgr-"));
  workDirs.push(dir);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.npm_config_user_agent;
  if (userAgent !== undefined) env.npm_config_user_agent = userAgent;
  const result = spawnSync(process.execPath, [distCli, "init", "demo"], {
    cwd: dir,
    encoding: "utf8",
    env,
  });
  expect(result.status, result.stderr).toBe(0);
  return { root: path.join(dir, "demo"), stdout: result.stdout };
}

function manifest(root: string): {
  scripts: Record<string, string>;
  workspaces?: string[];
  packageManager?: string;
} {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as never;
}

/**
 * Every text file of a scaffold, joined — the surface an adopter and their
 * agent actually read. Used to assert the OTHER managers' names are gone.
 */
function allProse(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") stack.push(p);
      } else if (
        /\.(md|json|yaml|yml|ts|tsx|mjs|js|txt)$/.test(entry.name) ||
        entry.name === ".npmrc"
      ) {
        out.set(path.relative(root, p), readFileSync(p, "utf8"));
      }
    }
  }
  return out;
}

/**
 * No instruction the adopter cannot run: outside the canonical quarantine
 * disclosure (which NAMES pnpm on purpose — owner decision, 2026-08-24) and
 * `.npmrc` (checked structurally below), "pnpm" must not survive translation.
 */
function assertNoForeignManager(root: string): void {
  for (const [file, text] of allProse(root)) {
    if (file === ".npmrc") continue;
    const stripped = text.replaceAll(
      /One honest difference from the pnpm scaffold[\s\S]*?\n\n/g,
      "",
    );
    expect(stripped.includes("pnpm"), `${file} still says pnpm`).toBe(false);
  }
}

describe("ksor init meets the invoking package manager", () => {
  it("emits the pnpm scaffold when pnpm ran it — and when nothing recognizable did", () => {
    for (const agent of [AGENTS.pnpm, undefined, "yarn/4.5.0 npm/? node/v24"]) {
      const { root } = scaffold(agent);
      expect(existsSync(path.join(root, "pnpm-workspace.yaml")), String(agent)).toBe(true);
      expect(existsSync(path.join(root, "pnpm-lock.yaml")), String(agent)).toBe(true);
      expect(existsSync(path.join(root, ".npmrc")), String(agent)).toBe(false);
      const m = manifest(root);
      expect(m.packageManager).toMatch(/^pnpm@/);
      expect(m.scripts.dev).toBe("pnpm -C system/site dev");
    }
  });

  it("emits an npm scaffold under npx: workspaces field, script denial, no pnpm anywhere", () => {
    const { root, stdout } = scaffold(AGENTS.npm);

    // pnpm's machinery must be absent, not inert.
    expect(existsSync(path.join(root, "pnpm-workspace.yaml"))).toBe(false);
    expect(existsSync(path.join(root, "pnpm-lock.yaml"))).toBe(false);

    const m = manifest(root);
    expect(m.workspaces).toEqual(["system/site", "system/gateways/*", "system/packages/*"]);
    expect(m.packageManager).toBeUndefined();
    expect(m.scripts.dev).toBe("npm --prefix system/site run dev");
    expect(m.scripts.build).toBe("npm run export-denylist && npm --prefix system/site run build");
    expect(m.scripts.provision).toBe("npm run schema && npm run grant");

    // The denial half of the supply-chain posture translates; the emitted file
    // must also DISCLOSE the half that does not (pnpm's 48h quarantine).
    const npmrc = readFileSync(path.join(root, ".npmrc"), "utf8");
    expect(npmrc.toLowerCase()).toContain("48-hour");
    // Structural, not textual: comments may say anything (they carry the
    // disclosure); the DIRECTIVES must be exactly the script denial.
    const directives = npmrc
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"));
    expect(directives).toEqual(["ignore-scripts=true"]);

    // The whole scaffold — README, AGENTS.md, the agent kit, seed content —
    // speaks npm. A surviving "pnpm" is an instruction the adopter cannot run.
    assertNoForeignManager(root);

    // The handoff the CLI prints is the first thing an adopter runs.
    expect(stdout).toContain("npm install");
    expect(stdout).not.toContain("pnpm");
  });

  it("emits a bun scaffold under bunx: workspaces field, cd-chain scripts, no pnpm anywhere", () => {
    const { root, stdout } = scaffold(AGENTS.bun);

    expect(existsSync(path.join(root, "pnpm-workspace.yaml"))).toBe(false);
    expect(existsSync(path.join(root, "pnpm-lock.yaml"))).toBe(false);

    const m = manifest(root);
    expect(m.workspaces).toEqual(["system/site", "system/gateways/*", "system/packages/*"]);
    expect(m.packageManager).toBeUndefined();
    // `bun --cwd <dir> run <script>` ran the WRONG script inside a workspace
    // (observed live on bun 1.3.6: `run build` executed `dev`), so bun scripts
    // are cd-chains, which bun's own cross-platform shell executes on Windows.
    expect(m.scripts.dev).toBe("cd system/site && bun run dev");
    expect(m.scripts.build).toBe("bun run export-denylist && cd system/site && bun run build");

    assertNoForeignManager(root);
    // The quarantine disclosure must survive into the bun README too — bun has
    // no .npmrc to carry it.
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    expect(readme).toContain("48 hours");
    expect(stdout).toContain("bun install");
    expect(stdout).not.toContain("pnpm");
  });

  it("is deterministic per manager: two npm scaffolds are byte-identical", () => {
    const a = scaffold(AGENTS.npm).root;
    const b = scaffold(AGENTS.npm).root;
    const left = allProse(a);
    const right = allProse(b);
    expect([...left.keys()].sort()).toEqual([...right.keys()].sort());
    for (const [file, text] of left) expect(right.get(file), file).toBe(text);
  });

  it("keeps the two skill mirrors byte-identical after translation", () => {
    const { root } = scaffold(AGENTS.npm);
    const skills = path.join(root, ".agents", "skills");
    const claude = path.join(root, ".claude", "skills");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    for (const file of walk(skills)) {
      const twin = path.join(claude, path.relative(skills, file));
      expect(readFileSync(file, "utf8"), twin).toBe(readFileSync(twin, "utf8"));
    }
  });
});
