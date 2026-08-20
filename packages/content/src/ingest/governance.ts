/**
 * The governance a document declares about itself, read once and carried onto
 * the record.
 *
 * Before this module the ingest adapter kept four frontmatter keys and dropped
 * the rest, so `visibility`, `status`, `owner` and `provenance` existed only in
 * markdown — and every surface re-derived them independently. The site enforced
 * `visibility:`; the MCP door could not, because the record did not carry it.
 * One reader, one shape, persisted on `content_nodes` (schema 2.2).
 *
 * The vocabulary is deliberately NOT closed here. A record that declares an
 * audience the instance does not know is a corpus error the checker names; the
 * ingest path's job is to carry what was written, faithfully, so the serving
 * door can make the decision with the instance in hand. Refusing unknown values
 * here would put the audience model in two places again.
 */

/** The authored governance keys. `null` means "the document said nothing". */
export interface NodeGovernance {
  /** Audience tier; null = the instance's default_visibility. */
  readonly visibility: string | null;
  /** draft / approved / superseded, as authored. NOT the row's serving status. */
  readonly docStatus: string | null;
  readonly owner: string | null;
  /** Where the claims come from. A scalar becomes a one-element list. */
  readonly provenance: readonly string[] | null;
  /** stable_id of the document that replaces this one. */
  readonly supersededBy: string | null;
}

export const NO_GOVERNANCE: NodeGovernance = {
  visibility: null,
  docStatus: null,
  owner: null,
  provenance: null,
  supersededBy: null,
};

function scalar(meta: Record<string, unknown>, key: string): string | null {
  const raw = meta[key];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed;
  }
  // A bare `status: true` is YAML's boolean, not a governance value; carry the
  // literal the author typed rather than "true".
  if (typeof raw === "boolean") return raw ? "true" : "false";
  if (typeof raw === "number") return String(raw);
  return null;
}

const BLOCK_LIST = (key: string): RegExp =>
  new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]+-[ \\t]*.*\\r?\\n?)+)`, "m");

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Values of a simple `key:` block list, the one nested shape the record's
 * grammar uses (`provenance:` here, `audiences:` in instance.md). The scalar
 * reader deliberately ignores indented lines, so without this a provenance list
 * would vanish silently — the failure mode this whole module exists to end.
 */
export function frontmatterListValues(text: string, key: string): string[] | null {
  const block = FRONTMATTER.exec(text)?.[1];
  if (block === undefined) return null;
  const m = BLOCK_LIST(key).exec(block + "\n");
  if (m === null) return null;
  const items = (m[1] ?? "")
    .split(/\r?\n/)
    .map((line) => /^[ \t]+-[ \t]*(.*)$/.exec(line)?.[1] ?? "")
    .map((v) =>
      v
        .trim()
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .filter((v) => v !== "");
  return items.length > 0 ? items : null;
}

/**
 * Read the governance keys from an already-parsed scalar map plus the raw
 * document text (which the list reader needs). Unknown keys are ignored, as
 * they always were — this module widens what the record carries, it does not
 * narrow what a document may say.
 */
export function governanceFromFrontmatter(
  meta: Record<string, unknown>,
  text: string,
): NodeGovernance {
  const provenanceScalar = scalar(meta, "provenance");
  const provenanceList = frontmatterListValues(text, "provenance");
  return {
    visibility: scalar(meta, "visibility"),
    docStatus: scalar(meta, "status"),
    owner: scalar(meta, "owner"),
    provenance: provenanceList ?? (provenanceScalar === null ? null : [provenanceScalar]),
    supersededBy: scalar(meta, "superseded_by"),
  };
}

/**
 * The governance fingerprint that change detection compares. Body-only hashing
 * meant a retitle — or a `status: draft` -> `approved` promotion, or a
 * visibility change — reported "unchanged" and published nothing (review
 * 2026-08-20). Stable field order so the string is comparable across runs.
 */
export function governanceFingerprint(g: NodeGovernance): string {
  return JSON.stringify([
    g.visibility,
    g.docStatus,
    g.owner,
    g.provenance === null ? null : [...g.provenance],
    g.supersededBy,
  ]);
}
