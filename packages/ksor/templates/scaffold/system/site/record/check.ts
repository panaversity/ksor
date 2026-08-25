/**
 * The record checker — ONE rule set (record spec §6), run by `ksor build`,
 * `ksor ingest` and the emitted `check.mjs`. It reads an in-memory tree so
 * the same function judges a checkout, a staged projection and a test
 * fixture identically; `load.ts` is the one place the filesystem is touched.
 */
import { mayReach } from "../lib/audience-rule";
import { checkFootnotes, linkTargets, resolveLink } from "./citations";
import { splitFrontmatter } from "./frontmatter";
import { checkHygiene } from "./hygiene";
import { generateIndexes } from "./index-file";
import { parseInstanceDocument } from "./instance";
import {
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerAppendOnly,
  ledgerDigests,
  parseLedger,
  type LedgerBaseline,
} from "./ledger";
import { parsePolicy, resolveApprovers, resolveOwner, type Policy } from "./policy";
import { conceptIdOf, parseConcept, type Concept } from "./profile";
import { sortRefusals, type Refusal } from "./refusal";

export interface RecordFiles {
  /** Record-relative path → text, for every file the checker reads (`knowledge/**`, `.ksor/*.yaml`, `instance.md`). */
  readonly files: ReadonlyMap<string, string>;
  /** Record-relative directories under `knowledge/`, empty ones included. */
  readonly dirs: readonly string[];
  /** Every other file under `knowledge/` (images, strays) with its bytes; OS junk excluded. */
  readonly assets?: ReadonlyMap<string, Uint8Array>;
  /** Symbolic links the loader met and did not follow. */
  readonly symlinks?: readonly string[];
}

export interface CheckOptions {
  /** `check` is read-only and refuses a stale index; `build` regenerates and never does. */
  readonly mode: "check" | "build";
  /** What the ledger must still contain, entry by entry (git history, the committed lock). */
  readonly ledgerBaselines?: readonly LedgerBaseline[];
}

export interface CheckResult {
  readonly refusals: readonly Refusal[];
  /** Record-relative index path → bytes, generated from the tree. */
  readonly indexes: ReadonlyMap<string, string>;
  readonly concepts: readonly Concept[];
  /** `(id, digest)` per entry, in file order — what the lock records so the next build can compare text. */
  readonly ledgerEntries: readonly { readonly id: string; readonly digest: string }[];
  readonly policy: Policy | null;
}

const KNOWLEDGE = "knowledge/";
const POLICY_PATH = ".ksor/governance.yaml";
const LEDGER_PATH = ".ksor/takedowns.yaml";
const INSTANCE_PATH = "instance.md";
const COMPANION = /\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/;
/** What a link may resolve to besides a concept: companions, assets, directories, indexes, the root. */
interface LinkTargets {
  readonly concepts: ReadonlyMap<string, Concept>;
  readonly exists: (id: string) => boolean;
  /** Bundle-relative ids of the record's asset files — `secret/org-chart.png`. */
  readonly assets: ReadonlySet<string>;
  /** Bundle-relative directories — `secret`. A link may name one, and it inherits by POSITION. */
  readonly directories: ReadonlySet<string>;
}

export function checkRecord(record: RecordFiles, options: CheckOptions): CheckResult {
  const refusals: Refusal[] = [];
  const paths = [...record.files.keys()].sort();

  const policyResult = parsePolicy(record.files.get(POLICY_PATH) ?? null, POLICY_PATH);
  const policy = policyResult.ok ? policyResult.policy : null;
  if (!policyResult.ok) refusals.push(...policyResult.refusals);

  const title = checkInstance(record.files.get(INSTANCE_PATH) ?? null, refusals);

  const assets = record.assets ?? new Map<string, Uint8Array>();

  // ── the bundle: concepts, companions, reserved names ───────────────────
  // A document that fails to parse is not a concept, so the indexes generated
  // below are the indexes of a DIFFERENT tree — see the staleness block.
  let dropped = false;
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
    // `.mdx` and every other stray are the hygiene rules' to name.
    const text = record.files.get(path) ?? "";
    const split = splitFrontmatter(text, path);
    if (!split.ok) {
      refusals.push(split.refusal);
      dropped = true;
      continue;
    }
    const parsed = parseConcept(path, split.frontmatter ?? {});
    if (!parsed.ok) {
      refusals.push(...parsed.refusals);
      dropped = true;
      continue;
    }
    concepts.set(parsed.concept.id, parsed.concept);
    bodies.set(parsed.concept.id, split.body);
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
  const dirSet = new Set(record.dirs);
  const targets: LinkTargets = {
    concepts,
    assets: new Set([...assets.keys()].map((p) => p.slice(KNOWLEDGE.length))),
    directories: new Set(dirs),
    exists: (id) =>
      id === "" ||
      concepts.has(id) ||
      record.files.has(`${KNOWLEDGE}${id}.md`) ||
      record.files.has(`${KNOWLEDGE}${id}`) ||
      assets.has(`${KNOWLEDGE}${id}`) ||
      dirSet.has(`${KNOWLEDGE}${id}`) ||
      indexes.has(`${KNOWLEDGE}${id}.md`),
  };

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
      checkLinks(path, parent.audience, split.body, parentId, targets, refusals);
  }

  refusals.push(
    ...checkHygiene({
      textPaths: paths.filter((p) => p.startsWith(KNOWLEDGE)),
      assets,
      dirs: record.dirs,
      symlinks: record.symlinks ?? [],
      conceptIds: new Set(concepts.keys()),
    }),
  );

  // ── rules that need the policy ─────────────────────────────────────────
  for (const concept of concepts.values()) {
    const body = bodies.get(concept.id) ?? "";
    refusals.push(...checkFootnotes(concept.path, body, concept.sourceIds));
    checkLinks(concept.path, concept.audience, body, concept.id, targets, refusals);
    checkSupersession(concept, concepts, refusals);
    if (policy !== null) checkAgainstPolicy(concept, policy, refusals);
  }

  // Staleness is only answerable when every document parsed. A refused document
  // is not a concept, so its directory generates a different index or none at
  // all, and comparing against that produced one extra refusal per affected
  // directory AND per ancestor — each prescribing "run `ksor build`", which
  // refuses on the real error and writes nothing, and each saying of a correct
  // index that it belongs to "a directory that earns none". One bad document,
  // one problem; fix it and the next run answers this honestly.
  if (options.mode === "check" && !dropped) {
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
  let ledgerEntries: readonly { readonly id: string; readonly digest: string }[] = [];
  if (!ledgerResult.ok) {
    refusals.push(...ledgerResult.refusals);
  } else {
    const ledger = ledgerResult.ledger;
    ledgerEntries = ledgerDigests(ledger);
    if (policy !== null) refusals.push(...checkLedgerActors(ledger, policy.takedownActors));
    refusals.push(
      ...checkLedgerAgainstTree(ledger, {
        conceptIds: new Set(concepts.keys()),
        dirs: new Set(dirs),
      }),
    );
    refusals.push(...checkLedgerAppendOnly(ledger, options.ledgerBaselines ?? []));
  }

  return {
    refusals: sortRefusals(refusals),
    indexes,
    concepts: [...concepts.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    ledgerEntries,
    policy,
  };
}

/** Returns the instance title for the root index; refuses a pre-profile instance (one reader: `record/instance.ts`). */
function checkInstance(text: string | null, refusals: Refusal[]): string {
  if (text === null) {
    refusals.push({
      slug: "ksor-instance-format",
      path: INSTANCE_PATH,
      why: "instance.md is missing — it says what this record is authoritative for; without it nothing states the record's scope and the MCP server has no instructions",
      fix: "restore instance.md from git history, or run the intake-interview skill to write it",
    });
    return "Index";
  }
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
  targets: LinkTargets,
  refusals: Refusal[],
): void {
  const seen = new Set<string>();
  for (const target of linkTargets(body)) {
    const id = resolveLink(sourceId, target);
    if (id === null) {
      if (seen.has(target)) continue;
      seen.add(target);
      refusals.push({
        slug: "ksor-link-escapes",
        path,
        why: `\`${target}\` leaves the record — the record must survive without the system, and an outward link breaks the walk-away promise`,
        fix: "move the file into knowledge/ beside the document, or use an absolute URL",
      });
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    if (!targets.exists(id)) {
      refusals.push({
        slug: "ksor-link-dead",
        path,
        why: `dead link \`${target}\` — nothing at \`knowledge/${id}\`; a record with dead internal links serves different truths by path`,
        fix: "fix the path (it resolves against this document's directory, or against knowledge/ when it starts with `/`) or remove the link",
      });
      continue;
    }
    const found = targets.concepts.get(id);
    if (found === undefined) {
      nonConceptWidens(path, audience, id, targets, refusals);
      continue;
    }
    if (mayReach(audience, found.audience)) continue;
    refusals.push({
      slug: "ksor-link-widens",
      path,
      why: `links to \`${id}\` (audience [${found.audience.join(", ")}]), which not every reader of this document (audience [${audience.join(", ")}]) may read`,
      fix: "widen the target's audience, narrow this document's, or remove the link",
    });
  }
}

/** A companion's id → its parent concept's, in both shapes `resolveLink` produces. */
const COMPANION_TARGET = /\.(summary|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/;

/**
 * Every link target that is NOT a concept, judged by the same audience rule a
 * concept target is — because `targets.exists` admits five kinds and only one
 * of them used to be judged at all.
 *
 * A COMPANION inherits its parent's audience entirely (decision 24), so a link
 * to `secret/plan.summary.md` is a link to `secret/plan` under another name;
 * refusing the second while publishing the first was one branch's worth of
 * difference in a public build (found live: the id and the directory name both
 * reached the page HTML, the `/md/` twin and `llms-full.txt`).
 *
 * Everything else declares no audience, so it inherits one by POSITION — the
 * directory it names or sits in. If every concept under that directory is out
 * of the linking document's reach, then linking it publishes the directory's
 * NAME (and, for an asset, its bytes) into a build that excludes everything
 * else in it. Reproduced: a public policy with `![chart](/secret/org-chart.png)`
 * put `secret/org-chart.png` in the public `out/`, past a sweep that asserts no
 * byte of `secret/` appears.
 *
 * A directory holding NO concept says nothing about audience — an `images/`
 * folder is shared furniture — so the question is passed UP to the nearest
 * ancestor that does hold one. Found live: checking only the immediate
 * directory was defeated by nesting the asset one level deeper
 * (`secret/img/chart.svg`) — that directory holds no concept, so the rule said
 * nothing and the public build carried `secret/img/` and its bytes. The walk
 * stops below the bundle root, which stays furniture like `images/`: the root
 * holds the linking document itself, so testing it could only ever pass.
 */
function nonConceptWidens(
  path: string,
  audience: readonly string[],
  id: string,
  targets: LinkTargets,
  refusals: Refusal[],
): void {
  // The bundle root is the linking document's own directory.
  if (id === "") return;

  const parentId = id.replace(COMPANION_TARGET, "");
  const parent = parentId === id ? undefined : targets.concepts.get(parentId);
  if (parent !== undefined) {
    if (mayReach(audience, parent.audience)) return;
    refusals.push({
      slug: "ksor-link-widens",
      path,
      why: `links to \`${id}\`, which is the companion of \`${parentId}\` (audience [${parent.audience.join(", ")}]) and inherits its audience entirely, which not every reader of this document (audience [${audience.join(", ")}]) may read`,
      fix: "widen the parent's audience, narrow this document's, or remove the link",
    });
    return;
  }

  // Where the target sits: a directory (or its generated index) IS its own
  // position; anything else takes the directory it lives in.
  const asset = targets.assets.has(id);
  const dirOfId = id.slice(0, Math.max(id.lastIndexOf("/"), 0));
  const named = targets.directories.has(id);
  const indexDir = id.endsWith("/index") ? id.slice(0, -"/index".length) : null;
  const start = named ? id : (indexDir ?? dirOfId);
  const what = named
    ? `the directory \`${id}/\``
    : indexDir !== null
      ? `the generated index of \`${indexDir}/\``
      : asset
        ? `the asset \`${id}\``
        : `the file \`${id}\``;
  const carries = asset ? "that directory's name and its bytes" : "that directory's name";

  const concepts = [...targets.concepts.values()];
  for (let dir = start; dir !== ""; dir = dir.slice(0, Math.max(dir.lastIndexOf("/"), 0))) {
    const inside = concepts.filter((c) => c.id === dir || c.id.startsWith(`${dir}/`));
    if (inside.length === 0) continue;
    if (inside.some((c) => mayReach(audience, c.audience))) return;
    refusals.push({
      slug: "ksor-link-widens",
      path,
      why: `links to ${what} — \`${dir}/\` holds ${inside.length} concept${inside.length === 1 ? "" : "s"} and not one this document's readers (audience [${audience.join(", ")}]) may read, so publishing it puts ${carries} in a build that excludes everything else in it`,
      fix: `move it beside this document (or into a directory its readers may enter), or widen something under \`${dir}/\``,
    });
    return;
  }
}

function checkSupersession(
  concept: Concept,
  concepts: ReadonlyMap<string, Concept>,
  refusals: Refusal[],
): void {
  if (concept.supersededBy === null) return;
  if (concept.status !== "deprecated") {
    // The key goes "with deprecated" (§2.2). On a live concept it announces a
    // replacement no surface shows and no reader follows — the old checker
    // refused it, and a silent acceptance would be a governance claim nothing
    // enforces.
    refusals.push({
      slug: "ksor-supersession-strands",
      path: concept.path,
      why: `\`ksor.superseded_by: ${concept.supersededBy}\` on a \`${concept.status}\` concept — supersession is what \`deprecated\` means, so no surface will show this pointer and no reader will follow it`,
      fix: "set `status: deprecated` with `ksor.deprecated: { by, at }`, or drop the pointer",
    });
    return;
  }
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
