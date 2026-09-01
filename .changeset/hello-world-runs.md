---
"@panaversity/ksor": patch
---

Fix the hello-world tutorial, which could not be completed as written.

Three defects, all found by walking the published 0.0.54 rather than by reading:

- Step 3's document declared `type: Policy`. `Policy` is a reserved type, so the
  record demands `sources` — `ksor build`, `npm run check` and the dev server all
  refused it, and steps 4 through 10 were unreachable. It is now `type: Document`,
  the type the profile promises never to reserve, with a note on why and on what
  an agent should do when it reaches for a reserved one.
- Step 1 scaffolds with `npx`, which emits an **npm** project, and every command
  after it said `pnpm`. On that project `pnpm install && pnpm dev` fails with
  `sh: next: command not found`. All sixteen commands are npm's now, and the step
  that explains manager detection says which one the rest of the tutorial speaks.
- The captured outputs had been trimmed after capture, in a document whose second
  paragraph promises they were "pasted as it appeared": `ksor serve`'s boot report
  was missing the `trust` line it has always printed, the build outputs were
  missing their timestamp, `source:` and `wrote` lines, and the port-conflict
  refusal was quoted offering `pnpm serve` where it says `ksor serve`.

The walk also surfaced that `ksor init` leaves a repo with no commits, so every
reader's first build prints `source: unspecified`. Rather than hide it, the
tutorial now shows it and folds `git commit` into the approval step — which is
where provenance belongs anyway, and which lets the second build print a real
commit sha.

Only the tutorial and the test that pins its prompts changed; nothing an adopter
installs behaves differently.
