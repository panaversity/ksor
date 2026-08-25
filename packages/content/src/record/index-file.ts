/**
 * The generated `index.md`, one per directory, in OKF §8 form (build spec §1
 * step 1): a heading, then one bullet per child — concepts and folders in ONE
 * reading order. Nothing here is authored — an index carries no governance, so
 * anything written into one would be ungoverned knowledge on a served surface
 * (research/okf-native.md §2 item 4). Every projection regenerates its indexes
 * from the tree it was filtered to, so this function must be a pure function of
 * that tree.
 *
 * The bullet order IS the site's reading order: `readingOrder` walks these
 * bullets and every human surface ranks by that walk. So the order here and the
 * order `ingest/adapters/plain-tree.ts` gives the MCP door's `outline` are one
 * guarantee with two implementations — decision 18 — and both are asserted
 * against `ORDER_CASES` through `lib/order-rule.ts`. They used to differ twice:
 * folder bullets were all emitted AFTER the concept bullets (so nothing ever
 * interleaved), and concept ties broke on the TITLE while the door broke them
 * on the filename, which reordered every record that declares no `order:` at
 * all. Both are gone; `compareSiblings` decides here as it does there.
 */
import { compareSiblings, folderOrder, tieKey, UNORDERED } from "../lib/order-rule.js";

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

/** One child of a directory, as the sort sees it: a concept bullet or a folder bullet. */
interface Child {
  readonly order: number;
  readonly tie: string;
  readonly line: string;
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
  // The shape `folderOrder` folds over: one directory, the orders of the
  // concepts sitting directly in it.
  const ordersByDir: (readonly [string, readonly number[]])[] = [...byDir].map(
    ([d, cs]) => [d, cs.map(orderOf)] as const,
  );

  const out = new Map<string, string>();
  for (const dir of populated) {
    if (dir !== "" && !dirs.has(dir)) continue;
    const children: Child[] = [];
    for (const c of byDir.get(dir) ?? []) {
      const name = baseOf(c.id);
      children.push({
        order: orderOf(c),
        tie: tieKey(`${name}.md`),
        line: `* [${c.title}](${name}.md) - ${c.description}`,
      });
    }
    for (const d of populated) {
      if (d === "" || dirOf(d) !== dir) continue;
      const name = d.slice(dir === "" ? 0 : dir.length + 1);
      children.push({
        order: folderOrder(ordersByDir, d),
        tie: tieKey(name),
        line: `* [${humanise(name)}](${name}/)`,
      });
    }
    children.sort(compareSiblings);

    const lines = [
      `# ${dir === "" ? input.title : humanise(dir.slice(dir.lastIndexOf("/") + 1))}`,
      "",
      ...children.map((c) => c.line),
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

function dirOf(id: string): string {
  const at = id.lastIndexOf("/");
  return at === -1 ? "" : id.slice(0, at);
}

function baseOf(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
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
