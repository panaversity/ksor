---
"@panaversity/ksor": patch
---

A second review pass over the OKF-native record, and two of its findings were holes in the fixes themselves.

**An asset is judged by every directory above it, not only the one it sits in.** A public document linking `/secret/chart.svg` was refused; the same document linking `/secret/img/chart.svg` was not, because `secret/img/` holds no concept of its own and the rule read that as a shared `images/` folder. `ksor build` exited 0 and the public site carried the restricted directory's name and the asset's bytes. The check now climbs to the nearest ancestor that holds a concept, which leaves genuine shared folders alone and closes the nesting.

**A `.DS_Store` no longer makes the site unbuildable.** The stage walked `knowledge/` itself to decide what an asset is, while `build.lock.json` was written from the record loader — which skips OS junk and never reads a symlink as bytes. So the first time Finder touched `knowledge/`, every local `pnpm build` refused `ksor-lock-stale` naming a file `ksor build` cannot put in the lock, and the remedy that refusal prescribes wrote the identical lock. A symlinked asset hit the same disagreement and was reported as a stale lock rather than as the symlink it is. The stage now takes its assets from the record it already loaded, so there is one answer to what an asset is.

**The site checks the takedown ledger against git history, like the shipped checker does.** The lock is hand-editable and travels in the same change as the ledger, so on its own it cannot see an entry deleted: recomputing `ledger_sha256` and emptying `ledger_entries` made the two agree about a denial that was gone, and the denied document was published again. Outside a repository, or on a shallow clone, the build says so and falls back to the lock rather than refusing every shallow checkout.

**The all-draft build is tested by something that runs Next.** The fix for the route that used to throw when a build publishes no page was covered only by a staging test that never reaches the route module. The scaffold end-to-end suite now builds the starter exactly as `ksor init` emits it, before touching its policy, and asserts that not one draft reaches a page or `llms.txt`.
