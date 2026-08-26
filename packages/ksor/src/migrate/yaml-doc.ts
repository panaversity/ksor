/**
 * Frontmatter surgery that keeps the author's comments.
 *
 * The obvious implementation — parse to plain data, map, stringify — throws
 * every comment away, and the scaffold's own `instance.md` is mostly comments:
 * the commented-out `database:` block IS the instruction for climbing to the
 * served rung. A migration that silently deleted it would take the adopter's
 * documentation with it, so this works on `yaml`'s document AST instead and
 * only ever adds, removes and reorders keys.
 */
import { Document, isMap, isPair, isSeq, parseDocument, type Pair, type YAMLMap } from "yaml";

const PARSE = { schema: "core", uniqueKeys: true, logLevel: "silent" } as const;
const RENDER = { lineWidth: 0, flowCollectionPadding: false } as const;

export type Frontmatter = Document.Parsed | Document;

/** null when the block is not one plain YAML mapping — the caller refuses instead of guessing. */
export function parseFrontmatterDoc(block: string): Frontmatter | null {
  const doc = parseDocument(block, PARSE);
  if (doc.errors.length > 0) return null;
  if (doc.contents === null) return new Document({});
  return isMap(doc.contents) ? doc : null;
}

export function emptyFrontmatterDoc(): Frontmatter {
  return new Document({});
}

function items(doc: Frontmatter): Pair[] {
  return isMap(doc.contents) ? (doc.contents.items as Pair[]) : [];
}

export function keyOf(pair: Pair): string {
  const key: unknown = pair.key;
  if (key !== null && typeof key === "object" && "value" in key) {
    return String((key as { value: unknown }).value);
  }
  return String(key);
}

export function keys(doc: Frontmatter): string[] {
  return items(doc).map(keyOf);
}

/** Move `order`'s keys to the front, in that order; everything else keeps its relative place. */
export function reorder(doc: Frontmatter, order: readonly string[]): void {
  if (!isMap(doc.contents)) return;
  const all = items(doc);
  const ranked = order.flatMap((k) => all.filter((i) => keyOf(i) === k));
  const rest = all.filter((i) => !order.includes(keyOf(i)));
  (doc.contents as YAMLMap).items = [...ranked, ...rest];
}

/** Render as a `---` fenced block plus the body, exactly as a document is stored. */
export function renderDocument(doc: Frontmatter, body: string): string {
  const yaml = keys(doc).length === 0 && doc.comment == null ? "" : doc.toString(RENDER);
  return `---\n${yaml}---\n${body}`;
}

/**
 * Set a key to plain data AS NODES. `Document.set` stores a raw JS value
 * untouched, so nothing nested inside it can be addressed or styled afterwards
 * — `setFlow` silently did nothing until this existed.
 */
export function setValue(doc: Frontmatter, key: string, value: unknown): void {
  doc.set(key, doc.createNode(value));
}

/** Flow style for the short collections the profile's own examples write inline. */
export function setFlow(doc: Frontmatter, path: readonly string[]): void {
  const node: unknown = doc.getIn(path, true);
  if (isMap(node) || isSeq(node)) node.flow = true;
}

/** The value at `path` as plain data, or undefined. */
export function plain(doc: Frontmatter, path: readonly string[]): unknown {
  const node: unknown = doc.getIn(path, false);
  return node === null ? undefined : node;
}

/** Keep the pair NODE (comments and all) while moving it under a new key. */
export function movePair(doc: Frontmatter, from: string, to: string): boolean {
  const pair = items(doc).find((i) => keyOf(i) === from);
  if (pair === undefined || !isPair(pair)) return false;
  doc.delete(from);
  doc.set(to, pair.value);
  return true;
}
