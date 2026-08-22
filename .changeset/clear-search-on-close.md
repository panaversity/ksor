---
"@panaversity/ksor": patch
---

**The search dialog forgets the last search when you close it.** The query
lives in component state and the dialog stays mounted after closing, so the
next time a reader opened search it came up on the previous term and its
results — they had to clear the field before they could look for anything
else. Closing now resets it, and the shell's own `onOpenChange` still fires,
so nothing else about the dialog changes.
