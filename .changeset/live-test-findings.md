---
"@panaversity/ksor": patch
---

Five things a live walk of the published 0.0.59 found, fixed.

**`verify.mjs` reported ordinary markdown as an invented name.** Its name regex
let `\s+` cross a blank line, so a `## Meals` heading followed by a paragraph
opening `On travel…` was extracted as the name "Meals On" and reported as
changed-or-introduced. That fires on the first document an agent converts —
the check meant to make conversion trustworthy was crying wolf. Names are now
capitalised words on ONE line; a name the source never mentions is still caught.

**A scaffold followed verbatim published its first generation untraceably.**
`ksor init` runs `git init` and leaves zero commits, and its own epilogue went
install → dev → provision → refresh with no commit in between — so every
adopter's first publish said `source: unspecified` and skipped the R23
change-control check, which had no history to compare against. The epilogue now
says to commit before publishing, which is the whole fix.

**A plain build left a stale bundle tree unmentioned.** `ksor build` recomputes
every `bundles[].sha256` in the lock but only `--bundles` writes the directory,
so after one `--bundles` run and any ordinary build the lock claimed a digest
nothing on disk produced, while the tree that exists to be SENT somewhere aged
silently. A plain build now says which build the directory came from and how to
refresh it. Reported, never deleted: it is the adopter's output and may be
mid-handover.

**Tutorial 01's first build block was one line short.** R23 landed the day after
that walk, so the shipped block omitted `change-control: not checked` on a page
whose headline claim is that every output was pasted as it appeared. Re-captured
on 0.0.59, with a paragraph on what both honesty lines mean and when they go.

**The dev server's `/llms.txt` does not change after an approval.** Not a bug and
not fixable in the route: `output: "export"` requires a static route handler, so
`pnpm dev` computes it once per process while the document's page beside it
updates. Stated in the emitted README's troubleshooting table and in the tutorial
step whose own prompt is "Why isn't my refund policy in llms.txt?" — verified by
testing both alternatives, each of which breaks the export.
