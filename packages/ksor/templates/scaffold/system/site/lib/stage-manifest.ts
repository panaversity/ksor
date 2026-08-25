import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { LifecycleBadge } from "./lifecycle-rule";
import { frontmatterText, splitFrontmatter } from "../record/frontmatter";
import { parseIndex, type IndexEntry } from "../record/index-file";

/**
 * What staging decided, for the surfaces that read the stage: which pages the
 * machine artefacts admit, the badge a human page shows, and the stamps every
 * machine artefact carries (build spec §3). Written beside the stage by
 * `stage-knowledge.ts` — the ONE place the §2.5 table is evaluated — so a
 * route cannot re-derive admission with a second rule that drifts.
 */

// Both relative to the site directory — the directory every build runs from
// (`pnpm build` is `pnpm -C system/site build`), which is also how fumadocs
// resolves a collection's `dir`.
export const STAGE_DIR = "./.staged-knowledge";
/** Where staging writes the manifest, beside the stage. */
export const STAGE_MANIFEST = "./.staged-knowledge.json";

export interface StagePage {
  /** Admitted to `llms.txt`, `llms-full.txt`, the `/md/` twin — the machine surfaces. */
  readonly machine: boolean;
  /** Why the machine surfaces declined, shown on the human page; null when they did not. */
  readonly badge: LifecycleBadge | null;
  readonly status: string;
  /** The successor's concept id, as `ksor.superseded_by` names it. */
  readonly supersededBy: string | null;
  readonly audience: readonly string[];
}

export interface StageStamps {
  readonly build_id: string | null;
  readonly source_commit: string | null;
  readonly dirty: boolean;
  readonly ksor_version: string | null;
  /** True in development, where no lock exists and nothing is published. */
  readonly unstamped: boolean;
}

export interface StageManifest {
  readonly format: 1;
  readonly name: string;
  readonly title: string;
  readonly description: string | null;
  readonly viewer: readonly string[];
  /** The instant every lifecycle decision in this build was taken at. */
  readonly asOf: string;
  readonly drafts: "hidden" | "shown";
  readonly stamps: StageStamps;
  /** Keyed by bundle-relative path (`policies/x.md`), the shape `page.path` carries. */
  readonly pages: Readonly<Record<string, StagePage>>;
}

let cached: StageManifest | null = null;

/** The manifest of the stage this build reads. Staging always runs first (`source.config.ts`). */
export function readStageManifest(): StageManifest {
  if (cached === null) {
    cached = JSON.parse(
      readFileSync(path.resolve(process.cwd(), STAGE_MANIFEST), "utf8"),
    ) as StageManifest;
  }
  return cached;
}

/** Is this page admitted to the machine surfaces? Unknown pages are not. */
export function machineAdmits(pagePath: string): boolean {
  return readStageManifest().pages[pagePath.replaceAll("\\", "/")]?.machine === true;
}

/** The page's own staging decision, or null for a path the stage does not hold. */
export function stagePageOf(pagePath: string): StagePage | null {
  return readStageManifest().pages[pagePath.replaceAll("\\", "/")] ?? null;
}

/**
 * The regenerated index of a bundle-relative directory (`""` for the root),
 * parsed — or null for a directory this viewer's stage does not hold. The
 * folder pages and the reading order read the stage's own indexes: what this
 * viewer may see, in the generator's order, and nothing else.
 */
export function readStagedIndex(dir: string): IndexEntry[] | null {
  const file = path.resolve(process.cwd(), STAGE_DIR, dir, "index.md");
  if (!existsSync(file)) return null;
  return parseIndex(readFileSync(file, "utf8"));
}

/**
 * The staged concept's own frontmatter, verbatim — the bytes its markdown twin
 * and its `llms-full.txt` block republish (build spec §3).
 *
 * Read from the STAGE rather than from `page.data`, because the stage holds
 * the record's file byte-for-byte: re-serialising the parsed object could only
 * emit the keys this shell knows about, and record spec §2.7 keeps the ones it
 * does not. Empty string for a concept with no frontmatter — a checker refusal,
 * so unreachable on a built record, but the twin must not crash on it.
 */
export function stagedFrontmatter(pagePath: string): string {
  const file = path.resolve(process.cwd(), STAGE_DIR, pagePath.replaceAll("\\", "/"));
  return frontmatterText(readFileSync(file, "utf8")) ?? "";
}

/**
 * The staged concept's BODY, verbatim — the bytes its markdown twin and its
 * `llms-full.txt` block republish under the frontmatter above.
 *
 * Read from the STAGE for the same reason the frontmatter is, and for one more:
 * the twin used to be built from fumadocs' PROCESSED markdown, which is the
 * mdast serialized after every remark plugin has run. `remarkImage` replaces a
 * local image with a generated import binding, so `![pub](../pub.png)` reached
 * `/md/` and `llms-full.txt` as `<img alt="pub" src="__img0" />` — a variable
 * name no consumer can resolve, while the MCP door over the SAME build returned
 * the record's own bytes. Two machine surfaces of one publication disagreeing
 * about one document is product principle 2, and `lib/alert-rule.ts` records
 * the same discipline for alerts: nothing of this shell's dialect reaches the
 * agent surfaces.
 */
export function stagedBody(pagePath: string): string {
  const rel = pagePath.replaceAll("\\", "/");
  const file = path.resolve(process.cwd(), STAGE_DIR, rel);
  const split = splitFrontmatter(readFileSync(file, "utf8"), rel);
  // A concept with no frontmatter is a checker refusal, so unreachable on a
  // built record — but the twin must not crash on it.
  return split.ok ? split.body : "";
}
