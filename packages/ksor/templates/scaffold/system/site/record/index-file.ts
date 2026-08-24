/**
 * The generated `index.md`, one per directory, in OKF §8 form (build spec §1
 * step 1): a heading, concept bullets, folder bullets. Nothing here is
 * authored — an index carries no governance, so anything written into one
 * would be ungoverned knowledge on a served surface (research/okf-native.md
 * §2 item 4). Every projection regenerates its indexes from the tree it was
 * filtered to, so this function must be a pure function of that tree.
 */
import { UNORDERED } from "../lib/order-rule.js";

export interface IndexConcept {
  /** Bundle-relative id (path without `.md`). */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly order: number | null;
}

export interface IndexInput {
  /** The instance title — the root index's heading. */
  readonly title: string;
  readonly concepts: readonly IndexConcept[];
  /** Every bundle-relative directory the walker found, empty ones included. */
  readonly dirs: readonly string[];
}

/** A subdirectory bullet: `Name`, and the lowest order among the folder's concepts. */
interface Folder {
  readonly name: string;
  readonly minOrder: number;
}

/** Bundle-relative index path (`index.md`, `surfaces/index.md`) → bytes. Empty directories are absent. */
export function generateIndexes(input: IndexInput): Map<string, string> {
  const byDir = new Map<string, IndexConcept[]>();
  for (const c of input.concepts) {
    const dir = dirOf(c.id);
    byDir.set(dir, [...(byDir.get(dir) ?? []), c]);
  }
  // A directory earns an index when a concept lives anywhere beneath it.
  const populated = new Set<string>([""]);
  for (const dir of byDir.keys()) {
    for (let d = dir; d !== ""; d = dirOf(d)) populated.add(d);
  }
  const dirs = new Set(input.dirs);

  const out = new Map<string, string>();
  for (const dir of populated) {
    if (dir !== "" && !dirs.has(dir)) continue;
    const concepts = [...(byDir.get(dir) ?? [])].sort(
      (a, b) => orderOf(a) - orderOf(b) || compare(a.title, b.title),
    );
    const folders: Folder[] = [...populated]
      .filter((d) => d !== "" && dirOf(d) === dir)
      .map((d) => ({
        name: d.slice(dir === "" ? 0 : dir.length + 1),
        minOrder: minOrder(byDir, d),
      }))
      .sort((a, b) => a.minOrder - b.minOrder || compare(a.name, b.name));

    const lines = [
      `# ${dir === "" ? input.title : humanise(dir.slice(dir.lastIndexOf("/") + 1))}`,
      "",
      ...concepts.map((c) => `* [${c.title}](${baseOf(c.id)}.md) - ${c.description}`),
      ...folders.map((f) => `* [${humanise(f.name)}](${f.name}/)`),
    ];
    const body = `${lines.join("\n")}\n`;
    out.set(
      dir === "" ? "index.md" : `${dir}/index.md`,
      dir === "" ? `${ROOT_FRONTMATTER}${body}` : body,
    );
  }
  return out;
}

const ROOT_FRONTMATTER = '---\nokf_version: "0.2"\n---\n\n';

/** `purchase-policies` → `Purchase policies`. */
export function humanise(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function orderOf(c: IndexConcept): number {
  return c.order ?? UNORDERED;
}

/** Lowest order among the concepts anywhere beneath `dir` — a folder sorts where its first concept does. */
function minOrder(byDir: ReadonlyMap<string, readonly IndexConcept[]>, dir: string): number {
  let min = UNORDERED;
  for (const [d, concepts] of byDir) {
    if (d !== dir && !d.startsWith(`${dir}/`)) continue;
    for (const c of concepts) min = Math.min(min, orderOf(c));
  }
  return min;
}

function dirOf(id: string): string {
  const at = id.lastIndexOf("/");
  return at === -1 ? "" : id.slice(0, at);
}

function baseOf(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface IndexEntry {
  readonly heading: string;
  readonly title: string;
  readonly href: string;
  readonly description: string | null;
}

/**
 * The parse side of §8 — what any consumer, ours or a bare OKF reader, gets
 * from an index: each bullet with the heading it sits under. Tolerates both
 * bullet markers, an optional root frontmatter, and a missing description.
 */
export function parseIndex(text: string): IndexEntry[] {
  const body = text.startsWith("---\n") ? text.slice(text.indexOf("\n---\n") + 5) : text;
  const entries: IndexEntry[] = [];
  let heading = "";
  for (const line of body.split("\n")) {
    const h = /^#\s+(.+?)\s*$/.exec(line);
    if (h !== null) {
      heading = h[1] ?? "";
      continue;
    }
    const b = /^[*-]\s+\[(.+)\]\(([^)\s]+)\)(?:\s+-\s+(.*))?\s*$/.exec(line);
    if (b !== null) {
      entries.push({ heading, title: b[1] ?? "", href: b[2] ?? "", description: b[3] ?? null });
    }
  }
  return entries;
}
