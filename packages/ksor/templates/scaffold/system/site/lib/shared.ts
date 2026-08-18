import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

function readInstanceName(): string {
  const text = readFileSync(findInstance(process.cwd()), "utf8");
  // Only the frontmatter block: body prose mentioning `name:` must never
  // become the site's identity (review finding, 2026-08-18).
  const block = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const raw = /^name:[ \t]*(.*)$/m.exec(block)?.[1]?.trim() ?? "";
  const unquoted = /^(['"])(.*)\1$/.exec(raw);
  const name = unquoted?.[2] ?? raw;
  if (name === "") {
    throw new Error("instance.md carries no name: — it is the project's identity; run pnpm check.");
  }
  return name;
}

export const appName: string = readInstanceName();
