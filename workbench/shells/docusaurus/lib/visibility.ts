import * as fs from "node:fs";
import * as path from "node:path";

import { FRONTMATTER, frontmatterValue } from "./record";

/**
 * Visibility, enforced by STAGING — never by filtering in process.
 *
 * `instance.md` may declare an ordered audience list (least- to
 * most-restricted) and a default; a document's tier is its `visibility:` key
 * or that default. A build for audience A copies the permitted documents —
 * and only the assets those documents reference — into a staged directory,
 * and every reader of the record reads the stage
 * (`specs/ksor/visibility/spec.md`).
 *
 * Why a directory rather than a predicate, measured before the spec existed
 * (research/visibility.md §2–§5):
 *
 * - The obvious Docusaurus filter is itself a leak. Passing the hidden
 *   filenames to the docs plugin's `exclude:` zeroed every canary AND
 *   serialized the exclusion list — with the record's absolute path — into
 *   the client bundle served to every visitor. A correct filter that ships
 *   to the browser is a leak wearing the costume of a fix. Nothing about a
 *   staged-out document reaches the config, so nothing about it can reach
 *   the bundle.
 * - Filtering one reader leaves the others. Filtering only `readRecord()`
 *   produced a clean `llms.txt` — the surface an auditor checks first —
 *   while the document stayed live at its URL and fully indexed in search.
 * - A predicate has bypasses; a directory has none. What is not on disk
 *   cannot be read, by any reader, including the ones nobody counted (six
 *   consumers surfaced in a four-document scaffold).
 *
 * Everything here therefore fails CLOSED. A model that does not parse, a
 * tier that is not declared, an audience nobody declared, a `visibility:`
 * key with no model to interpret it — each refuses the build rather than
 * publishing on a guess. A green build of a leaking site costs a deploy; a
 * refusal costs one message.
 */

/** The access model as `instance.md` declares it. */
export interface AudienceModel {
  /** Declared order, least- to most-restricted; `audiences[0]` is public. */
  readonly audiences: readonly string[];
  /** `default_visibility:` — the tier of a document that declares none. */
  readonly fallback: string;
}

/** What the shell serves this build, decided once and read by everyone. */
export interface AudiencePlan {
  /** The one directory the docs plugin AND readRecord() read. */
  readonly recordDir: string;
  /** Chrome watermark for a build below the least-restricted tier. */
  readonly label: string | null;
}

// Items at ANY indent: YAML allows an unindented block sequence, the
// checker accepts it, and a record the checker blessed must never fail
// this build (review finding, 2026-08-18).
const LIST_ITEM = /^[ \t]*-[ \t]+(.*)$/;
const FLOW_LIST = /^audiences:[ \t]*\[(.*)\][ \t\r]*$/m;

/**
 * Every refusal in this file, in the shape BOTH shells use: a stable slug a
 * pipeline can match on, then the whole remedy. The slugs are shared
 * vocabulary — a record refused here is refused by the reference shell under
 * the same word, so an adopter who swaps shells does not relearn the errors.
 */
function refuse(slug: string, what: string, why: string, fix: string): never {
  throw new Error(`${slug}: ${what}\n  why: ${why}\n  fix: ${fix}`);
}

function unquote(raw: string): string {
  const trimmed = raw.trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return (quoted?.[2] ?? trimmed).trim();
}

/**
 * The audience list, in either YAML shape:
 *
 *     audiences:              audiences: [public, internal]
 *       - public
 *       - internal
 *
 * Both, because the reference shell reads both, and a record that builds on
 * one shell and refuses on the other is the trap `KSOR_BASE_PATH` already
 * taught this file. When neither shape parses, the caller refuses rather than
 * reading it as "no model": reading an unparsed model as absence is the one
 * parse failure that publishes every restricted document in the record.
 */
// A ` #` comment ends an unquoted YAML scalar; reading it as content lost
// the tier or refused the build (review finding, 2026-08-18 — the checker
// already parses this way, and the shells mirror the checker exactly).
function stripComment(value: string): string {
  return /^["']/.test(value.trim()) ? value : value.replace(/\s+#.*$/, "");
}

function readAudienceList(block: string): string[] {
  const flow = FLOW_LIST.exec(block)?.[1];
  if (flow !== undefined)
    return flow
      .split(",")
      .map(stripComment)
      .map(unquote)
      .filter((value) => value !== "");
  const lines = block.split("\n");
  const start = lines.findIndex((line) => /^audiences:[ \t\r]*$/.test(line));
  if (start === -1) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const item = LIST_ITEM.exec(line);
    if (item === null) break;
    const value = unquote(stripComment(item[1] ?? ""));
    if (value !== "") values.push(value);
  }
  return values;
}

/**
 * The declared model, or null when `instance.md` declares none — which is
 * today's behaviour exactly, the feature being purely additive.
 *
 * The key being PRESENT but unparseable is not absence: it refuses.
 */
export function readAudienceModel(repoRoot: string): AudienceModel | null {
  const file = path.join(repoRoot, "instance.md");
  const text = fs.readFileSync(file, "utf8");
  // The frontmatter block only. Body prose that mentions `audiences:` is
  // documentation, and documentation must never become policy.
  const block = FRONTMATTER.exec(text)?.[1] ?? "";
  const declared = /^audiences:/m.test(block);
  const audiences = readAudienceList(block);
  if (!declared) return null;
  if (audiences.length === 0) {
    refuse(
      "ksor-audiences-unreadable",
      `instance.md declares \`audiences:\` but no audience could be read from it (${file})`,
      "an unreadable model reads as no model, and no model publishes every document — the one parse failure that leaks",
      "write the audiences as a list, least-restricted first:\n    audiences:\n      - public\n      - internal",
    );
  }
  // Never dependent on the checker having run: a most-restrictive-first
  // model would make the default build the leak (review finding, 2026-08-18).
  if (audiences[0] !== "public") {
    refuse(
      "ksor-audiences-misordered",
      `audiences: must start with public (it starts with "${audiences[0]}") (${file})`,
      "the list is ordered least- to most-restricted, and an unset KSOR_AUDIENCE builds the FIRST entry — any other first entry makes the default build the leak",
      "reorder audiences: with public first",
    );
  }
  if (new Set(audiences).size !== audiences.length) {
    refuse(
      "ksor-audiences-duplicate",
      `audiences: declares a tier twice (${audiences.join(", ")}) (${file})`,
      "a duplicated tier has two positions in the ordering, and which one a build honours is undefined",
      "remove the duplicate entry",
    );
  }
  const fallback = stripComment(frontmatterValue(block, "default_visibility") ?? "").trim();
  if (fallback === "") {
    refuse(
      "ksor-default-visibility-missing",
      `instance.md declares \`audiences:\` without \`default_visibility:\` (${file})`,
      "there is no safe guess: assuming the widest tier leaks on the first document that forgets the key, assuming the narrowest hides the record",
      `add the tier a document without a visibility: key belongs to, e.g. default_visibility: ${audiences[0]}`,
    );
  }
  if (!audiences.includes(fallback)) {
    refuse(
      "ksor-default-visibility-undeclared",
      `default_visibility: ${fallback} is not one of the declared audiences (${audiences.join(", ")})`,
      "every document without a visibility: key belongs to this tier — a tier no build understands is a record no build can publish honestly",
      `set default_visibility: to one of ${audiences.join(", ")}, or declare ${fallback} in audiences:`,
    );
  }
  return { audiences, fallback };
}

/**
 * The audience this build publishes for.
 *
 * Unset builds the least-restricted tier — the only default that cannot
 * leak, so `pnpm build` keeps working out of the box. An unrecognized value
 * fails the build; it never widens it.
 */
export function buildAudience(model: AudienceModel | null): string {
  const requested = (process.env.KSOR_AUDIENCE ?? "").trim();
  if (model === null) {
    if (requested !== "") {
      refuse(
        "ksor-audiences-not-declared",
        `KSOR_AUDIENCE="${requested}" was requested, but instance.md declares no audiences`,
        "this build would publish every document — a build that cannot filter must never look like one that did",
        "declare the model in instance.md (audiences: + default_visibility:), or build without KSOR_AUDIENCE",
      );
    }
    return "";
  }
  if (requested === "") return model.audiences[0] as string;
  if (!model.audiences.includes(requested)) {
    refuse(
      "ksor-audience-undeclared",
      `KSOR_AUDIENCE="${requested}" is not an audience this record declares (${model.audiences.join(", ")})`,
      "an unrecognized audience could only be honoured by publishing more than the record names — so it refuses instead of widening",
      `build with one of ${model.audiences.join(", ")}, or add "${requested}" to instance.md's audiences: list`,
    );
  }
  return requested;
}

/** Whether a document of this tier belongs in a build for this audience. */
function permits(model: AudienceModel, audience: string, visibility: string | null): boolean {
  // An empty `visibility:` is an ABSENT declaration, not an empty tier — the
  // same reading `order:` gets in lib/record.ts, and for the same reason: two
  // shells reading one key two ways is how a record silently means two things.
  const tier = visibility !== null && visibility.trim() !== "" ? visibility.trim() : model.fallback;
  const rank = model.audiences.indexOf(tier);
  // A tier nobody declared is excluded, never included. `pnpm check` refuses
  // it earlier; the build must not depend on anyone having run it.
  return rank !== -1 && rank <= model.audiences.indexOf(audience);
}

interface KnowledgeDoc {
  /** Path under `knowledge/`, forward slashes. */
  readonly rel: string;
  readonly text: string;
  readonly visibility: string | null;
}

function* documents(dir: string, prefix: string): Generator<KnowledgeDoc> {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      yield* documents(path.join(dir, entry.name), `${rel}/`);
    } else if (entry.name.endsWith(".md")) {
      const text = fs.readFileSync(path.join(dir, entry.name), "utf8");
      const block = FRONTMATTER.exec(text)?.[1] ?? "";
      yield { rel, text, visibility: frontmatterValue(block, "visibility") };
    }
  }
}

/**
 * A `visibility:` key with no model to interpret it refuses the build.
 *
 * Read as "no model, publish everything" — which is what an absent
 * `audiences:` means — a deleted or mistyped model would publish exactly the
 * documents whose author marked them not for publication. The one case where
 * today's behaviour must NOT be today's behaviour.
 */
function refuseUngovernedVisibility(knowledgeDir: string): void {
  for (const doc of documents(knowledgeDir, "")) {
    if (doc.visibility === null || doc.visibility.trim() === "") continue;
    refuse(
      "ksor-visibility-without-audiences",
      `knowledge/${doc.rel} declares \`visibility: ${doc.visibility.trim()}\`, but instance.md declares no audiences`,
      "nothing says what that audience means or which tiers it outranks, so publishing the document anyway is exactly the leak the key exists to prevent",
      "declare the model in instance.md (audiences: + default_visibility:), or remove the visibility: key — `pnpm check` reports both",
    );
  }
}

/**
 * Code is prose about links, never links — the checker's rule, and its exact
 * implementation: fenced blocks, indented blocks (except where the indent
 * starts a list item, which is content carrying real links), and inline spans
 * per PARAGRAPH, because a document-wide span strip lets one stray backtick
 * pair with another pages later and swallow every link between them.
 */
function stripCode(text: string): string {
  const kept: string[] = [];
  let fence: { char: string; length: number } | null = null;
  let blank = true;
  let indented = false;
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (fence !== null) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (close !== undefined && close[0] === fence.char && close.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open !== undefined) {
      fence = { char: open[0] as string, length: open.length };
      continue;
    }
    if (/^(?: {4}|\t)/.test(line) && !/^[ \t]+(?:[-*+]|\d+[.)])\s/.test(line)) {
      if (blank || indented) {
        indented = true;
        continue;
      }
    } else if (line.trim() !== "") {
      indented = false;
    }
    blank = line.trim() === "";
    kept.push(line);
  }
  return kept
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/(`+)[^`]*?\1/g, " "))
    .join("\n\n");
}

// Every shape CommonMark gives a link destination: inline (bare or
// <angle-bracketed>, with a "double", 'single' or (paren) title) and the
// reference definitions `[text][label]` links point at. `![alt](img.png)` is
// the same shape.
const INLINE_LINK =
  /\[[^\]]*\]\(\s*(<[^<>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_DEFINITION =
  /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(<[^<>\n]*>|\S+)[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))?[ \t]*$/gm;

function linkTargets(body: string): string[] {
  const raw: string[] = [];
  for (const match of body.matchAll(INLINE_LINK)) if (match[1]) raw.push(match[1]);
  for (const match of body.matchAll(REFERENCE_DEFINITION)) if (match[1]) raw.push(match[1]);
  // <…> exists so a destination may contain spaces; the brackets are syntax.
  return raw.map((t) => (t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t));
}

/**
 * The asset a link points at, as a record-relative path — or null when it
 * points anywhere else: out of the record, at another document, at a heading,
 * or off the web entirely. A site-absolute `/img/mark.png` addresses the
 * shell's `static/`, not the record, and resolves outside it here for free.
 *
 * The grammar above and this resolution are the checker's, matched exactly
 * (`.agents/skills/format-checker/check.mjs` → `stripCode`, `linkTargets`,
 * `checkLinkTarget`). ONE definition of "this is a link" across the checker
 * and both shells' stages: over-detection here is the only place that can put
 * restricted bytes where something might later ship them, and a second
 * grammar is where the two shells would start staging different sets. No
 * `?query` handling and no percent-decoding for the same reason — the checker
 * reports `./chart.png?v=2` as a dead link and refuses spaces and non-ascii
 * in a filename, so neither can occur on a record it passes. If raw HTML ever
 * renders (measured 2026-08-18: Docusaurus ships `<img src="./x.png">`
 * untouched so it 404s, and Fumadocs drops the element), `src=` detection
 * lands in that same commit, in both shells and the checker.
 */
function assetTarget(knowledgeDir: string, documentPath: string, target: string): string | null {
  if (target === "" || target.startsWith("#") || target.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const resolved = path.resolve(path.dirname(documentPath), target.split("#")[0] as string);
  if (!resolved.startsWith(knowledgeDir + path.sep)) return null;
  // .md AND .mdx both render as pages; neither may ride in as an "asset"
  // (review finding, 2026-08-18).
  if (/\.mdx?$/i.test(resolved)) return null;
  try {
    return fs.statSync(resolved).isFile() ? path.relative(knowledgeDir, resolved) : null;
  } catch {
    return null;
  }
}

/** Copy one file into the stage, creating its parents. */
function stageFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/**
 * Write the staged record for one audience and return its path.
 *
 * The directory is REPLACED, never written into: a document that was
 * permitted by a previous run's audience is exactly the file that must not
 * survive into this one (the same total-generation rule `.generated/` has,
 * for higher stakes).
 */
function stageRecord(
  knowledgeDir: string,
  stageDir: string,
  model: AudienceModel,
  audience: string,
): string {
  fs.mkdirSync(stageDir, { recursive: true });
  // Absolute, because containment is decided by string prefix below: a
  // relative record root would quietly match nothing and stage no assets.
  const recordRoot = path.resolve(knowledgeDir);
  const assets = new Set<string>();
  let staged = 0;
  for (const doc of documents(recordRoot, "")) {
    if (!permits(model, audience, doc.visibility)) continue;
    staged += 1;
    const from = path.join(recordRoot, doc.rel);
    stageFile(from, path.join(stageDir, doc.rel));
    for (const target of linkTargets(stripCode(doc.text.replace(FRONTMATTER, "")))) {
      // Resolved against the document, then required to stay inside the
      // record: `../../secrets/key.png` addresses the adopter's repository,
      // not the record, and the checker refuses it — but the stage is what
      // decides which bytes ship, so it decides this too.
      const asset = assetTarget(recordRoot, from, target);
      if (asset !== null) assets.add(asset);
    }
  }
  if (staged === 0) {
    // Docusaurus refuses an empty docs directory on its own, but its message
    // names `.staged-knowledge` — a directory the adopter never created and cannot
    // find an explanation for. The refusal is right; the reason has to travel
    // with it (found live 2026-08-18).
    refuse(
      "ksor-audience-empty",
      `no document in knowledge/ is visible to the ${audience} audience`,
      `every document takes default_visibility: ${model.fallback} unless it declares its own visibility:, and nothing here sits at or below ${audience} in the declared order (${model.audiences.join(", ")})`,
      `build a tier that has documents (KSOR_AUDIENCE=${model.fallback}), or widen default_visibility: in instance.md`,
    );
  }
  for (const rel of assets) {
    stageFile(path.join(recordRoot, rel), path.join(stageDir, rel));
  }
  return stageDir;
}

/**
 * The single decision every reader follows: which directory IS the record for
 * this build, and what the chrome must say about it.
 *
 * One chokepoint on purpose. Two readers expressing one policy in two
 * languages — a predicate here, exclude globs there — is two chances to
 * drift, and the drift is silent.
 */
export function planRecord(options: {
  readonly repoRoot: string;
  readonly knowledgeDir: string;
  readonly stageDir: string;
}): AudiencePlan {
  const { repoRoot, knowledgeDir, stageDir } = options;
  // Removed unconditionally: a stage left by a more-permissive audience is
  // the one directory on disk that must never outlive its build.
  fs.rmSync(stageDir, { recursive: true, force: true });

  const model = readAudienceModel(repoRoot);
  const audience = buildAudience(model);
  if (model === null) {
    refuseUngovernedVisibility(knowledgeDir);
    return { recordDir: knowledgeDir, label: null };
  }

  return {
    recordDir: stageRecord(knowledgeDir, stageDir, model, audience),
    // The watermark, and the ONLY audience vocabulary that reaches the
    // client: a public build carries none at all, and no build carries the
    // audience list or the name of anything it excluded.
    label: audience === model.audiences[0] ? null : `${audience} build — not for publication`,
  };
}
