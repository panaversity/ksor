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
  // The empty case is checked before Number(), not after: `Number("")` is 0, so
  // a bare `order:` with nothing after it declared position ZERO and jumped the
  // document to the top of its level — while the reference shell read the same
  // frontmatter as "no order declared" and sorted it last. Two shells, one
  // record, two reading orders, and nothing said so (confirmed live
  // 2026-08-18). An absent value is an absent declaration.
  if (raw === null || raw.trim() === "") return Number.POSITIVE_INFINITY;
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
  type Item = { order: number; url: string; docs: RecordDoc[] };
  const items: Item[] = [];
  for (const doc of level.files) {
    items.push({ order: doc.order, url: doc.url, docs: [doc] });
  }
  for (const [dir, child] of level.dirs) {
    const url = `${prefix}/${dir}`;
    const index = child.files.find((doc) => doc.file.endsWith("/index.md"));
    const rest: Level = {
      files: child.files.filter((doc) => doc !== index),
      dirs: child.dirs,
    };
    const docs = [...(index ? [index] : []), ...flatten(rest, url)];
    items.push({
      order: index?.order ?? Number.POSITIVE_INFINITY,
      // An index-less folder ties on its first document's url, exactly as
      // the reference shell's tree does — tying on the folder path put
      // `hr/` and `hr-notes.md` in different orders per shell (review
      // finding, 2026-08-18).
      url: index?.url ?? docs[0]?.url ?? url,
      docs,
    });
  }
  items.sort((a, b) => {
    if (a.order !== b.order) return a.order < b.order ? -1 : 1;
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  });
  return items.flatMap((item) => item.docs);
}

function sortDocs(docs: readonly RecordDoc[]): RecordDoc[] {
  const root: Level = { files: [], dirs: new Map() };
  for (const doc of docs) insert(root, doc, doc.file);
  return flatten(root, "/docs");
}

/**
 * The instance name from instance.md — the identity every surface leads with:
 * the site title, the navbar brand, the home page's headline, the first line of
 * llms.txt.
 *
 * Both failures refuse rather than improvise. A missing file used to throw a
 * raw ENOENT out of config load — a stack trace naming `readFileSync`, which
 * tells an adopter nothing about what the file is for; a missing `name:` used
 * to fall back to the literal "knowledge", which is worse, because the site
 * builds green and publishes somebody else's identity. Identity is not a thing
 * to guess at (confirmed live 2026-08-18).
 */
export function instanceName(repoRoot: string): string {
  const file = path.join(repoRoot, "instance.md");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `instance.md not found at ${file}.\n` +
        "It is the project's identity — its name is the site title, the navbar " +
        "brand and the first line of llms.txt, and the shell will not invent one.\n" +
        "Fix: run `pnpm check` at the repo root, which reports what the record is missing.",
    );
  }
  const block = FRONTMATTER.exec(text)?.[1] ?? "";
  const name = frontmatterValue(block, "name");
  if (name === null || name === "") {
    throw new Error(
      `instance.md has no \`name:\` in its frontmatter (${file}).\n` +
        "It is the project's identity — its name is the site title, the navbar " +
        "brand and the first line of llms.txt, and the shell will not invent one.\n" +
        "Fix: add `name: <your project>` to the frontmatter, then `pnpm check`.",
    );
  }
  return name;
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
