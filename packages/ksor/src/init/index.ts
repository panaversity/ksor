import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

import { exitCodes } from "../index.js";
import { materialize } from "./materialize.js";
import { isValidName, suggestName } from "./name.js";
import { findAncestorProject, findAncestorWorkspace } from "./walk.js";

export interface InitIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** Paths/facts the CLI resolves relative to its own installed location. */
export interface InitEnv {
  readonly version: string;
  readonly templatesDir: string;
}

function refuse(io: InitIo, slug: string, lines: readonly string[]): number {
  io.err(`error: ${slug}\n${lines.join("\n")}\n`);
  return exitCodes.refused;
}

function usage(io: InitIo): number {
  io.out(
    "ksor init <name>   create a new Knowledge System of Record in ./<name>\n" +
      "ksor init .        scaffold into the current directory (must be empty)\n" +
      "\n" +
      "Nothing was scaffolded: bare `ksor init` never writes — an unattended\n" +
      "agent must not scaffold into an unknown directory by accident.\n" +
      `The name must match ^[a-z0-9][a-z0-9-]{0,62}$ (e.g. accounting-sor).\n`,
  );
  return 0;
}

/** found live: git may be absent on minimal CI images — warn, never fail. */
function gitInit(dir: string, io: InitIo): void {
  const inRepo =
    spawnSync("git", ["rev-parse", "--git-dir"], { cwd: dir, stdio: "ignore" }).status === 0;
  if (inRepo) return;
  const result = spawnSync("git", ["init", "--quiet"], { cwd: dir, stdio: "ignore" });
  if (result.status !== 0) {
    io.err("note: git was not found — initialize the repository yourself when convenient\n");
  }
}

function handoff(io: InitIo, name: string, targetWasDot: boolean): void {
  const enter = targetWasDot ? "" : `  cd ${name}\n`;
  io.out(
    `${name} is ready — your knowledge, your repo, yours outright.\n` +
      "\n" +
      "Next (or just tell your coding agent to take it from here):\n" +
      enter +
      "  pnpm install\n" +
      "  pnpm dev        # the site, live at http://localhost:3000\n" +
      "\n" +
      "Start in knowledge/ — AGENTS.md carries the working rules.\n",
  );
}

export function runInit(args: readonly string[], cwd: string, io: InitIo, env: InitEnv): number {
  // init has no flags: the first argument IS the name candidate, so a
  // leading-hyphen typo is a bad name, never silently treated as a flag.
  const word = args[0] ?? null;
  if (word === null) return usage(io);

  const { version, templatesDir } = env;

  // --- target resolution ---------------------------------------------------
  const isDot = word === ".";
  const name = isDot ? path.basename(path.resolve(cwd)) : word;
  if (!isDot && !isValidName(word)) {
    const suggestion = suggestName(word);
    return refuse(io, "bad-name", [
      `"${word}" does not match ^[a-z0-9][a-z0-9-]{0,62}$ — lowercase letters, digits, hyphens.`,
      suggestion !== null ? `try: ksor init ${suggestion}` : "pick a short lowercase name.",
    ]);
  }
  const targetDir = isDot ? path.resolve(cwd) : path.resolve(cwd, word);

  // --- ancestor checks -----------------------------------------------------
  const ancestorProject = findAncestorProject(isDot ? path.dirname(targetDir) : cwd);
  if (ancestorProject !== null) {
    return refuse(io, "nested", [
      `an existing ksor project owns this path: ${ancestorProject}`,
      "a corpus lives inside exactly one project — create the new one outside it.",
    ]);
  }
  const ancestorWorkspace = findAncestorWorkspace(targetDir);
  if (ancestorWorkspace !== null) {
    io.err(
      `warning: parent pnpm workspace at ${ancestorWorkspace} — its globs may enroll this\n` +
        "project's packages into the parent install. Exclude it there if builds misbehave.\n",
    );
  }

  // --- target state --------------------------------------------------------
  if (isDot) {
    const contents = existsSync(targetDir)
      ? readdirSync(targetDir).filter((e) => e !== ".git")
      : [];
    if (contents.length > 0) {
      return refuse(io, "blocked", [
        `the current directory is not empty (${contents.length} entr${contents.length === 1 ? "y" : "ies"}).`,
        "run `ksor init .` in an empty directory, or `ksor init <name>` to create one.",
      ]);
    }
  } else if (existsSync(targetDir)) {
    return refuse(io, "exists", [
      `${word}/ already exists here.`,
      `pick another name, or remove ${word}/ first if it is disposable.`,
    ]);
  }

  // --- materialize (atomic for the named form) -----------------------------
  if (isDot) {
    // found live: rename-over cannot apply to an existing cwd — ordered
    // writes into the (verified empty) directory are the documented fallback.
    materialize(templatesDir, targetDir, { name, version });
  } else {
    const stage = mkdtempSync(path.join(path.dirname(targetDir), ".ksor-init-"));
    try {
      materialize(templatesDir, stage, { name, version });
      renameSync(stage, targetDir);
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }

  gitInit(targetDir, io);
  handoff(io, name, isDot);
  return 0;
}
