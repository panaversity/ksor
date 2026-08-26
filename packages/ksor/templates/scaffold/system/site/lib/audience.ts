/**
 * The viewer this build publishes for (record spec §2.4, build spec §3).
 *
 * A concept holds a LIST of audience identifiers; a viewer holds a list that
 * always includes `public`; the concept is visible when the two overlap. The
 * rule itself is `overlaps` in `./audience-rule` — the kernel's copy, asserted
 * byte-identical — and this module only reads the viewer from the environment:
 *
 *     KSOR_AUDIENCE=public,internal pnpm build
 *
 * Unset means `[public]`, the only default that cannot leak. Whether each
 * identifier is REGISTERED is the staging's question, because the registry
 * lives in the policy (or the lock) and this module reads neither.
 */

/** Every refusal the site makes: a slug a pipeline can match, then the remedy. */
export function refuse(slug: string, what: string, why: string, fix: string): never {
  // The slug leads, so a pipeline can match on it, and the three lines below
  // it are the whole remedy — an operator never has to read this file.
  throw new Error(`${slug}: ${what}\n  why: ${why}\n  fix: ${fix}`);
}

let resolved: readonly string[] | null = null;

/**
 * The viewer list, `public` always among it. A function rather than a
 * module constant so the refusal is raised where staging can clean up after
 * it: thrown at import time it escaped the stage lock and left the previous,
 * wider stage on disk (found by the staging suite, 2026-08-25).
 */
export function viewer(): readonly string[] {
  if (resolved === null) resolved = readViewer();
  return resolved;
}

function readViewer(): readonly string[] {
  const raw = process.env.KSOR_AUDIENCE?.trim() ?? "";
  if (raw === "") return ["public"];
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  if (!list.includes("public")) {
    refuse(
      "ksor-viewer-omits-public",
      `KSOR_AUDIENCE="${raw}" does not include public`,
      "a viewer list always includes public — every reader of a restricted build is also a reader of the open one, and a build for a restricted audience alone would silently drop every public concept",
      `build with KSOR_AUDIENCE=public,${list.join(",")}`,
    );
  }
  return [...new Set(list)];
}

/**
 * What a restricted build calls itself, in the site chrome — so a leaked
 * screenshot of an internal site says which audiences it was built for. The
 * public build says nothing new.
 */
export function audienceNotice(): string | null {
  const list = viewer();
  return list.length === 1
    ? null
    : `${list.filter((a) => a !== "public").join(", ")} build — not for publication`;
}
