import { readFileSync } from "node:fs";
import path from "node:path";

import type { LifecycleBadge } from "./lifecycle-rule";

/**
 * What staging decided, for the surfaces that read the stage: which pages the
 * machine artefacts admit, the badge a human page shows, and the stamps every
 * machine artefact carries (build spec §3). Written beside the stage by
 * `stage-knowledge.ts` — the ONE place the §2.5 table is evaluated — so a
 * route cannot re-derive admission with a second rule that drifts.
 */

/** Where staging writes it, relative to the site directory every build runs from. */
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
