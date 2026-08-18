import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// Acceptance for specs/ksor/init/spec.md, written red-first: every test here
// exercises the BUILT artifact (dist/cli.mjs), exactly what an adopter runs.
const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const templatesDir = fileURLToPath(new URL("../templates/scaffold", import.meta.url));

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

function runInit(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [distCli, "init", ...args], {
    cwd,
    encoding: "utf8",
  });
}

/** Every file in a tree as sorted relative paths (symlink-aware: none allowed). */
function treeFiles(root: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name);
      if (entry.name === ".git") return [];
      if (entry.isSymbolicLink()) throw new Error(`symlink in scaffold output: ${p}`);
      return entry.isDirectory() ? walk(p) : [path.relative(root, p)];
    });
  return walk(root).sort();
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

  it("output matches the shipped templates plus exactly the two stamps", () => {
    const dir = workDir();
    expect(runInit(["my-sor"], dir).status).toBe(0);
    const emitted = treeFiles(path.join(dir, "my-sor"));
    const templated = treeFiles(templatesDir);
    expect(emitted).toEqual(templated);
    // A template byte differs from its emitted byte ONLY via the two stamps.
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    for (const rel of templated) {
      const template = readFileSync(path.join(templatesDir, rel), "utf8");
      const stamped = template
        .replaceAll("KSOR-STAMP-NAME", "my-sor")
        .replaceAll("KSOR-STAMP-VERSION", pkg.version);
      const actual = readFileSync(path.join(dir, "my-sor", rel), "utf8");
      expect(actual, `stamping mismatch in ${rel}`).toBe(stamped);
    }
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
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses an existing target with error: exists", () => {
    const dir = workDir();
    mkdirSync(path.join(dir, "my-sor"));
    writeFileSync(path.join(dir, "my-sor", "unrelated.txt"), "content");
    expectRefusal(runInit(["my-sor"], dir), "exists");
    // The unrelated content is untouched.
    expect(readFileSync(path.join(dir, "my-sor", "unrelated.txt"), "utf8")).toBe("content");
  });

  it("refuses init . into a non-empty directory with error: blocked", () => {
    const dir = workDir();
    writeFileSync(path.join(dir, "notes.txt"), "existing work");
    expectRefusal(runInit(["."], dir), "blocked");
    expect(readFileSync(path.join(dir, "notes.txt"), "utf8")).toBe("existing work");
  });

  it("scaffolds into an empty directory with init .", () => {
    const dir = workDir();
    const result = runInit(["."], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(path.join(dir, "instance.md"))).toBe(true);
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

  it("leaves no stage directory behind after success", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const leftovers = readdirSync(dir).filter((entry) => entry.startsWith(".ksor-init-"));
    expect(leftovers).toEqual([]);
  });
});

describe("ksor init — scaffold contents (spec: emitted-tree contract)", () => {
  it("stamps instance.md with the name, version, and upgrade stamp", () => {
    const dir = workDir();
    runInit(["my-sor"], dir);
    const instance = readFileSync(path.join(dir, "my-sor", "instance.md"), "utf8");
    expect(instance).toContain("name: my-sor");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(instance).toContain(`scaffolded: "${pkg.version}"`);
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
  });
});
