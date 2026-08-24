---
"@panaversity/ksor": patch
---

The second site shell is retired (decision 9 revision, owner). Nothing an
adopter runs changes: `ksor init` has always emitted Fumadocs and never offered
a selector.

The proof did its job. It was built to answer whether the shell is really a slot
or whether the surface contract was just a description of what Fumadocs happens
to do, and it kept that contract honest through the visibility model,
attachments and the staging lock. What it costs now exceeds that: every surface
the record grows — quizzes, decks, slides, code tabs — has to be built twice or
the conformance suite goes red, and the second build is one nobody ships.
Maintaining a shell no adopter runs, to prove a property no adopter exercises,
is the "code is liability" test failing.

The five-clause surface contract survives unchanged and is still asserted,
against one implementation. The other clauses decision 9 always leaned on —
adopter ownership of `system/site`, registry-distributed shells later — are what
carry replaceability now. The swap recipe lives in git history; an adopter
actually swapping a shell restores the property as something live rather than
hypothetical.
