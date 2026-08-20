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
  new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]*-[ \\t]+.*\\r?\\n?)+)`, "m");

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
    .map((line) => /^[ \t]*-[ \t]+(.*)$/.exec(line)?.[1] ?? "")
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
export class GovernanceParseError extends Error {
  override readonly name: string = "GovernanceParseError";
}

export function governanceFromFrontmatter(
  meta: Record<string, unknown>,
  text: string,
): NodeGovernance {
  // `visibility:` is a SECURITY control, so any shape this reader cannot
  // resolve REFUSES rather than reading as "declared nothing" — which means
  // the default tier, which means served, while the site excludes the same
  // document entirely.
  if (frontmatterListValues(text, "visibility") !== null) {
    throw new GovernanceParseError(
      "a document declares `visibility:` as a LIST — a document belongs to exactly one tier. " +
        "Write a single value, e.g. `visibility: internal`.",
    );
  }
  // Checked against the RAW TEXT, not the parsed map: `frontmatterMeta` empties
  // the WHOLE map on any parse failure, so one unrelated sibling key this
  // narrow parser cannot read — `tags: [hr, payroll]`, or an unquoted value
  // containing ": " — silently dropped `visibility:` and the document was
  // served at the default tier. The leak, entering through a third door
  // (round-2 review of #43, reproduced).
  const declaredInText = /^visibility:[ \t]*(.*)$/m.exec(FRONTMATTER.exec(text)?.[1] ?? "");
  if (declaredInText !== null && scalar(meta, "visibility") === null) {
    const written = declaredInText[1]?.trim() ?? "";
    throw new GovernanceParseError(
      written === ""
        ? "a document declares `visibility:` with no readable value — an unreadable tier reads " +
            "as no tier, and no tier is the default tier, which is how a restricted document " +
            "gets served. Write a single value, e.g. `visibility: internal`."
        : `a document declares \`visibility: ${written}\` but this reader could not resolve ` +
            "it — usually because ANOTHER key in the same frontmatter is a shape it cannot read " +
            '(a flow list like `tags: [a, b]`, or an unquoted value containing ": "). An ' +
            "unresolved tier would be served at the default. Quote the other value, or write it " +
            "as a block list.",
    );
  }
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
