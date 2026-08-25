/**
 * The record adapter — the checked record becomes a corpus manifest.
 *
 * Converted from the oracle's plain-tree walk (sor-agentfactory @ b554f91,
 * ingest/adapters/plain_tree.py) and then rebuilt on the profile (record spec;
 * decision 26): the adapter no longer reads frontmatter itself. `checkRecord`
 * has already parsed every concept through the ONE profile reader and refused
 * what the profile refuses, so what arrives here is a tree that is known to be
 * well-formed, and the adapter's only job is identity and order:
 *
 *   - every directory under `knowledge/` is the `knowledge/<dir>#section`
 *     shell — no body, no governance of its own, carrying the UNION of its
 *     descendants' audience lists so one predicate admits it iff a descendant
 *     is visible (research/okf-native.md §2 item 4). The `<dir>/index`
 *     identity is retired: a generated `index.md` creates no node;
 *   - every concept is a `document` node at `knowledge/<id>` — path is
 *     identity (`sor_id` retired, decision 26);
 *   - reserved names (`index.md`, `log.md`, `README.md`) and companions create
 *     no node and are never chunked;
 *   - ordering: the governed `order:` key, else name (lib/order-rule.ts), the
 *     same rule the site's sidebar and the generated index use.
 *
 * The kernel cannot tell this manifest from any other adapter's.
 */

import { createHash } from "node:crypto";

import {
  compareSiblings,
  folderOrder,
  orderValue,
  tieKey,
  type Sibling,
} from "../../lib/order-rule.js";
import type { CheckResult } from "../../record/check.js";
import { humanise } from "../../record/index-file.js";
import type { Concept } from "../../record/profile.js";
import { governanceOf, sectionGovernance } from "../governance.js";
import {
  type Manifest,
  type ManifestFile,
  type ManifestNode,
  manifestFile,
  manifestNode,
  manifestToJson,
  parseManifest,
} from "../manifest.js";

/** The bundle root's name — the first segment of every stable_id. */
export const BUNDLE = "knowledge";

export interface RecordAdapterOptions {
  readonly corpusId: string;
  readonly sourceCommit: string;
}

export interface PlainTreeResult {
  readonly manifest: Manifest;
  /** manifest path → record-relative source path (`knowledge/<id>.md`). */
  readonly sources: ReadonlyMap<string, string>;
}

interface Entry extends Sibling {
  readonly kind: "dir" | "concept";
  readonly name: string;
  readonly concept: Concept | null;
}

/** The pure projection: a checked record → manifest + sources. */
export function buildManifestFromRecord(
  check: Pick<CheckResult, "concepts">,
  dirs: readonly string[],
  options: RecordAdapterOptions,
): PlainTreeResult {
  const nodes: ManifestNode[] = [];
  const files: ManifestFile[] = [];
  const sources = new Map<string, string>();

  // Bundle-relative directories, every ancestor included even when the walker
  // reported only the leaf.
  const dirSet = new Set<string>();
  for (const raw of dirs) {
    const d = raw.startsWith(`${BUNDLE}/`) ? raw.slice(BUNDLE.length + 1) : raw;
    for (let cur = d; cur !== ""; cur = parentOf(cur)) dirSet.add(cur);
  }
  const conceptsByDir = new Map<string, Concept[]>();
  for (const c of check.concepts) {
    const dir = parentOf(c.id);
    conceptsByDir.set(dir, [...(conceptsByDir.get(dir) ?? []), c]);
    for (let cur = dir; cur !== ""; cur = parentOf(cur)) dirSet.add(cur);
  }

  // The shape `folderOrder` folds over, built once: directory → the orders of
  // the concepts sitting directly in it.
  const ordersByDir: (readonly [string, readonly number[]])[] = [...conceptsByDir].map(
    ([d, cs]) => [d, cs.map((c) => orderValue(c.order))] as const,
  );

  const audiencesBeneath = (dir: string): (readonly string[])[] =>
    check.concepts.filter((c) => c.id.startsWith(`${dir}/`)).map((c) => c.audience);

  const walk = (dir: string, parentSid: string | null): void => {
    const entries: Entry[] = [];
    for (const c of conceptsByDir.get(dir) ?? []) {
      entries.push({
        kind: "concept",
        name: baseOf(c.id),
        concept: c,
        order: orderValue(c.order),
        tie: tieKey(`${baseOf(c.id)}.md`),
      });
    }
    for (const d of dirSet) {
      if (parentOf(d) !== dir) continue;
      entries.push({
        kind: "dir",
        name: baseOf(d),
        concept: null,
        // Descendants included — `folderOrder` is the ONE answer, shared with
        // the index generator the site reads its reading order from. Folding
        // over the directory's own concepts only made a folder whose ordered
        // documents live one level deeper unordered here and first there.
        order: folderOrder(ordersByDir, d),
        tie: tieKey(baseOf(d)),
      });
    }
    entries.sort(compareSiblings);
    let position = 0;
    for (const e of entries) {
      position += 1;
      const id = dir === "" ? e.name : `${dir}/${e.name}`;
      if (e.kind === "dir") {
        const sid = `${BUNDLE}/${id}#section`;
        nodes.push(
          manifestNode({
            stable_id: sid,
            slug: slugify(e.name),
            title: humanise(e.name),
            kind: "section",
            parent: parentSid,
            position,
            governance: sectionGovernance(audiencesBeneath(id)),
          }),
        );
        walk(id, sid);
      } else {
        const c = e.concept!;
        const sid = `${BUNDLE}/${c.id}`;
        nodes.push(
          manifestNode({
            stable_id: sid,
            slug: slugify(e.name),
            title: c.title,
            kind: "document",
            parent: parentSid,
            position,
            summary: c.description,
            governance: governanceOf(c),
          }),
        );
        const path = `${BUNDLE}/${c.id}.md`;
        files.push(manifestFile({ path, node: sid }));
        sources.set(path, path);
      }
    }
  };
  walk("", null);

  const manifest: Manifest = {
    format: 1,
    corpus_id: options.corpusId,
    source_commit: options.sourceCommit,
    nodes,
    files,
  };
  parseManifest(JSON.stringify(manifestToJson(manifest))); // never emit what ingest would refuse
  return { manifest, sources };
}

function parentOf(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash === -1 ? "" : id.slice(0, slash);
}

function baseOf(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug !== "") return slug;
  // a non-Latin name slugs to nothing — derive a stable slug, never crash
  return "x-" + createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
}
