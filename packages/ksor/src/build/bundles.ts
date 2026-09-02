/**
 * `ksor build --bundles` (build spec §1 step 4; KSP-001 Class E, R15): one
 * OKF bundle per canonical viewer, holding exactly what that viewer's MACHINE
 * surfaces publish. Pure — the CLI hands in the record the loader read and
 * the admission the lock decided, and writes what comes back.
 *
 * Selection is NOT re-derived here. A concept is in the bundle for viewer V
 * iff the lock admits it to V (`admittedViewersOf`: stable, effective,
 * unexpired, undenied, audience-overlapping) — the same predicate the site's
 * stage and the door's `admitted` set compose (decision 18). What this module
 * adds is what travels WITH a concept: its companions, the assets its body
 * references, and an index for every directory of the filtered tree —
 * regenerated, never the committed map, which lists every status and every
 * audience (decision 27's index clause).
 *
 * R5 for a directory someone will send somewhere: no byte of a concept the
 * viewer may not read. The AUDIENCE half is closed upstream — the checker
 * refuses a link, a supersession pointer or a companion body that reaches a
 * narrower audience (`ksor-link-widens`), and an asset positioned under a
 * narrower directory with it — so a body copied verbatim cannot name what its
 * own readers may not open. A link to a concept excluded for another reason
 * (a draft, one not yet effective, one past `stale_after`, one denied) is a
 * different case: R5 is about audience, the body stays verbatim rather than
 * being rewritten, and the link dangles — REPORTED per bundle rather than
 * silently shipped, which is what `dangling` is for.
 */
import { attachmentKindOf, parentDocumentOf } from "@panaversity/ksor-content";
import {
  generateIndexes,
  linkTargets,
  resolveLink,
  sha256Hex,
  splitFrontmatter,
} from "@panaversity/ksor-content/record";

const KNOWLEDGE = "knowledge/";

export interface BundleConcept {
  /** Bundle-relative id (path without `.md`). */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly order: number | null;
  /** The canonical viewer names whose machine surfaces contain it — `documents[].admitted` in the lock. */
  readonly admitted: readonly string[];
}

export interface BundleInput {
  /** The instance title — the root index's heading. */
  readonly title: string;
  /** Canonical viewer NAMES in the lock's order: `public`, then each registered audience. */
  readonly viewers: readonly string[];
  readonly concepts: readonly BundleConcept[];
  /** Record-relative path → text, as the loader read them; only `knowledge/**` is read here. */
  readonly files: ReadonlyMap<string, string>;
  /** Record-relative path → bytes, for every non-markdown file under `knowledge/`. */
  readonly assets: ReadonlyMap<string, Uint8Array>;
  /** Record-relative directories under `knowledge/`, empty ones included. */
  readonly dirs: readonly string[];
}

/** A link from a body this bundle holds to a concept it excludes; both bundle-relative, with `.md`. */
export interface DanglingLink {
  readonly from: string;
  readonly to: string;
}

export interface Bundle {
  readonly viewer: string;
  /** Bundle-relative path → bytes: concepts, companions, referenced assets, regenerated indexes. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly dangling: readonly DanglingLink[];
}

/**
 * The companions of every concept, keyed by the parent's id — derived from the
 * canonical attachment rule, never from a suffix list of this module's own
 * (`build.integration.test.ts` refuses a hand copy anywhere in this package).
 */
function companionsByParent(files: ReadonlyMap<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of files.keys()) {
    if (!file.startsWith(KNOWLEDGE)) continue;
    const rel = file.slice(KNOWLEDGE.length);
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    if (attachmentKindOf(base) === null) continue;
    const parent = parentDocumentOf(base);
    if (parent === null) continue;
    const parentId = `${rel.slice(0, rel.length - base.length)}${parent}`.replace(/\.md$/, "");
    out.set(parentId, [...(out.get(parentId) ?? []), rel]);
  }
  return out;
}

export function planBundles(input: BundleInput): Bundle[] {
  const companions = companionsByParent(input.files);
  const conceptIds = new Set(input.concepts.map((c) => c.id));
  const dirs = input.dirs
    .filter((d) => d.startsWith(KNOWLEDGE))
    .map((d) => d.slice(KNOWLEDGE.length));

  return input.viewers.map((viewer) => {
    const files = new Map<string, Uint8Array>();
    const admitted = input.concepts.filter((c) => c.admitted.includes(viewer));
    const held = new Set(admitted.map((c) => c.id));
    const dangling: DanglingLink[] = [];

    for (const concept of admitted) {
      // The concept, then its companions — reached only through an admitted
      // parent, which is how a companion inherits its parent's audience,
      // lifecycle and takedown (decision 24): by POSITION, not by a rule of its own.
      const bodies: (readonly [string, string])[] = [
        [`${concept.id}.md`, input.files.get(`${KNOWLEDGE}${concept.id}.md`) ?? ""],
        ...(companions.get(concept.id) ?? []).map(
          (rel) => [rel, input.files.get(`${KNOWLEDGE}${rel}`) ?? ""] as const,
        ),
      ];
      for (const [rel, text] of bodies) {
        files.set(rel, Buffer.from(text, "utf8"));
        // What the body reaches. An asset rides along — ONLY a referenced one,
        // or an image nothing published mentions would ship into every bundle.
        // A companion's links resolve against its parent's id, exactly as the
        // checker judges them. A concept this bundle excludes is named.
        const split = splitFrontmatter(text, rel);
        const seen = new Set<string>();
        for (const target of linkTargets(split.ok ? split.body : text)) {
          const id = resolveLink(concept.id, target);
          if (id === null || seen.has(id)) continue;
          seen.add(id);
          const asset = input.assets.get(`${KNOWLEDGE}${id}`);
          if (asset !== undefined) files.set(id, asset);
          else if (conceptIds.has(id) && !held.has(id)) dangling.push({ from: rel, to: `${id}.md` });
        }
      }
    }

    // Regenerated for THIS tree: a directory with nothing admitted earns no
    // index and no bullet in its parent, so neither its name nor its titles
    // reach a viewer that may not read it.
    const indexes = generateIndexes({
      title: input.title,
      concepts: admitted.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        order: c.order,
      })),
      dirs,
    });
    for (const [rel, text] of indexes) files.set(rel, Buffer.from(text, "utf8"));

    return { viewer, files, dangling };
  });
}

/**
 * The digest `build.lock.json` records for a bundle: sha256 over the JSON of
 * its sorted `[path, sha256(bytes)]` pairs. Stated this plainly so a recipient
 * holding only the directory can recompute it and match it to a publication.
 */
export function bundleDigest(files: ReadonlyMap<string, Uint8Array>): string {
  const pairs = [...files]
    .map(([rel, bytes]) => [rel, sha256Hex(bytes)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sha256Hex(JSON.stringify(pairs));
}
