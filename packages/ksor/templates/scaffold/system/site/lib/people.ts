/**
 * Natural names for the actors this record cites — the site's phone book.
 *
 * ONE-WAY RULE. Names go in, handles come out. Never the reverse. The intake
 * and add-sources skills write to `.ksor/people.yaml`; the owner never edits
 * that file by hand. Here the site reads it once at module load and turns a
 * stored handle into the natural name to print.
 *
 * If a handle appears in the record and this file does not list it, the site
 * prints the raw handle unchanged (`human:xyz`) — the same as before this
 * module existed. No guessing, no splitting, no auto-formatting. The owner is
 * the only source of a display name; the tooling asks for one at the next
 * governance moment.
 *
 * Loaded synchronously with `readFileSync` because governance is a server
 * component: the file is on disk when the build runs, and reading it once at
 * import is cheaper than plumbing an async load through every render.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";

/** Where the phone book lives, relative to the site's cwd (repo root). */
const PEOPLE_YAML = join(process.cwd(), ".ksor", "people.yaml");

function loadPeople(): readonly string[] {
  let text: string;
  try {
    text = readFileSync(PEOPLE_YAML, "utf8");
  } catch {
    // The file is optional; its absence means "no natural names declared".
    return [];
  }
  try {
    const docs = parseAllDocuments(text.replace(/^\uFEFF/, ""), {
      schema: "core",
      uniqueKeys: true,
      logLevel: "silent",
    });
    const value = docs[0]?.toJS();
    if (value === null || typeof value !== "object") return [];
    const list = (value as { people?: unknown }).people;
    if (!Array.isArray(list)) return [];
    return list.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  } catch {
    return [];
  }
}

/**
 * The natural names this record has declared, in the order the file lists
 * them. Frozen at module load: the file is authored, not runtime state.
 */
export const PEOPLE: readonly string[] = loadPeople();

/**
 * The natural name for a handle, or null if the handle isn't listed. The
 * derivation is `name.replace(/\s+/g, "").toLowerCase()` — the same rule the
 * skills use when writing the handle into frontmatter, so a name typed once by
 * the owner matches the handle stored everywhere else.
 */
export function naturalize(handle: string): string | null {
  const target = handle.toLowerCase();
  for (const name of PEOPLE) {
    if (name.replace(/\s+/g, "").toLowerCase() === target) return name;
  }
  return null;
}
