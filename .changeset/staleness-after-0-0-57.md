---
"@panaversity/ksor": patch
---

Twenty-six sentences that 0.0.44 through 0.0.57 had made false, found by a
sweep of every document against the tree and the published package, and fixed.

The two that ship on npm and would have stopped a reader: the package README
told `npx` users to run `pnpm install` — on the npm project `npx` emits, that
installs nothing under `system/site` and `pnpm dev` fails with `next: command
not found` (the tutorial had this exact fix; the README never got it) — and it
still advertised the two companion skills 0.0.56 removed. It also claimed its
abstention envelope was "pasted as it appeared" from a tutorial that never
reaches one; it now says what that block is.

The rest: `calibrate --check` was documented in three places (ingesting.md,
the CLI help, and by implication the scaffold) as "always exits 0" — a verdict
always does; an unreachable database exits 3 as for every verb, and the docs
now say so before anyone puts it in CI. `tool-surface.md` carried two copies of
one bullet, the stale one missing `audit`. `upgrading.md` gave `ksor init` a
path, which it refuses. Three documents said "two" authorization recipes where
`authorization.md` has four. The emitted `instance.md` still described "all
four study attachments" on a starter trimmed to one companion in 0.0.44;
`intake-interview` and `people.yaml` said add-sources writes display names (it
does not); the scaffold README counted two negated `.ksor/` paths where there
are three; two token figures in the emitted AGENTS.md predated their own
re-measurement; and a sentence about "this record's own seven" embeds
described a record that is not the one it is emitted into. Root AGENTS.md said
"three tiers" above a list of four. `docs/status.md` described the seed quiz
and deck as shipping (trimmed in 0.0.44), the kernel as "in progress" (released
in 0.0.8–0.0.18), and carried yesterday's date. The introduction tutorial's
"where to go next" now links the two tutorials that exist and numbers the rest
as the index does; hello world said "five skills"; make-it-yours said `pnpm dev`
in an npm project.

Every fix is a document catching up to code, except the CLI help line, which
is text.
