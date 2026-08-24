/**
 * The record checker — ONE rule set (record spec §6), run by `ksor build`,
 * `ksor ingest` and the emitted `check.mjs`. It reads an in-memory tree so
 * the same function judges a checkout, a staged projection and a test
 * fixture identically; `load.ts` is the one place the filesystem is touched.
 */
import { mayReach } from "../lib/audience-rule.js";
import { checkFootnotes, linkTargets, resolveLink } from "./citations.js";
import { splitFrontmatter } from "./frontmatter.js";
import { generateIndexes } from "./index-file.js";
import { parseInstanceDocument } from "./instance.js";
import {
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerShrank,
  parseLedger,
  type LedgerBaseline,
} from "./ledger.js";
import { parsePolicy, resolveApprovers, resolveOwner, type Policy } from "./policy.js";
import { conceptIdOf, parseConcept, type Concept } from "./profile.js";
import { sortRefusals, type Refusal } from "./refusal.js";

export interface RecordFiles {
  /** Record-relative path → text, for every file the checker reads (`knowledge/**`, `.ksor/*.yaml`, `instance.md`). */
  readonly files: ReadonlyMap<string, string>;
  /** Record-relative directories under `knowledge/`, empty ones included. */
  readonly dirs: readonly string[];
}

export interface CheckOptions {
  /** `check` is read-only and refuses a stale index; `build` regenerates and never does. */
  readonly mode: "check" | "build";
  /** Id sets the ledger must still contain (git history, the committed lock). */
  readonly ledgerBaselines?: readonly LedgerBaseline[];
}

export interface CheckResult {
  readonly refusals: readonly Refusal[];
  /** Record-relative index path → bytes, generated from the tree. */
  readonly indexes: ReadonlyMap<string, string>;
  readonly concepts: readonly Concept[];
  readonly ledgerIds: readonly string[];
  readonly policy: Policy | null;
}

const KNOWLEDGE = "knowledge/";
const POLICY_PATH = ".ksor/governance.yaml";
const LEDGER_PATH = ".ksor/takedowns.yaml";
const INSTANCE_PATH = "instance.md";
const COMPANION = /\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/;

export function checkRecord(record: RecordFiles, options: CheckOptions): CheckResult {
  const refusals: Refusal[] = [];
  const paths = [...record.files.keys()].sort();

  const policyResult = parsePolicy(record.files.get(POLICY_PATH) ?? null, POLICY_PATH);
  const policy = policyResult.ok ? policyResult.policy : null;
  if (!policyResult.ok) refusals.push(...policyResult.refusals);

  const title = checkInstance(record.files.get(INSTANCE_PATH) ?? null, refusals);

  // ── the bundle: concepts, companions, reserved names ───────────────────
  const concepts = new Map<string, Concept>();
  const bodies = new Map<string, string>();
  for (const path of paths) {
    if (!path.startsWith(KNOWLEDGE)) continue;
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (name === "log.md" || name === "README.md") {
      refusals.push({
        slug: "ksor-reserved-name",
        path,
        why: `\`${name}\` is reserved — \`log.md\` by OKF §9 and \`README.md\` by this profile; neither is a concept`,
        fix: "move the prose into a named concept such as `overview.md` and delete the file",
      });
      continue;
    }
    if (name === "index.md" || COMPANION.test(name) || !name.endsWith(".md")) continue;
    const text = record.files.get(path) ?? "";
    const split = splitFrontmatter(text, path);
    if (!split.ok) {
      refusals.push(split.refusal);
      continue;
    }
    const parsed = parseConcept(path, split.frontmatter ?? {});
    if (!parsed.ok) {
      refusals.push(...parsed.refusals);
      continue;
    }
    concepts.set(parsed.concept.id, parsed.concept);
    bodies.set(parsed.concept.id, split.body);
  }

  for (const path of paths) {
    if (!path.startsWith(KNOWLEDGE) || !COMPANION.test(path)) continue;
    const parentId = conceptIdOf(path.replace(COMPANION, ""));
    if (!concepts.has(parentId) && !record.files.has(`${KNOWLEDGE}${parentId}.md`)) {
      refusals.push({
        slug: "ksor-attachment-orphan",
        path,
        why: `no \`${parentId}.md\` exists for this attachment to belong to — it has no identity of its own`,
        fix: "restore the parent document, or delete the attachment",
      });
    }
    if (!path.endsWith(".summary.md")) continue;
    const split = splitFrontmatter(record.files.get(path) ?? "", path);
    if (!split.ok) {
      refusals.push(split.refusal);
      continue;
    }
    const fm = split.frontmatter;
    const keys = fm === null ? [] : Object.keys(fm);
    if (fm === null || keys.length !== 1 || fm["type"] !== "Summary") {
      refusals.push({
        slug: "ksor-attachment-frontmatter",
        path,
        why: `a summary's frontmatter is exactly \`type: Summary\` — it inherits its parent's audience, status and takedown, and any other key would claim governance a non-node cannot carry (found: ${keys.length === 0 ? "none" : keys.join(", ")})`,
        fix: "replace the frontmatter with `---\\ntype: Summary\\n---`",
      });
      continue;
    }
    const parent = concepts.get(parentId);
    if (parent !== undefined)
      checkLinks(path, parent.audience, split.body, parentId, concepts, refusals);
  }

  // ── rules that need the policy ─────────────────────────────────────────
  for (const concept of concepts.values()) {
    const body = bodies.get(concept.id) ?? "";
    refusals.push(...checkFootnotes(concept.path, body, concept.sourceIds));
    checkLinks(concept.path, concept.audience, body, concept.id, concepts, refusals);
    checkSupersession(concept, concepts, refusals);
    if (policy !== null) checkAgainstPolicy(concept, policy, refusals);
  }

  // ── indexes ────────────────────────────────────────────────────────────
  const dirs = record.dirs
    .filter((d) => d.startsWith(KNOWLEDGE))
    .map((d) => d.slice(KNOWLEDGE.length));
  const generated = generateIndexes({
    title,
    concepts: [...concepts.values()].map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      order: c.order,
    })),
    dirs,
  });
  const indexes = new Map([...generated].map(([p, text]) => [`${KNOWLEDGE}${p}`, text]));
  if (options.mode === "check") {
    const expected = new Set(indexes.keys());
    const committed = paths.filter((p) => p.startsWith(KNOWLEDGE) && p.endsWith("/index.md"));
    for (const path of new Set([...expected, ...committed])) {
      if (record.files.get(path) === indexes.get(path)) continue;
      refusals.push({
        slug: "ksor-index-stale",
        path,
        why: indexes.has(path)
          ? "the committed index does not match what the tree generates — an index is never authored"
          : "an index exists for a directory that earns none",
        fix: "run `ksor build`, which regenerates every index, and commit the result",
      });
    }
  }

  // ── the ledger ─────────────────────────────────────────────────────────
  const ledgerResult = parseLedger(record.files.get(LEDGER_PATH) ?? null, LEDGER_PATH);
  let ledgerIds: readonly string[] = [];
  if (!ledgerResult.ok) {
    refusals.push(...ledgerResult.refusals);
  } else {
    const ledger = ledgerResult.ledger;
    ledgerIds = ledger.ids;
    if (policy !== null) refusals.push(...checkLedgerActors(ledger, policy.takedownActors));
    refusals.push(
      ...checkLedgerAgainstTree(ledger, {
        conceptIds: new Set(concepts.keys()),
        dirs: new Set(dirs),
      }),
    );
    refusals.push(...checkLedgerShrank(ledger.ids, options.ledgerBaselines ?? []));
  }

  return {
    refusals: sortRefusals(refusals),
    indexes,
    concepts: [...concepts.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    ledgerIds,
    policy,
  };
}

/** Returns the instance title for the root index; refuses a pre-profile instance (one reader: `record/instance.ts`). */
function checkInstance(text: string | null, refusals: Refusal[]): string {
  if (text === null) return "Index";
  const parsed = parseInstanceDocument(text, INSTANCE_PATH);
  if (!parsed.ok) {
    refusals.push(...parsed.refusals);
    return "Index";
  }
  return parsed.instance.title;
}

function checkLinks(
  path: string,
  audience: readonly string[],
  body: string,
  sourceId: string,
  concepts: ReadonlyMap<string, Concept>,
  refusals: Refusal[],
): void {
  const seen = new Set<string>();
  for (const target of linkTargets(body)) {
    const id = resolveLink(sourceId, target);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const found = concepts.get(id);
    if (found === undefined || mayReach(audience, found.audience)) continue;
    refusals.push({
      slug: "ksor-link-widens",
      path,
      why: `links to \`${id}\` (audience [${found.audience.join(", ")}]), which not every reader of this document (audience [${audience.join(", ")}]) may read`,
      fix: "widen the target's audience, narrow this document's, or remove the link",
    });
  }
}

function checkSupersession(
  concept: Concept,
  concepts: ReadonlyMap<string, Concept>,
  refusals: Refusal[],
): void {
  if (concept.status !== "deprecated" || concept.supersededBy === null) return;
  const target = concepts.get(concept.supersededBy);
  const reason =
    target === undefined
      ? "names no concept"
      : target.status !== "stable"
        ? `is \`${target.status}\`, not \`stable\``
        : !mayReach(concept.audience, target.audience)
          ? `has audience [${target.audience.join(", ")}], which not every reader of this document may read`
          : null;
  if (reason === null) return;
  refusals.push({
    slug: "ksor-supersession-strands",
    path: concept.path,
    why: `\`ksor.superseded_by: ${concept.supersededBy}\` ${reason} — a reader sent to the successor would be stranded`,
    fix: "point at a stable successor every reader of this document may read, or drop the pointer",
  });
}

function checkAgainstPolicy(concept: Concept, policy: Policy, refusals: Refusal[]): void {
  for (const a of concept.audience) {
    if (a === "public" || policy.audiences.includes(a)) continue;
    refusals.push({
      slug: "ksor-audience-unregistered",
      path: concept.path,
      why: `\`ksor.audience\` names \`${a}\`, which the policy's registry does not declare — an unknown identifier is a typo, and a typo reads as a restriction`,
      fix: `use \`public\` or a registered audience (${policy.audiences.join(", ") || "none registered"}), or register it in \`.ksor/governance.yaml\``,
    });
  }
  if (concept.approval !== null) {
    const approvers = resolveApprovers(policy, concept.id, concept.type);
    if (!approvers.ok) refusals.push(approvers.refusal);
    else if (!approvers.actors.includes(concept.approval.by)) {
      refusals.push({
        slug: "ksor-approver-unauthorised",
        path: concept.path,
        why: `\`ksor.approval.by: ${concept.approval.by}\` is not in the approval authority set the policy resolves for this concept (${approvers.actors.join(", ")})`,
        fix: "record an approval by an authorised actor, or extend the policy in a reviewed change",
      });
    }
  }
  if (concept.deprecated !== null) {
    const resolved = resolveOwner(policy, concept.id, concept.type);
    if (!resolved.ok) {
      refusals.push(resolved.refusal);
      return;
    }
    const owner = resolved.owner ?? concept.owner;
    const by = concept.deprecated.by;
    if (by !== owner && !policy.takedownActors.includes(by)) {
      refusals.push({
        slug: "ksor-deprecator-unauthorised",
        path: concept.path,
        why: `\`ksor.deprecated.by: ${by}\` is neither the owner (${owner ?? "none resolved"}) nor a takedown authority`,
        fix: "record the deprecation by the owner or a takedown authority (R23)",
      });
    }
  }
}
