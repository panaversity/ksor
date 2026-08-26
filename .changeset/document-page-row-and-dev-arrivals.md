---
"@panaversity/ksor": patch
---

**A document page that reads at a glance, and a dev server that sees new
documents again.**

The governance row is two tiers. It was one line carrying 79 characters, of
which the approver was 32 (41%) and the three labels 19 (24%) — so a producer
id was the longest thing on the page and the two facts a reader actually scans
for, what state this is in and whether anyone has checked it, competed with it.
Now the chips lead with Export beside them, and provenance sits beneath in
muted weight. Nothing is hidden: decision 21 requires a governance act to name
its actor and decision 27 requires a non-human approver to be disclosed, so the
approver moved one line down, not one click away, and every byte of it is still
in the server-rendered markup an agent parses.

Export no longer lands in the middle of the row. It and the reading time each
carried their own `ms-auto`, and on a row narrow enough to wrap they shared a
line — where two auto margins SPLIT the free space rather than stacking. They
are one right-hand cluster now.

**And adding a document to `knowledge/` while `pnpm dev` runs shows it again.**
This regressed in 0.0.41: `refreshStage` walked the STAGE and skipped anything
the stage did not already hold, so an arrival — which has no file to walk onto
— was never written, and the manifest naming what publishes never learned about
it. Measured: `/docs/<new>/` 404 → 200, sidebar 0 → 1, `llms.txt` 0 → 1;
0.0.40 served it at 200, so this is a repair rather than a feature. Removals
still wait for a restart, deliberately — a deleted file leaves fumadocs'
generated imports pointing at something gone.

The comment explaining why arrivals were refused was also wrong, and is
corrected: fumadocs-mdx 15.3.0 DOES regenerate on a write into the
dot-prefixed stage. Our own function was the blocker.

Finally, the starter's `knowledge/surfaces/overview.md` was titled `Surfaces`
inside the Surfaces section, so its breadcrumb read `Surfaces › Surfaces`. It
is `Overview` now.
