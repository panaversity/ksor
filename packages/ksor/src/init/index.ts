import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { type ExitCode, exitCodes } from "../index.js";
import { errnoCode, isEnvironmentError } from "./errors.js";
import { materialize } from "./materialize.js";
import { nameProblem, suggestName } from "./name.js";
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

const STAGE_PREFIX = ".ksor-init-";

const GRAMMAR = "^[a-z0-9][a-z0-9-]{0,62}$";

function fail(io: InitIo, slug: string, lines: readonly string[], code: ExitCode): number {
  io.err(`error: ${slug}\n${lines.join("\n")}\n`);
  return code;
}

function refuse(io: InitIo, slug: string, lines: readonly string[]): number {
  return fail(io, slug, lines, exitCodes.refused);
}

function refuseExists(io: InitIo, word: string): number {
  return refuse(io, "exists", [
    `${word}/ already exists here.`,
    `pick another name, or remove ${word}/ first if it is disposable.`,
  ]);
}

function usage(io: InitIo): number {
  io.out(
    "ksor init <name>   create a new Knowledge System of Record in ./<name>\n" +
      "ksor init .        scaffold into the current directory (must be empty)\n" +
      "\n" +
      "Nothing was scaffolded: bare `ksor init` never writes — an unattended\n" +
      "agent must not scaffold into an unknown directory by accident.\n" +
      `The name must match ${GRAMMAR} (e.g. accounting-sor).\n`,
  );
  return 0;
}

/**
 * Spec: stale stage dirs are reported, never deleted — they may hold work.
 *
 * Reported only once this run has written its own tree: a note ahead of a
 * refusal would take the first stderr line, which belongs to the slug (found
 * live: 25 concurrent init pairs, where the loser's refusal was pushed to line
 * two by a note about the winner's live stage — 2026-08-18).
 */
function noteStaleStages(dir: string, io: InitIo): void {
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith(STAGE_PREFIX)) {
      io.err(`note: found ${entry} — left by an interrupted init; inspect and remove it\n`);
    }
  }
}

/** Undo a half-written tree, children before parents. */
function rollback(created: readonly string[]): void {
  for (const target of [...created].reverse()) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      // Best effort: the failure that triggered the rollback is the one the
      // operator must see, so a stubborn path never replaces it.
    }
  }
}

/** found live: git may be absent on minimal CI images — warn, never fail. */
function gitInit(dir: string, io: InitIo): void {
  const inRepo =
    spawnSync("git", ["rev-parse", "--git-dir"], { cwd: dir, stdio: "ignore" }).status === 0;
  if (inRepo) return;
  const result = spawnSync("git", ["init", "--quiet"], {
    cwd: dir,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    io.err(
      errnoCode(result.error) === "ENOENT"
        ? "note: git was not found — initialize the repository yourself when convenient\n"
        : `note: git init failed: ${result.error.message}\n`,
    );
    return;
  }
  if (result.status !== 0) {
    // found live: a git that exists but fails — corrupt GIT_CONFIG_GLOBAL, no
    // disk space — was reported as "git was not found", sending the operator
    // to install software they already had (attack run, 2026-08-18).
    const detail = (result.stderr ?? "").trim().split("\n")[0] || `git exited ${result.status}`;
    io.err(`note: git init failed: ${detail}\n`);
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
      "no pnpm? run: npm install -g pnpm — or `corepack enable pnpm` on Nodes that bundle corepack\n" +
      "\n" +
      "Start in knowledge/ — AGENTS.md carries the working rules.\n",
  );
}

function init(args: readonly string[], cwd: string, io: InitIo, env: InitEnv): number {
  const { version, templatesDir } = env;

  // A missing template tree is not something a better command can fix, so it
  // is answered before any argument is judged.
  if (!existsSync(templatesDir)) {
    return fail(
      io,
      "broken-install",
      [
        `the ksor package is missing its templates: ${templatesDir}`,
        "reinstall it — `pnpm add -D @panaversity/ksor`, or `npm i -g @panaversity/ksor`.",
      ],
      exitCodes.environment,
    );
  }

  // init has no flags: the first argument IS the name candidate, so a
  // leading-hyphen typo is a bad name, never silently treated as a flag.
  const word = args[0] ?? null;
  if (word === null) return usage(io);

  if (args.length > 1) {
    // found live: `ksor init my sor` scaffolded ./my and dropped the rest in
    // silence — an unattended agent had no way to know (attack run, 2026-08-18).
    const joined = suggestName(args.join("-"));
    return refuse(io, "bad-name", [
      `a project name is one word — ${args.length} were given: ${args.join(" ")}`,
      joined !== null
        ? `try: ksor init ${joined}`
        : `pick a short name matching ${GRAMMAR}: ksor init <name>.`,
    ]);
  }

  // --- target resolution ---------------------------------------------------
  const isDot = word === ".";
  const targetDir = isDot ? path.resolve(cwd) : path.resolve(cwd, word);
  // The dot form takes its name from the directory, and that name is stamped
  // into instance.md as the future `ksor://<name>/` authority — so the grammar
  // binds it exactly as it binds a typed name (found live: a directory named
  // `My Project` scaffolded an unusable identity, and one holding a double
  // quote wrote invalid JSON, both exiting 0 — attack run, 2026-08-18).
  const name = isDot ? path.basename(targetDir) : word;
  const problem = nameProblem(name);
  if (problem !== null) {
    const reason =
      problem === "windows-reserved"
        ? "Windows reserves it as a device name, so no directory can carry it there"
        : `it must match ${GRAMMAR} — lowercase letters, digits, hyphens`;
    const suggestion = suggestName(name);
    return refuse(
      io,
      "bad-name",
      isDot
        ? [
            `\`ksor init .\` takes the project name from this directory, and "${name}" cannot be one: ${reason}.`,
            suggestion !== null
              ? `run \`ksor init ${suggestion}\` from the parent directory, or rename this directory first.`
              : "rename this directory to lowercase letters, digits and hyphens, then re-run.",
          ]
        : [
            `"${name}" is not a usable project name: ${reason}.`,
            suggestion !== null ? `try: ksor init ${suggestion}` : "pick a short lowercase name.",
          ],
    );
  }

  // --- ancestor checks -----------------------------------------------------
  const ancestorProject = findAncestorProject(isDot ? path.dirname(targetDir) : cwd);
  if (ancestorProject !== null) {
    return refuse(io, "nested", [
      `an existing ksor project owns this path: ${ancestorProject}`,
      "a corpus lives inside exactly one project — create the new one outside it.",
    ]);
  }

  // --- target state --------------------------------------------------------
  if (isDot) {
    const contents = existsSync(targetDir)
      ? readdirSync(targetDir)
          .filter((e) => e !== ".git")
          .sort()
      : [];
    if (contents.length > 0) {
      // found live: "not empty (1 entry)" over a hidden .DS_Store told the
      // operator nothing they could act on (attack run, 2026-08-18).
      const listed = contents.slice(0, 5).join(", ") + (contents.length > 5 ? ", …" : "");
      return refuse(io, "blocked", [
        `the current directory is not empty (${contents.length} entr${contents.length === 1 ? "y" : "ies"}: ${listed}).`,
        "run `ksor init .` in an empty directory, or `ksor init <name>` to create one.",
      ]);
    }
  } else if (existsSync(targetDir)) {
    return refuseExists(io, word);
  }

  // Deferred until the project exists: a run that fails LATER (a rename
  // race, a full disk) must still put its slug on stderr line 1 (review
  // finding, 2026-08-18 — the warning beat `error: environment` to it).
  const ancestorWorkspace = findAncestorWorkspace(targetDir);

  // --- materialize (atomic for the named form) -----------------------------
  if (isDot) {
    // found live: rename-over cannot apply to an existing cwd — ordered
    // writes into the (verified empty) directory are the documented fallback,
    // which makes the rollback the spec promises ours to perform.
    const created: string[] = [];
    try {
      materialize(templatesDir, targetDir, { name, version }, created);
    } catch (error) {
      rollback(created);
      throw error;
    }
  } else {
    const stage = mkdtempSync(path.join(path.dirname(targetDir), STAGE_PREFIX));
    try {
      materialize(templatesDir, stage, { name, version });
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      throw error;
    }
    try {
      renameSync(stage, targetDir);
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      // found live: the loser of two concurrent inits lands here, not on the
      // existsSync check above — the winner created the directory in between,
      // and the loser died with a raw ENOTEMPTY stack (attack run, 2026-08-18).
      const code = errnoCode(error);
      if (code === "ENOTEMPTY" || code === "EEXIST" || code === "EPERM") {
        return refuseExists(io, word);
      }
      throw error;
    }
  }

  // From here the project exists: nothing below may surface as a failed init.
  // The mode fix, the courtesy note and git are best-effort; only the
  // handoff must print.
  try {
    if (ancestorWorkspace !== null) {
      io.err(
        `warning: parent pnpm workspace at ${ancestorWorkspace} — its globs may enroll this\n` +
          "project's packages into the parent install. Exclude it there if builds misbehave.\n",
      );
    }
    if (!isDot) {
      // mkdtempSync creates the stage 0700 for temp-dir privacy and rename
      // carries that onto the project root. Copy the mode materialize's own
      // mkdir got, so both init forms end with the umask's answer — a
      // hardcoded 0755 inverted the mismatch under umask 077 (review
      // findings, 2026-08-18).
      chmodSync(targetDir, statSync(path.join(targetDir, "knowledge")).mode & 0o777);
      noteStaleStages(path.dirname(targetDir), io);
    }
    gitInit(targetDir, io);
  } catch (error) {
    if (!isEnvironmentError(error)) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    io.err(`note: the project was created, but a follow-up step failed: ${detail}\n`);
  }
  handoff(io, name, isDot);
  return 0;
}

export function runInit(args: readonly string[], cwd: string, io: InitIo, env: InitEnv): number {
  try {
    return init(args, cwd, io, env);
  } catch (error) {
    // The exit-code contract promises 3 for an environment that cannot run the
    // command; without this, a full disk or a read-only mount printed a Node
    // stack and exited 1 — "refused", which blames the operator's input.
    if (!isEnvironmentError(error)) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    return fail(
      io,
      "environment",
      [`the filesystem refused: ${detail}`, "fix the environment and re-run — nothing was kept."],
      exitCodes.environment,
    );
  }
}
