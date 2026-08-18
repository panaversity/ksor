import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The record, read directly. This shell derives everything it publishes —
 * names, order, the llms surfaces — from the same bytes the reference shell
 * reads, with no framework between: the surface contract binds to the record,
 * not to a loader API.
 */

export interface RecordDoc {
  /** Repo-relative under knowledge/, forward slashes, e.g. "hr/pay.md". */
  readonly file: string;
  /** Site route without base path or trailing slash, e.g. "/docs/hr/pay". */
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  /** `order:` governed key; missing or non-numeric sorts last. */
  readonly order: number;
  readonly body: string;
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function frontmatterValue(block: string, key: string): string | null {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(block);
  if (match?.[1] === undefined) return null;
  const raw = match[1].trim();
  const unquoted = /^(['"])(.*)\1$/.exec(raw);
  return (unquoted ? unquoted[2] : raw) ?? null;
}

function toOrder(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function walk(dir: string, prefix: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : entry.name.endsWith(".md")
          ? [`${prefix}${entry.name}`]
          : [],
    );
}

function toUrl(file: string): string {
  const noExt = file.slice(0, -".md".length);
  const slug =
    noExt === "index" ? "" : noExt.endsWith("/index") ? noExt.slice(0, -"/index".length) : noExt;
  return slug === "" ? "/docs" : `/docs/${slug}`;
}

/** Every document, in the one reading order the sidebar and llms.txt share. */
export function readRecord(knowledgeDir: string): RecordDoc[] {
  const docs = walk(knowledgeDir, "").map((file): RecordDoc => {
    const text = fs.readFileSync(path.join(knowledgeDir, file), "utf8");
    const block = FRONTMATTER.exec(text)?.[1] ?? "";
    return {
      file,
      url: toUrl(file),
      title: frontmatterValue(block, "title") ?? file,
      description: frontmatterValue(block, "description"),
      order: toOrder(frontmatterValue(block, "order")),
      body: text.replace(FRONTMATTER, "").trim(),
    };
  });
  // The canonical reading order, recursively per folder — the same semantics
  // as the reference shell's sorted page tree, so both surfaces read one
  // truth: at every level, declared orders first (a folder takes its index
  // page's order), ties broken on the url by codepoint; a folder flattens as
  // its index page, then its sorted children (found live 2026-08-18: a flat
  // approximation diverged from the reference shell on same-prefix names and
  // on nested orders).
  return sortDocs(docs);
}

interface Level {
  readonly files: RecordDoc[];
  readonly dirs: Map<string, Level>;
}

function insert(level: Level, doc: RecordDoc, rest: string): void {
  const slash = rest.indexOf("/");
  if (slash === -1) {
    level.files.push(doc);
    return;
  }
  const dir = rest.slice(0, slash);
  let child = level.dirs.get(dir);
  if (!child) {
    child = { files: [], dirs: new Map() };
    level.dirs.set(dir, child);
  }
  insert(child, doc, rest.slice(slash + 1));
}

function flatten(level: Level, prefix: string): RecordDoc[] {
  type Item = { order: number; url: string; docs: () => RecordDoc[] };
  const items: Item[] = [];
  for (const doc of level.files) {
    items.push({ order: doc.order, url: doc.url, docs: () => [doc] });
  }
  for (const [dir, child] of level.dirs) {
    const url = `${prefix}/${dir}`;
    const index = child.files.find((doc) => doc.file.endsWith("/index.md"));
    items.push({
      order: index?.order ?? Number.POSITIVE_INFINITY,
      url,
      docs: () => {
        const rest: Level = {
          files: child.files.filter((doc) => doc !== index),
          dirs: child.dirs,
        };
        return [...(index ? [index] : []), ...flatten(rest, url)];
      },
    });
  }
  items.sort((a, b) => {
    if (a.order !== b.order) return a.order < b.order ? -1 : 1;
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  });
  return items.flatMap((item) => item.docs());
}

function sortDocs(docs: readonly RecordDoc[]): RecordDoc[] {
  const root: Level = { files: [], dirs: new Map() };
  for (const doc of docs) insert(root, doc, doc.file);
  return flatten(root, "/docs");
}

/** The instance name from instance.md — the identity every surface leads with. */
export function instanceName(repoRoot: string): string {
  const text = fs.readFileSync(path.join(repoRoot, "instance.md"), "utf8");
  const block = FRONTMATTER.exec(text)?.[1] ?? "";
  return frontmatterValue(block, "name") ?? "knowledge";
}

/** llms.txt: `# <name>`, then one link per document in reading order. */
export function llmsIndex(name: string, docs: readonly RecordDoc[], base: string): string {
  const lines = docs.map((doc) => {
    const link = `- [${doc.title}](${base}${doc.url})`;
    return doc.description ? `${link}: ${doc.description}` : link;
  });
  return `# ${name}\n\n${lines.join("\n")}\n`;
}

/** llms-full.txt: every document's title, address, and body. */
export function llmsFull(docs: readonly RecordDoc[], base: string): string {
  return docs.map((doc) => `# ${doc.title} (${base}${doc.url})\n\n${doc.body}`).join("\n\n");
}
