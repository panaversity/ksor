import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { governanceVisible } from "./governance";

// The record's one identity source: instance.md's `name:` — the same file
// every other shell reads, so renaming the instance renames every surface
// at the next build, and no shell carries a baked-in copy (found live
// 2026-08-18: a stamped constant survived a restore-from-templates as the
// literal placeholder name, with every gate green).
function findInstance(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, "instance.md");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "instance.md not found — it is the project's identity; build from the project (pnpm dev / pnpm build at the repo root).",
  );
}

/**
 * instance.md's frontmatter block — the configuration every surface reads
 * (identity here, the audience model in lib/audience.ts). Only this block:
 * body prose that looks like a key must never become configuration (review
 * finding, 2026-08-18).
 */
export function instanceFrontmatter(): string {
  const text = readFileSync(findInstance(process.cwd()), "utf8");
  // The checker's boundary exactly: BOM stripped, CRLF normalized, lax close.
  const normalized = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  return /^---\n([\s\S]*?)\n---/.exec(normalized)?.[1] ?? "";
}

function readInstanceName(): string {
  const raw = /^name:[ \t]*(.*)$/m.exec(instanceFrontmatter())?.[1]?.trim() ?? "";
  const unquoted = /^(['"])(.*)\1$/.exec(raw);
  const name = unquoted?.[2] ?? raw;
  if (name === "") {
    throw new Error("instance.md carries no name: — it is the project's identity; run pnpm check.");
  }
  return name;
}

export const appName: string = readInstanceName();

/**
 * The record's DISPLAY TITLE: instance.md's first body heading. The slug in
 * `name:` is the machine identity (llms.txt, future citations); the H1 is
 * the human name every page leads with. A fresh scaffold reads "Knowledge
 * System of Record" until the intake interview writes the real one.
 */
function readInstanceTitle(): string {
  const text = readFileSync(findInstance(process.cwd()), "utf8");
  const body = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, "");
  return /^#[ \t]+(.+)$/m.exec(body)?.[1]?.trim() ?? appName;
}

export const appTitle: string = readInstanceTitle();

/**
 * Whether the pages show the governance each document declares
 * (`site.governance` in instance.md, default on). Read once at build/server
 * start, like the identity above — restart `pnpm dev` after changing it.
 */
export const showGovernance: boolean = governanceVisible(instanceFrontmatter());
