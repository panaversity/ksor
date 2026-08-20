import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// Acceptance for specs/ksor/init/spec.md, written red-first: every test here
// exercises the BUILT artifact (dist/cli.mjs), exactly what an adopter runs.
const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const distCli = path.join(distDir, "cli.mjs");
const pkgManifest = fileURLToPath(new URL("../package.json", import.meta.url));
const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const templatesDir = fileURLToPath(new URL("../templates/scaffold", import.meta.url));
const pkgVersion = (JSON.parse(readFileSync(pkgManifest, "utf8")) as { version: string }).version;

// The contract of the one template whose emitted name differs: npm pack always
// drops files called .gitignore, so the template ships under a bare name.
// Written out here rather than imported — a test that shares the map with the
// implementation cannot catch the implementation losing it.
const EMITTED_NAMES: ReadonlyMap<string, string> = new Map([
  ["gitignore", ".gitignore"],
  ["env.example", ".env.example"],
]);

function emittedPath(templateRel: string): string {
  const dir = path.dirname(templateRel);
  const emitted = EMITTED_NAMES.get(path.basename(templateRel)) ?? path.basename(templateRel);
  return dir === "." ? emitted : path.join(dir, emitted);
}

let workDirs: string[] = [];
afterEach(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
  workDirs = [];
});

function workDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-init-"));
  workDirs.push(dir);
  return dir;
}

/**
 * A directory the dot form can legally scaffold into: mkdtemp's own names mix
 * case, which `ksor init .` now refuses (the directory name becomes the
 * project name).
 */
function dotDir(name = "my-sor"): string {
  const dir = path.join(workDir(), name);
  mkdirSync(dir);
  return dir;
}

function runInit(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [distCli, "init", ...args], {
    cwd,
    encoding: "utf8",
  });
}

/**
 * A package laid out the way npm installs one — dist beside package.json and
 * templates — so tests can damage the install without touching the checkout.
 */
function fakeInstall(options: { readonly templates: boolean }): string {
  // ksor bundles the kernel and is no longer zero-dep; the ESM cli.mjs resolves
  // its runtime deps (zod, pg, …) via node_modules — and ESM import ignores
  // NODE_PATH, while a node_modules junction does NOT resolve on Windows (the
  // CLI crashed on `import zod` with exit 1 before reaching the fault path).
  // Rooting the fake install INSIDE packages/ksor lets Node's upward module
  // resolution find the real node_modules with no copy and no symlink —
  // cross-platform, and it hits the init FAULT paths, not a missing-module crash.
  const home = mkdtempSync(path.join(pkgRoot, "ksor-fakeinstall-"));
  workDirs.push(home);
  cpSync(distDir, path.join(home, "dist"), { recursive: true });
  copyFileSync(pkgManifest, path.join(home, "package.json"));
  if (options.templates) {
    cpSync(templatesDir, path.join(home, "templates", "scaffold"), {
      recursive: true,
      // A dev checkout's template may have been installed into (found live,
      // twice, 2026-08-18); copying 477 MB of node_modules times the suite out.
      filter: (src) => path.basename(src) !== "node_modules",
    });
  }
  return home;
}

function runInstalled(home: string, args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [path.join(home, "dist", "cli.mjs"), "init", ...args], {
    cwd,
    encoding: "utf8",
  });
}

/** Every file in a tree as sorted relative paths (symlink-aware: none allowed). */
function treeFiles(root: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name);
      if (entry.name === ".git" || entry.name === "node_modules") return [];
      if (entry.isSymbolicLink()) throw new Error(`symlink in scaffold output: ${p}`);
      return entry.isDirectory() ? walk(p) : [path.relative(root, p)];
    });
  return walk(root).sort();
}

/** The emitted tree is the shipped templates plus exactly the two stamps. */
function expectTemplateIdentity(projectDir: string, name: string): void {
  const templated = treeFiles(templatesDir);
  expect(treeFiles(projectDir)).toEqual(templated.map(emittedPath).sort());
  for (const rel of templated) {
    const stamped = readFileSync(path.join(templatesDir, rel), "utf8")
      .replaceAll("KSOR-STAMP-NAME", name)
      .replaceAll("KSOR-STAMP-VERSION", pkgVersion);
    const actual = readFileSync(path.join(projectDir, emittedPath(rel)), "utf8");
    expect(actual, `stamping mismatch in ${rel}`).toBe(stamped);
  }
}

describe("ksor init — acceptance (spec clauses 1-3)", () => {
  it("emits byte-identical trees on repeated runs (determinism)", () => {
    const a = workDir();
    const b = workDir();
    expect(runInit(["my-sor"], a).status, "first init").toBe(0);
    expect(runInit(["my-sor"], b).status, "second init").toBe(0);
    const filesA = treeFiles(path.join(a, "my-sor"));
    const filesB = treeFiles(path.join(b, "my-sor"));
    expect(filesA).toEqual(filesB);
    for (const rel of filesA) {
      const bytesA = readFileSync(path.join(a, "my-sor", rel));
      const bytesB = readFileSync(path.join(b, "my-sor", rel));
      expect(bytesA.equals(bytesB), `byte difference in ${rel}`).toBe(true);
    }
  });

  it("declares @panaversity/ksor as a version-pinned dependency with a serve command", () => {
    // MCP serving is a core surface, not an npx afterthought (decision 11
    // revision 2026-08-20): the served tool ships as a first-class dependency,
    // pinned to the EXACT CLI that scaffolded the project (always a published,
    // kernel-bundled ksor, since this template change ships with the bundling).
    const dir = workDir();
    expect(runInit(["served-sor"], dir).status).toBe(0);
    const pkg = JSON.parse(readFileSync(path.join(dir, "served-sor", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@panaversity/ksor"], "the served dependency, version-pinned").toBe(
      pkgVersion,
    );
    expect(pkg.scripts?.["serve"], "a local serve command").toBe("ksor serve");
    // First ingest must --flip or serve answers from an unactivated generation
    // (empty server); ingest needs --instance + --knowledge (no CLI defaults).
    expect(pkg.scripts?.["ingest"], "a local ingest command that activates").toBe(
      "ksor ingest --instance instance.md --knowledge knowledge --flip",
    );
    expect(pkg.scripts?.["schema"], "a local schema command").toBe(
      "ksor schema --instance instance.md --apply",
    );
    // Authorizing ingest must be a ksor command, never a psql one-liner: the
    // golden path may not require a second tool (specs/ksor/grant/spec.md).
    expect(pkg.scripts?.["grant"], "a local grant command").toBe(
      "ksor grant --instance instance.md",
    );
    // The served rung's variables ship as an example, including the auth
    // posture: `ksor serve` refuses to boot unauthenticated, so a runbook that
    // omitted KSOR_AUTH_DISABLED dead-ended at the last step (found live,
    // 2026-08-20).
    const env = readFileSync(path.join(dir, "served-sor", ".env.example"), "utf8");
    for (const key of ["KSOR_DB_URL", "GEMINI_API_KEY", "KSOR_AUTH_DISABLED"]) {
      expect(env, `.env.example names ${key}`).toContain(key);
    }
    // …and it must survive the ignore rule that hides real .env files.
    const ignore = readFileSync(path.join(dir, "served-sor", ".gitignore"), "utf8");
    expect(ignore, "the example is exempt from .env*").toContain("!.env.example");

    // One command for the whole served rung. Every step it chains is
    // re-runnable, so it is also the refresh-after-editing command. It must
    // NOT be called `up`: that is pnpm's own alias for `update`, so the script
    // is shadowed and `pnpm up` silently upgrades the adopter's dependencies
    // instead (shipped that way in 0.0.5; found live 2026-08-20).
    expect(pkg.scripts?.["start"], "one command brings the rung up").toBe(
      "pnpm schema && pnpm grant && pnpm ingest && pnpm serve",
    );
    expect(pkg.scripts?.["up"], "`up` collides with pnpm's built-in").toBeUndefined();
    const workspace = readFileSync(path.join(dir, "served-sor", "pnpm-workspace.yaml"), "utf8");
    // The pinned tool MUST be excluded from the scaffold's 48h release-age
    // quarantine, or the first install of a freshly-published ksor breaks for
    // two days after every release (found live 2026-08-20: minimumReleaseAge
    // rejected the just-published version).
    expect(workspace, "the tool is excluded from the release-age quarantine").toMatch(
      /minimumReleaseAgeExclude:[\s\S]*@panaversity\/ksor/,
    );
    // The scaffold declares a root dependency that the COMMITTED lockfile
    // cannot record (the version is stamped per-install), so the deploy's
    // install must not be frozen — otherwise an adopter's very first Vercel
    // import dies on ERR_PNPM_OUTDATED_LOCKFILE before any build (review,
    // 2026-08-20). The repo's own e2e suites already had to make this switch.
    const vercel = JSON.parse(
      readFileSync(path.join(dir, "served-sor", "vercel.json"), "utf8"),
    ) as { installCommand?: string };
    expect(vercel.installCommand, "the deploy install must tolerate the stamped dep").toContain(
      "--no-frozen-lockfile",
    );
    // The kernel's build-scripted deps must be explicitly denied, or pnpm 11
    // exits 1 on the adopter's first install (found live 2026-08-20).
    expect(workspace, "@google/genai build denied").toMatch(/"@google\/genai":\s*false/);
    expect(workspace, "protobufjs build denied").toMatch(/protobufjs:\s*false/);
  });

  it.runIf(process.platform !== "win32")(
    "gives both init forms the same project-root mode (0755)",
    () => {
      // mkdtempSync stages at 0700 and rename carries the mode onto the
      // project root (review finding, 2026-08-18) — the named form must end
      // where `init .` ends.
      const named = workDir();
      expect(runInit(["mode-check"], named).status).toBe(0);
      const namedMode = statSync(path.join(named, "mode-check")).mode & 0o777;

      const dotParent = workDir();
      const dotTarget = path.join(dotParent, "mode-dot");
      mkdirSync(dotTarget);
      expect(runInit(["."], dotTarget).status).toBe(0);
      const dotMode = statSync(dotTarget).mode & 0o777;

      expect(namedMode.toString(8), "named-form root mode").toBe(dotMode.toString(8));
      // Whatever the umask grants, the root must match the tree it holds —
      // 0700-root-over-0755-children and its umask-077 inverse both shipped
      // once (review findings, 2026-08-18).
      const childMode = statSync(path.join(named, "mode-check", "knowledge")).mode & 0o777;
      expect(namedMode.toString(8), "root vs child mode").toBe(childMode.toString(8));
    },
  );

  it("output matches the shipped templates plus exactly the two stamps", () => {
    // Two names, because a stamp that silently kept its default would pass
    // with one: only a second name proves the substitution is the variable.
    for (const name of ["my-sor", "second-record"]) {
      const dir = workDir();
      expect(runInit([name], dir).status).toBe(0);
      expectTemplateIdentity(path.join(dir, name), name);
    }
  });

  it("emits .gitignore — the name npm pack refuses to ship", () => {
    const dir = workDir();
    expect(runInit(["my-sor"], dir).status).toBe(0);
    const emitted = path.join(dir, "my-sor", ".gitignore");
    expect(existsSync(emitted)).toBe(true);
    expect(readFileSync(emitted, "utf8")).toContain("node_modules/");
    expect(existsSync(path.join(dir, "my-sor", "gitignore")), "template name leaked").toBe(false);
  });

  it("initializes a git repository, staging and committing nothing", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const projectDir = path.join(dir, "my-sor");
    expect(existsSync(path.join(projectDir, ".git"))).toBe(true);
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    // Everything untracked (??), nothing staged.
    const staged = status.stdout.split("\n").filter((l) => l && !l.startsWith("??"));
    expect(staged).toEqual([]);
  });

  it("skips git init when already inside a repository", () => {
    const dir = workDir();
    spawnSync("git", ["init", "--quiet"], { cwd: dir });
    runInit(["my-sor"], dir);
    expect(existsSync(path.join(dir, "my-sor", ".git"))).toBe(false);
  });

  it("runs on this Node, and says so by not refusing it", () => {
    const dir = workDir();
    const result = runInit(["my-sor"], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toContain("unsupported-platform");
  });

  it("tells the truth when git exists but fails", () => {
    const dir = workDir();
    const badConfig = path.join(dir, "broken.gitconfig");
    writeFileSync(badConfig, "[[[not a config\n");
    const result = spawnSync(process.execPath, [distCli, "init", "my-sor"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: badConfig },
    });
    // Warn-only: the scaffold is still the deliverable.
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("note: git init failed:");
    // found live: every git failure claimed git was missing, sending the
    // operator to install software they already had (attack run, 2026-08-18).
    expect(result.stderr).not.toContain("git was not found");
  });
});

describe("ksor init — refusals (spec clause 2)", () => {
  function expectRefusal(result: ReturnType<typeof runInit>, slug: string) {
    expect(result.status).toBe(1);
    expect(result.stderr.split("\n")[0]).toBe(`error: ${slug}`);
    // Errors are documentation: every refusal carries a remedy line.
    expect(result.stderr.trim().split("\n").length).toBeGreaterThan(1);
  }

  it("bare init prints instructions and exits 0, scaffolding nothing", () => {
    const dir = workDir();
    const result = runInit([], dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ksor init <name>");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses a bad name with error: bad-name", () => {
    const dir = workDir();
    expectRefusal(runInit(["My_SOR!"], dir), "bad-name");
    expectRefusal(runInit(["-leading-hyphen"], dir), "bad-name");
    // A Windows device name passes the grammar but is not a directory there.
    expectRefusal(runInit(["con"], dir), "bad-name");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses more than one word instead of scaffolding the first", () => {
    const dir = workDir();
    const result = runInit(["my", "sor"], dir);
    expectRefusal(result, "bad-name");
    expect(result.stderr).toContain("ksor init my-sor");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses init . when the directory name is not a legal project name", () => {
    // A `"` directory is uncreatable on Windows (mkdir EINVAL), so the
    // JSON-corruption case only exists — and is only testable — on POSIX.
    const badNames =
      process.platform === "win32" ? ["My Project", "UPPER"] : ["My Project", 'quote"name'];
    for (const dirName of badNames) {
      const parent = workDir();
      const target = path.join(parent, dirName);
      mkdirSync(target);
      const result = runInit(["."], target);
      expect(result.status, `${dirName}: ${result.stdout}`).toBe(1);
      expect(result.stderr.split("\n")[0]).toBe("error: bad-name");
      expect(readdirSync(target), `${dirName}: wrote into a badly named directory`).toEqual([]);
    }
  });

  it("points init . at the parent-directory remedy", () => {
    const parent = workDir();
    const target = path.join(parent, "My Project");
    mkdirSync(target);
    const result = runInit(["."], target);
    expect(result.stderr).toContain("ksor init my-project");
    expect(result.stderr).toContain("parent directory");
  });

  it("refuses an existing target with error: exists", () => {
    const dir = workDir();
    mkdirSync(path.join(dir, "my-sor"));
    writeFileSync(path.join(dir, "my-sor", "unrelated.txt"), "content");
    expectRefusal(runInit(["my-sor"], dir), "exists");
    // The unrelated content is untouched.
    expect(readFileSync(path.join(dir, "my-sor", "unrelated.txt"), "utf8")).toBe("content");
  });

  it("refuses init . into a non-empty directory, naming what blocked it", () => {
    const dir = dotDir();
    writeFileSync(path.join(dir, "notes.txt"), "existing work");
    writeFileSync(path.join(dir, ".DS_Store"), "hidden");
    const result = runInit(["."], dir);
    expectRefusal(result, "blocked");
    // found live: a bare entry count over a hidden file gave the operator
    // nothing to act on (attack run, 2026-08-18).
    expect(result.stderr).toContain(".DS_Store");
    expect(result.stderr).toContain("notes.txt");
    expect(readFileSync(path.join(dir, "notes.txt"), "utf8")).toBe("existing work");
  });

  it("scaffolds into an empty directory with init .", () => {
    const dir = dotDir("company-record");
    const result = runInit(["."], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(path.join(dir, "instance.md"))).toBe(true);
    // The name is the directory's, and it reaches the record.
    expect(readFileSync(path.join(dir, "instance.md"), "utf8")).toContain("name: company-record");
  });

  it("refuses nesting inside an existing ksor project with error: nested", () => {
    const dir = workDir();
    runInit(["outer"], dir);
    const inner = path.join(dir, "outer", "knowledge");
    expectRefusal(runInit(["inner"], inner), "nested");
  });

  it("warns (does not refuse) under a parent pnpm workspace", () => {
    const dir = workDir();
    writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "**"\n');
    const result = runInit(["my-sor"], dir);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("parent pnpm workspace");
  });

  it("keeps a refused run free of the workspace warning", () => {
    const dir = workDir();
    writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "**"\n');
    mkdirSync(path.join(dir, "my-sor"));
    const result = runInit(["my-sor"], dir);
    expectRefusal(result, "exists");
    expect(result.stderr).not.toContain("parent pnpm workspace");
  });

  it("leaves no stage directory behind after success", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const leftovers = readdirSync(dir).filter((entry) => entry.startsWith(".ksor-init-"));
    expect(leftovers).toEqual([]);
  });

  it("reports a stale stage directory and never deletes it", () => {
    const dir = workDir();
    const stale = path.join(dir, ".ksor-init-OLD");
    mkdirSync(stale);
    writeFileSync(path.join(stale, "half-written.md"), "interrupted work");
    const result = runInit(["my-sor"], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("note: found .ksor-init-OLD");
    expect(readFileSync(path.join(stale, "half-written.md"), "utf8")).toBe("interrupted work");

    // The note must never take the first stderr line from a refusal slug —
    // machine readers parse line one (found live: concurrent init pairs,
    // 2026-08-18).
    const refused = runInit(["my-sor"], dir);
    expectRefusal(refused, "exists");
  });
});

describe("ksor init — environment failures (exit 3)", () => {
  it("refuses a Node older than the scaffold's toolchain", () => {
    const dir = workDir();
    // The floor is read from process.versions.node, so an older runtime is
    // simulated rather than installed — the wiring is what needs proving.
    const patch = path.join(dir, "old-node.mjs");
    writeFileSync(
      patch,
      'Object.defineProperty(process.versions, "node", { value: "22.15.0" });\n',
    );
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(patch).href, distCli, "init", "my-sor"],
      { cwd: dir, encoding: "utf8" },
    );
    expect(result.status, result.stdout).toBe(3);
    expect(result.stderr.split("\n")[0]).toBe("error: unsupported-platform");
    expect(result.stderr).toContain("v22.15.0");
    expect(readdirSync(dir)).toEqual(["old-node.mjs"]);
  });

  it("refuses an install that lost its templates with error: broken-install", () => {
    const home = fakeInstall({ templates: false });
    const dir = workDir();
    const result = runInstalled(home, ["my-sor"], dir);
    expect(result.status, result.stdout).toBe(3);
    expect(result.stderr.split("\n")[0]).toBe("error: broken-install");
    expect(result.stderr).toContain("reinstall");
    expect(readdirSync(dir)).toEqual([]);
  });

  // Root ignores the permission bits this fault injection depends on, and
  // Windows has no equivalent chmod.
  const canDenyRead = process.platform !== "win32" && process.getuid?.() !== 0;

  it.runIf(canDenyRead)("rolls the filesystem back when init . fails mid-tree", () => {
    const home = fakeInstall({ templates: true });
    chmodSync(path.join(home, "templates", "scaffold", "system", "site", "tsconfig.json"), 0o000);
    const dir = dotDir();
    const result = runInstalled(home, ["."], dir);
    expect(result.status, result.stdout).toBe(3);
    expect(result.stderr.split("\n")[0]).toBe("error: environment");
    // The spec's promise: a failed init leaves the filesystem as found.
    expect(readdirSync(dir), "partial scaffold left behind").toEqual([]);
  });

  it.runIf(canDenyRead)("leaves nothing behind when the named form fails mid-tree", () => {
    const home = fakeInstall({ templates: true });
    chmodSync(path.join(home, "templates", "scaffold", "system", "site", "tsconfig.json"), 0o000);
    const dir = workDir();
    const result = runInstalled(home, ["my-sor"], dir);
    expect(result.status, result.stdout).toBe(3);
    expect(result.stderr.split("\n")[0]).toBe("error: environment");
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("ksor init — scaffold contents (spec: emitted-tree contract)", () => {
  it("stamps instance.md with the name, version, and upgrade stamp", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const instance = readFileSync(path.join(dir, "my-sor", "instance.md"), "utf8");
    expect(instance).toContain("name: my-sor");
    expect(instance).toContain(`scaffolded: "${pkgVersion}"`);
  });

  it("emits the closed root set — no more, no less", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const root = readdirSync(path.join(dir, "my-sor"))
      .filter((e) => e !== ".git")
      .sort();
    expect(root).toEqual(
      [
        ".agents",
        ".claude",
        // The served rung's variables, including the auth posture serve
        // requires (decision 8 revision 2026-08-20).
        ".env.example",
        ".gemini",
        ".gitattributes",
        ".github",
        ".gitignore",
        "AGENTS.md",
        "CLAUDE.md",
        "README.md",
        "instance.md",
        "knowledge",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "system",
        "vercel.json",
      ].sort(),
    );
  });

  it("CLAUDE.md is a one-line pointer file, never a symlink", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const claudeMd = path.join(dir, "my-sor", "CLAUDE.md");
    expect(readFileSync(claudeMd, "utf8").trim()).toBe("@AGENTS.md");
  });

  it("the scaffold's own format checker passes on the fresh scaffold", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const checker = path.join(dir, "my-sor", ".agents", "skills", "format-checker", "check.mjs");
    expect(existsSync(checker)).toBe(true);
    const result = spawnSync(process.execPath, [checker], {
      cwd: path.join(dir, "my-sor"),
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("the handoff text names the real next commands", () => {
    const dir = workDir();
    const result = runInit(["my-sor"], dir);
    expect(result.stdout).toContain("cd my-sor");
    expect(result.stdout).toContain("pnpm install");
    expect(result.stdout).toContain("pnpm dev");
    // A handoff that assumes pnpm is a dead end for whoever lacks it.
    expect(result.stdout).toContain("corepack enable pnpm");
  });
});
