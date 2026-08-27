import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { governanceVisible } from "./governance";
import { splitFrontmatter } from "../record/frontmatter";

// The record's one identity source: instance.md — the same file every other
// surface reads, so renaming the instance renames every surface at the next
// build, and no shell carries a baked-in copy (found live 2026-08-18: a
// stamped constant survived a restore-from-templates as the literal
// placeholder name, with every gate green).
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

/** The project root: the directory holding instance.md. */
export const projectRoot: string = path.dirname(findInstance(process.cwd()));

/**
 * instance.md's frontmatter, read with the record's own parser (decision 26:
 * one YAML reader, never a line scanner — the scanner this replaced could not
 * read a nested block and failed silently on it). Only the frontmatter: the
 * body is the MCP server's instructions in full (record spec §3), and prose
 * that looks like a key must never become configuration (review finding,
 * 2026-08-18).
 */
function readInstance(): Readonly<Record<string, unknown>> {
  const split = splitFrontmatter(
    readFileSync(path.join(projectRoot, "instance.md"), "utf8"),
    "instance.md",
  );
  if (!split.ok) {
    throw new Error(
      `${split.refusal.slug}: instance.md — ${split.refusal.why}\n  fix: ${split.refusal.fix}`,
    );
  }
  return split.frontmatter ?? {};
}

export const instanceData: Readonly<Record<string, unknown>> = readInstance();

function scalar(key: string): string | null {
  const value = instanceData[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readInstanceName(): string {
  const name = scalar("name");
  if (name === null) {
    throw new Error("instance.md carries no name: — it is the project's identity; run pnpm check.");
  }
  return name;
}

export const appName: string = readInstanceName();

/**
 * The record's DISPLAY TITLE: instance.md's `title:` (record spec §3, format
 * 2 — what used to be the body's H1). The slug in `name:` is the machine
 * identity (llms.txt, citations); the title is the human name every page leads
 * with. Falls back to the name so a page always has one.
 */
export const appTitle: string = scalar("title") ?? appName;

/**
 * The record's own one-sentence statement of what it is authoritative for:
 * instance.md's `description:`. It seeds the home page, `llms.txt` and
 * `server.json`, and it is the record speaking for itself — the framework's
 * marketing copy used to sit where it goes (research/site-design.md F7).
 *
 * Null when the owner has not written one; the page then renders nothing
 * rather than inventing a purpose.
 */
export const appDescription: string | null = scalar("description");

/** The description, under the name the home page's cover takes it by. */
export const appPurpose: string | null = appDescription;

/**
 * Whether the pages show the governance each document declares
 * (`site.governance` in instance.md, default on). Read once at build/server
 * start, like the identity above — restart `pnpm dev` after changing it.
 */
export const showGovernance: boolean = governanceVisible(instanceData);

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

/** One paragraph as one line: a wrapped description is not several sentences. */
function sentence(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return /^(.+?[.!?])(\s|$)/.exec(one)?.[1] ?? one;
}

/** Fit `text` inside `max`, breaking on a word rather than mid-word. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/** The first sentence of the description, or null until the owner has written one — never a guess. */
export const appScope: string | null = appDescription === null ? null : sentence(appDescription);

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
  return scalar("mcp_url");
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
  const value = instanceData["version"];
  const text =
    typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^\d+\.\d+\.\d+/.test(text) ? text : "0.1.0";
}
