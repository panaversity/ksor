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
 * How this record describes ITSELF, in one line — what an agent reads in a
 * registry listing to decide whether this record can answer its question.
 *
 * It comes from the record's own prose (instance.md's first real paragraph,
 * which the intake interview writes) because the alternative is what shipped
 * before: one hard-coded sentence, byte-identical in every ksor record ever
 * scaffolded, telling a discovering agent nothing that distinguishes this record
 * from any other. "Discoverability determines whether agents find you at all" is
 * a product principle, and a description that cannot discriminate is not
 * discoverability (found live 2026-08-21).
 *
 * An UNDESCRIBED record says so rather than borrowing a confident sentence it
 * has not earned — the same answer the MCP door already gives an agent that
 * connects, so the two surfaces do not disagree about whether this record knows
 * what it is. The marker is the template's own unfilled placeholder, matched on
 * the WHOLE body: a scaffold's first paragraphs are authoring guidance, and
 * reading one of those as the record's scope is worse than admitting there is
 * none.
 */
const TEMPLATE_MARKER = "_fill this in; it is";

function readInstanceScope(): string | null {
  const text = readFileSync(findInstance(process.cwd()), "utf8");
  const body = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, "");
  if (body.includes(TEMPLATE_MARKER)) return null;
  const afterHeading = body.replace(/^[\s\S]*?^#[ \t]+.+$/m, "");
  for (const para of afterHeading.split(/\n[ \t]*\n/)) {
    const one = para.trim().replace(/\s+/g, " ");
    if (one === "" || one.startsWith("#") || one.startsWith("-") || one.startsWith(">")) continue;
    return sentence(one);
  }
  return null;
}

/**
 * The MCP registry schema caps `ServerDetail.description` at **100 characters**
 * (`ServerDetail.description.maxLength`, 2025-12-11). Over it, the document a
 * validating client reads is invalid — and the failure was shaped exactly
 * wrong: the unfilled placeholder is 88 characters and validates, so the
 * document became invalid the moment an owner did the thing the scaffold asks
 * for and wrote a real scope sentence. Silent, and only for real records.
 *
 * A hard truncation would publish a sentence cut mid-word, so this trims at a
 * word boundary and marks it, and the whole description is assembled inside the
 * budget rather than clipped after the fact.
 */
const DESCRIPTION_MAX = 100;

function sentence(one: string): string {
  const first = /^(.+?[.!?])(\s|$)/.exec(one)?.[1] ?? one;
  return first;
}

/** Fit `text` inside `max`, breaking on a word rather than mid-word. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "")}\u2026`;
}

/** null until the owner has written one — never a guess. */
export const appScope: string | null = readInstanceScope();

/**
 * The one-line description every discovery surface publishes. Built here so the
 * registry document and anything else that needs one cannot drift apart.
 */
export function recordDescription(): string {
  const whole =
    appScope === null
      ? `${appTitle} — its owner has not yet described what this record covers.`
      : `${appTitle} — ${appScope}`;
  return fit(whole, DESCRIPTION_MAX);
}

/**
 * Where this record's MCP surface is published, if the owner has said.
 *
 * `null` when they have not: an invented URL is worse than none, because an
 * agent would try it and conclude the record is down rather than unpublished.
 */
export function mcpEndpoint(): string | null {
  const declared = /^mcp_url:[ \t]*(.*)$/m.exec(instanceFrontmatter())?.[1] ?? "";
  const value = declared.trim().replace(/^["']|["']$/g, "");
  return value === "" ? null : value;
}

/**
 * The namespace half of the MCP `name`, which the schema requires to look like
 * `<namespace>/<identifier>` — a bare record name has no slash and is rejected
 * by a validating client (round-6 review of #43).
 *
 * Derived from the published MCP URL's host in reverse-DNS order, which is the
 * convention and is something the owner has already declared rather than a
 * second thing to configure. With no URL declared there is nothing published to
 * namespace, so the local-only namespace says exactly that.
 */
export function mcpNamespace(): string {
  const endpoint = mcpEndpoint();
  if (endpoint === null) return "local";
  try {
    const host = new URL(endpoint).hostname;
    const labels = host.split(".").filter((l) => l !== "");
    // A bare host or an IP literal cannot be reversed into a namespace
    // meaningfully; "local" is honest about that.
    if (labels.length < 2 || /^\d+$/.test(labels[labels.length - 1] ?? "")) return "local";
    return labels.reverse().join(".");
  } catch {
    return "local";
  }
}

/**
 * The version this record publishes as. The record's own generation is not a
 * semver, and the schema wants one, so this reads an explicit `version:` from
 * instance.md and falls back to a first-release default.
 */
export function recordVersion(): string {
  const declared = /^version:[ \t]*(.*)$/m.exec(instanceFrontmatter())?.[1] ?? "";
  const value = declared.trim().replace(/^["']|["']$/g, "");
  return /^\d+\.\d+\.\d+/.test(value) ? value : "0.1.0";
}
