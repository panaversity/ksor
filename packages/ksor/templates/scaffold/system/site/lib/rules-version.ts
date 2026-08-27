/**
 * The ksor version whose rule modules this site carries — stamped by
 * `ksor init` and offered as a diff by `ksor migrate --write-site` (decision 4:
 * the site is adopter-owned, so nothing here updates itself).
 *
 * `build.lock.json` records the version that built it. When that is NEWER than
 * this stamp, the site would project a record with rules older than the ones
 * that checked it — the visibility leak's fifth door — so the build refuses
 * `ksor-site-outdated` instead (build spec §3).
 */
export const RULES_VERSION: string = "KSOR-STAMP-VERSION";
