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
  // Directory groups stay together (sort by the path segments), explicit
  // orders first within each group, ties keeping path order — the same
  // semantics the reference shell's sorted page tree applies.
  return sortDocs(docs);
}

function sortDocs(docs: readonly RecordDoc[]): RecordDoc[] {
  const groupOrder = new Map<string, number>();
  for (const doc of docs) {
    const dir = doc.file.includes("/") ? doc.file.slice(0, doc.file.indexOf("/")) : "";
    const indexLike =
      dir === "" ? doc.order : doc.file === `${dir}/index.md` ? doc.order : undefined;
    if (indexLike !== undefined && !groupOrder.has(dir)) groupOrder.set(dir, indexLike);
  }
  const key = (doc: RecordDoc): [number, number, string] => {
    const dir = doc.file.includes("/") ? doc.file.slice(0, doc.file.indexOf("/")) : "";
    const group = dir === "" ? doc.order : (groupOrder.get(dir) ?? Number.POSITIVE_INFINITY);
    return [group, doc.order, doc.file];
  };
  return [...docs].sort((a, b) => {
    const [ga, oa, fa] = key(a);
    const [gb, ob, fb] = key(b);
    if (ga !== gb) return ga < gb ? -1 : 1;
    if (oa !== ob) return oa < ob ? -1 : 1;
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
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
