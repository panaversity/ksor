/**
 * The pre-profile → KSoR Profile mapping (research/okf-native.md §1.8), as
 * pure functions of one file's bytes.
 *
 * Mechanical, and honest about what it cannot know: every rule here either
 * derives a value from something the record already says, or refuses by name.
 * `ksor migrate` never authors knowledge — a document whose `title` or
 * `description` is not already somewhere in the file is refused, not invented.
 */
import {
  conceptIdOf,
  LEGACY_KEYS,
  resolveLink,
  splitFrontmatter,
  type Refusal,
} from "@panaversity/ksor-content/record";

import {
  emptyFrontmatterDoc,
  keys,
  movePair,
  parseFrontmatterDoc,
  renderDocument,
  reorder,
  setFlow,
  setValue,
} from "./yaml-doc.js";

const SLUG = "ksor-migrate-underivable";

/**
 * The pre-profile audience model: `audiences:` on the instance was an ORDERED
 * list, least-privileged first, and a viewer at tier _i_ saw tiers `0..i`
 * (`packages/content/src/lib/audience.ts`). So membership at tier _i_ means
 * "readable by every tier from _i_ upward", which is exactly the list the
 * profile's overlap model wants.
 */
export interface AudienceModel {
  readonly tiers: readonly string[];
  readonly defaultVisibility: string | null;
}

export const NO_AUDIENCE_MODEL: AudienceModel = { tiers: [], defaultVisibility: null };

/**
 * A tier expands UPWARD. `internal` under `[public, internal, board]` is
 * `[internal, board]` — a one-element list would silently drop the document
 * from the board build, which is the review finding §6 records.
 */
export function expandTier(model: AudienceModel, visibility: string | null): readonly string[] {
  const declared = visibility ?? model.defaultVisibility;
  if (model.tiers.length === 0) return [declared === null || declared === "" ? "public" : declared];
  const tier = declared === null || declared === "" ? model.tiers[0]! : declared;
  const at = model.tiers.indexOf(tier);
  // An unregistered tier is kept as its own audience rather than guessed at:
  // the result is fail-CLOSED (only that identifier can read it) and it is
  // visible in the diff the owner reviews before anything is written.
  return at === -1 ? [tier] : model.tiers.slice(at);
}

/** `KSoR README, "What Is a KSoR?"` → `ksor-readme-what-is-a-ksor`. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug === "" ? "source" : slug;
}

/** A bare `YYYY-MM-DD` widens to midnight UTC; an instant is already one. */
export function widenToInstant(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  return null;
}

/** The first ATX H1, or null. Fenced code is skipped — a `# ` inside a shell block is not a heading. */
export function firstHeading(body: string): string | null {
  let fenced = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const m = /^#\s+(.+?)\s*$/.exec(line);
      if (m !== null) return m[1] ?? null;
    }
  }
  return null;
}

/**
 * The first sentence of the first prose paragraph — the pre-profile record's
 * own "scope" sentence, which is where the instance's `description:` comes
 * from. Cutting at `. ` is mechanical and occasionally cuts at an
 * abbreviation; the owner reads the diff before it is written.
 */
export function firstSentence(body: string): string | null {
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (text === "" || text.startsWith("#") || /^[*\-+>|]/.test(text)) continue;
    const one = text.replace(/\s+/g, " ");
    const at = one.search(/\.\s/);
    return at === -1 ? one : one.slice(0, at + 1);
  }
  return null;
}

/**
 * Everything after the leading H1, so the migrated body carries no heading of
 * its own. Used unconditionally on the instance (whose H1 BECOMES `title:`),
 * and only against a duplicate on a concept — see `stripDuplicateHeading`.
 */
export function stripLeadingHeading(body: string): string {
  const lines = body.split("\n");
  const at = lines.findIndex((l) => /^#\s+/.test(l));
  if (at === -1) return body;
  const before = lines.slice(0, at).join("\n").trim();
  if (before !== "") return body;
  let after = at + 1;
  while (after < lines.length && lines[after]!.trim() === "") after += 1;
  return lines.slice(after).join("\n");
}

/**
 * A leading `# ` that merely repeats the title is a DUPLICATE, not knowledge:
 * the frontmatter `title` is the rendered page heading, so keeping both prints
 * it twice on every migrated page. Removing a literal repetition is mechanical;
 * a heading that says something else is content and stays.
 */
export function stripDuplicateHeading(body: string, title: string): string {
  const heading = firstHeading(body);
  if (heading === null) return body;
  const same = (t: string): string => t.replace(/\s+/g, " ").trim().toLowerCase();
  if (same(heading) !== same(title)) return body;
  const stripped = stripLeadingHeading(body);
  // The body of a fenced document starts at the newline after the fence; keep
  // that separator, or the first paragraph butts against `---`.
  return body.startsWith("\n") && !stripped.startsWith("\n") ? `\n${stripped}` : stripped;
}

/** Old status → profile status. `approved` needs the caller's answer about approval. */
const STATUS_MAP: Readonly<Record<string, "draft" | "stable" | "deprecated">> = {
  draft: "draft",
  review: "draft",
  approved: "draft",
  superseded: "deprecated",
  stable: "stable",
  deprecated: "deprecated",
};

export interface ConceptContext {
  /** The CLI's own version — `generated.by` is `ksor-migrate/<version>`. */
  readonly version: string;
  /** The human running the migration: the only actor a governance act here may name. */
  readonly actor: string | null;
  /** `--approve-by`: who is performing the approval of every `approved` document. */
  readonly approveBy: string | null;
  /** The instant of THIS migration — every approval and deprecation it records. */
  readonly instant: string;
  readonly model: AudienceModel;
}

export interface ConceptOutcome {
  /** The migrated bytes, or the input unchanged when the file is already in the profile. */
  readonly text: string;
  /** Non-`public` identifiers this concept names, for the policy's registry. */
  readonly audiences: readonly string[];
  readonly changed: boolean;
  /** An `approved` document that became a `draft` for want of `--approve-by` (R25). */
  readonly demoted: boolean;
  /** The concept id this document's `ksor.superseded_by` names, when it names one. */
  readonly successor: string | null;
}

export type ConceptResult =
  | { readonly ok: true; readonly outcome: ConceptOutcome }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

/** `knowledge/<id>.md` for the concept this file becomes (its target path, when it moves). */
export function migrateConcept(
  path: string,
  text: string,
  generatedAt: string | null,
  ctx: ConceptContext,
): ConceptResult {
  const refusals: Refusal[] = [];
  const refuse = (why: string, fix: string): void => {
    refusals.push({ slug: SLUG, path, why, fix });
  };

  const split = splitFrontmatter(text, path);
  if (!split.ok) return { ok: false, refusals: [split.refusal] };
  const fm = split.frontmatter ?? {};
  // Already in the profile, with nothing pre-profile left on it: byte-identical.
  // Shape, not validity — a profile document that is separately WRONG is the
  // checker's to refuse, and re-running migrate over it must not move it.
  if (hasProfileShape(fm)) {
    return {
      ok: true,
      outcome: {
        text,
        audiences: audiencesOf(fm),
        changed: false,
        demoted: false,
        successor: successorOf(fm),
      },
    };
  }

  const doc = split.frontmatter === null ? emptyFrontmatterDoc() : parseFrontmatterDoc(split.block);
  if (doc === null) {
    return {
      ok: false,
      refusals: [
        {
          slug: "ksor-frontmatter-invalid",
          path,
          why: "the frontmatter is not one plain YAML mapping, so there is nothing for migrate to rewrite",
          fix: "fix the YAML by hand, then run `ksor migrate` again",
        },
      ],
    };
  }

  const title = str(fm["title"]) ?? firstHeading(split.body);
  if (title === null) {
    refuse(
      "no `title:` and no `# ` heading in the body — migrate never authors knowledge, and a title is knowledge",
      "add `title:` to the frontmatter (or a `# ` heading as the first line of the body) and run it again",
    );
  }
  const description = str(fm["description"]);
  if (description === null) {
    refuse(
      "no `description:` — the profile requires one sentence saying what this document is, and migrate will not write it for you",
      "add `description:` to the frontmatter and run it again",
    );
  }
  if (generatedAt === null) {
    refuse(
      "`generated.at` is the last commit that touched this file, and there is no commit to read — this record is not in a git repository (or the file has never been committed)",
      "commit the record first, or pass --generated-at <instant> to stamp every document with one instant",
    );
  }

  const oldStatus = str(fm["status"]) ?? "draft";
  const mapped = STATUS_MAP[oldStatus];
  if (mapped === undefined) {
    refuse(
      `\`status: ${oldStatus}\` is not a status this record ever had (draft | review | approved | superseded) and not a profile status either`,
      "set a status migrate can map, or move the document to the profile by hand",
    );
  }
  const status =
    mapped === "draft" && oldStatus === "approved" && ctx.approveBy !== null
      ? "stable"
      : (mapped ?? "draft");
  if (status === "deprecated" && ctx.actor === null) {
    refuse(
      "a deprecation names WHO withdrew the document, and migrate never guesses an actor (decision 21)",
      "pass --actor human:<id> — the person running this migration",
    );
  }
  // `sor_id` is retired governance: under the profile the path IS the identity
  // (record spec §1). Dropping it silently would CHANGE this document's
  // stable_id from the sor_id value to its path, and every takedown row and
  // citation keyed on the old one would quietly stop matching. Migrate does not
  // author knowledge and does not retire identity either.
  const sorId = str(fm["sor_id"]);
  if (sorId !== null) {
    refuse(
      `\`sor_id: ${sorId}\` is retired: under the profile the path is the identity, so migrating this file changes its stable_id from \`${sorId}\` to \`${conceptIdOf(path)}\``,
      "delete `sor_id:` deliberately — and before you do, re-deny anything the ledger or a denylist row keyed on the old id with `ksor takedown` against the new one",
    );
  }
  const strayPointer = str(fm["superseded_by"]);
  if (strayPointer !== null && status !== "deprecated") {
    refuse(
      `\`superseded_by: ${strayPointer}\` on a \`${status}\` document announces a successor no surface shows — the checker refuses that tree as \`ksor-supersession-strands\`, and migrate would have written it`,
      "set `status: superseded` if the document really is withdrawn, or delete the pointer",
    );
  }
  if (refusals.length > 0) return { ok: false, refusals };

  const id = conceptIdOf(path);
  const audience = expandTier(ctx.model, str(fm["visibility"]));

  // ── the concept keys ───────────────────────────────────────────────────
  doc.set("type", str(fm["type"]) ?? "Document");
  doc.set("title", title!);
  doc.set("description", description!);
  doc.set("status", status);
  setValue(doc, "generated", { by: `ksor-migrate/${ctx.version}`, at: generatedAt! });
  setFlow(doc, ["generated"]);

  const sources = sourcesFrom(fm["provenance"]);
  if (sources !== null) setValue(doc, "sources", sources);
  doc.delete("provenance");

  // ── the ksor block ─────────────────────────────────────────────────────
  const ksor: Record<string, unknown> = { audience: [...audience] };
  const owner = str(fm["owner"]);
  if (owner !== null) ksor["owner"] = owner;
  if (status === "stable" && ctx.approveBy !== null) {
    ksor["approval"] = { by: ctx.approveBy, at: ctx.instant };
  }
  const effective = str(fm["effective"]);
  if (effective !== null) {
    const instant = widenToInstant(effective);
    if (instant === null) {
      return {
        ok: false,
        refusals: [
          {
            slug: SLUG,
            path,
            why: `\`effective: ${effective}\` is neither a date nor an instant, so there is no instant to widen it to`,
            fix: "write it as `YYYY-MM-DD` (migrate widens it to midnight UTC) or as a full instant",
          },
        ],
      };
    }
    ksor["effective_from"] = instant;
  }
  const successor = str(fm["superseded_by"]);
  if (successor !== null) {
    const resolved = resolveLink(id, successor);
    if (resolved === null) {
      return {
        ok: false,
        refusals: [
          {
            slug: SLUG,
            path,
            why: `\`superseded_by: ${successor}\` climbs out of \`knowledge/\`, so there is no concept for it to point at — writing it as \`null\` would hand the checker frontmatter migrate invented`,
            fix: "point it at a concept inside `knowledge/`, or delete the key",
          },
        ],
      };
    }
    ksor["superseded_by"] = resolved;
  }
  if (status === "deprecated") {
    ksor["deprecated"] = { by: ctx.actor!, at: ctx.instant };
  }
  // `id` and `name` only ever restated the path, which is the identity now, so
  // they are deleted with the rest; `sor_id` never reaches here (refused above).
  for (const key of [
    "id",
    "name",
    "visibility",
    "owner",
    "effective",
    "superseded",
    "superseded_by",
  ]) {
    doc.delete(key);
  }
  setValue(doc, "ksor", ksor);
  setFlow(doc, ["ksor", "audience"]);
  if (ksor["approval"] !== undefined) setFlow(doc, ["ksor", "approval"]);
  if (ksor["deprecated"] !== undefined) setFlow(doc, ["ksor", "deprecated"]);

  reorder(doc, [
    "type",
    "title",
    "description",
    "status",
    "order",
    "generated",
    "sources",
    "verified",
    "stale_after",
  ]);
  // `ksor` last, after whatever unknown keys the record carried (OKF §11 keeps them).
  reorder(doc, [...keys(doc).filter((k) => k !== "ksor"), "ksor"]);

  return {
    ok: true,
    outcome: {
      text: renderDocument(doc, stripDuplicateHeading(split.body, title!)),
      audiences: audience.filter((a) => a !== "public"),
      changed: true,
      demoted: oldStatus === "approved" && status === "draft",
      successor: typeof ksor["superseded_by"] === "string" ? ksor["superseded_by"] : null,
    },
  };
}

/** A summary companion carries exactly `type: Summary` — nothing else may govern from there. */
export function migrateSummary(path: string, text: string): ConceptResult {
  const split = splitFrontmatter(text, path);
  const body = split.ok ? split.body : text.replace(/^---[\s\S]*?\n---\n/, "");
  const already =
    split.ok &&
    split.frontmatter !== null &&
    Object.keys(split.frontmatter).length === 1 &&
    split.frontmatter["type"] === "Summary";
  if (already) {
    return {
      ok: true,
      outcome: { text, audiences: [], changed: false, demoted: false, successor: null },
    };
  }
  return {
    ok: true,
    outcome: {
      text: `---\ntype: Summary\n---\n${body}`,
      audiences: [],
      changed: true,
      demoted: false,
      successor: null,
    },
  };
}

export interface InstanceContext {
  /** The record's directory name, the fallback for `name:` when the old instance declared none. */
  readonly directory: string;
}

export interface InstanceOutcome {
  readonly text: string;
  readonly model: AudienceModel;
  readonly changed: boolean;
}

export type InstanceResult =
  | { readonly ok: true; readonly outcome: InstanceOutcome }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

const INSTANCE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** Keys the profile's instance carries, in the order it reads best. */
const INSTANCE_ORDER = [
  "format",
  "name",
  "title",
  "description",
  "toolchain",
  "site",
  "database",
  "embedding",
  "retrieval",
  "budgets",
  "mcp_url",
  "version",
];

export type InstanceNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly why: string; readonly fix: string };

/**
 * The record's machine identity, from the pre-profile frontmatter or — when it
 * declared none — the directory it lives in. ONE derivation, because the
 * database read needs the same answer the rewritten instance will carry
 * (`name:` is `tenant_id` and `corpus_id` both, in format 1 as in format 2).
 *
 * The two failing states get two messages. Blaming the directory for a
 * declared-but-invalid `name:` states a falsehood about a directory that is
 * fine and prescribes adding a key that is already there (product principle 4).
 */
export function instanceNameOf(
  fm: Readonly<Record<string, unknown>>,
  directory: string,
): InstanceNameResult {
  const declared = str(fm["name"]);
  if (declared !== null) {
    if (INSTANCE_NAME.test(declared)) return { ok: true, name: declared };
    return {
      ok: false,
      why: `\`name: ${declared}\` is not ${INSTANCE_NAME.source} — it is the machine identity every citation carries, so it is ascii lowercase letters, digits and hyphens`,
      fix: "correct `name:` in instance.md and run it again",
    };
  }
  if (INSTANCE_NAME.test(directory)) return { ok: true, name: directory };
  return {
    ok: false,
    why: `no usable \`name:\` — it is the machine identity every citation carries, and the directory name (${directory}) is not ${INSTANCE_NAME.source}`,
    fix: "add `name: <this-record>` (ascii lowercase letters, digits and hyphens) to instance.md and run it again",
  };
}

export function migrateInstance(text: string, ctx: InstanceContext): InstanceResult {
  const path = "instance.md";
  const refusals: Refusal[] = [];
  const refuse = (why: string, fix: string): void => {
    refusals.push({ slug: SLUG, path, why, fix });
  };
  const split = splitFrontmatter(text, path);
  if (!split.ok) return { ok: false, refusals: [split.refusal] };
  const fm = split.frontmatter ?? {};
  const model = modelOf(fm);
  if (fm["format"] === 2) {
    return { ok: true, outcome: { text, model: NO_AUDIENCE_MODEL, changed: false } };
  }

  const doc = split.frontmatter === null ? emptyFrontmatterDoc() : parseFrontmatterDoc(split.block);
  if (doc === null) {
    return {
      ok: false,
      refusals: [
        {
          slug: "ksor-frontmatter-invalid",
          path,
          why: "the frontmatter is not one plain YAML mapping, so there is nothing for migrate to rewrite",
          fix: "fix the YAML by hand, then run `ksor migrate` again",
        },
      ],
    };
  }

  const identity = instanceNameOf(fm, ctx.directory);
  const name = identity.ok ? identity.name : null;
  if (!identity.ok) refuse(identity.why, identity.fix);
  const title = str(fm["title"]) ?? firstHeading(split.body);
  if (title === null) {
    refuse(
      "no `title:` and no `# ` heading in the body — the display title every page leads with",
      "add a `# ` heading to instance.md (or `title:` to its frontmatter) and run it again",
    );
  }
  const bodyWithoutHeading = stripLeadingHeading(split.body);
  const description = str(fm["description"]) ?? firstSentence(bodyWithoutHeading);
  if (description === null) {
    refuse(
      "no `description:` and no opening paragraph to take one sentence from — it seeds llms.txt and the MCP discovery document",
      "add `description:` to instance.md, or write the record's scope as its first paragraph",
    );
  }
  if (refusals.length > 0) return { ok: false, refusals };

  doc.set("format", 2);
  doc.set("name", name!);
  doc.set("title", title!);
  doc.set("description", description!);
  // The upgrade stamp moves out of `ksor:` and keeps its own comments. A
  // record that never carried one gains no toolchain: the key is optional, and
  // inventing a version this record was never scaffolded by would be a lie.
  movePair(doc, "ksor", "toolchain");
  doc.delete("audiences");
  doc.delete("default_visibility");
  reorder(doc, INSTANCE_ORDER);

  return {
    ok: true,
    outcome: {
      // A blank line after the fence: the H1 that used to open the body is
      // gone, and a paragraph butted against `---` reads as part of it.
      text: renderDocument(
        doc,
        bodyWithoutHeading.startsWith("\n") ? bodyWithoutHeading : `\n${bodyWithoutHeading}`,
      ),
      model,
      changed: true,
    },
  };
}

/** The ordered audience model an old instance declared, or none. */
export function modelOf(fm: Readonly<Record<string, unknown>>): AudienceModel {
  const raw = fm["audiences"];
  const tiers = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
  return { tiers, defaultVisibility: str(fm["default_visibility"]) };
}

/** In the profile already: a `type`, a `ksor.audience`, and no pre-profile key left over. */
function hasProfileShape(fm: Readonly<Record<string, unknown>>): boolean {
  if (typeof fm["type"] !== "string") return false;
  if ((LEGACY_KEYS as readonly string[]).some((k) => k in fm)) return false;
  if ("superseded_by" in fm) return false;
  const ksor = fm["ksor"];
  if (typeof ksor !== "object" || ksor === null || Array.isArray(ksor)) return false;
  return Array.isArray((ksor as Record<string, unknown>)["audience"]);
}

/** A profile-shaped document's `ksor.superseded_by`, or null. */
function successorOf(fm: Readonly<Record<string, unknown>>): string | null {
  const ksor = fm["ksor"];
  if (typeof ksor !== "object" || ksor === null || Array.isArray(ksor)) return null;
  const successor = (ksor as Record<string, unknown>)["superseded_by"];
  return typeof successor === "string" ? successor : null;
}

function audiencesOf(fm: Readonly<Record<string, unknown>>): readonly string[] {
  const ksor = fm["ksor"];
  if (typeof ksor !== "object" || ksor === null || Array.isArray(ksor)) return [];
  const audience = (ksor as Record<string, unknown>)["audience"];
  if (!Array.isArray(audience)) return [];
  return audience.filter((a): a is string => typeof a === "string" && a !== "public");
}

/**
 * `provenance` was a list of free-text strings naming a source. OKF permits a
 * scope descriptor as `resource`, so the string becomes both the title and the
 * resource, and the author replaces the resource with a URL when one exists.
 */
function sourcesFrom(raw: unknown): readonly Record<string, string>[] | null {
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : null;
  if (list === null) return null;
  const strings = list.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  if (strings.length === 0) return null;
  const used = new Set<string>();
  return strings.map((s) => {
    let id = slugify(s);
    for (let n = 2; used.has(id); n += 1) id = `${slugify(s)}-${n}`;
    used.add(id);
    return { id, title: s, resource: s };
  });
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
