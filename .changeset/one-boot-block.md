---
"@panaversity/ksor": patch
---

The bearer door's key line joins the boot block instead of interrupting it

In bearer mode the line naming where the signing keys were discovered printed
before the aligned posture block and in a different shape, so it read as a stray
log line rather than as part of what the server was telling you about itself. It
is a `keys` row in the block now, under `auth`, resolved at boot exactly as
before.
