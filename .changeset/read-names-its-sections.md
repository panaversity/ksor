---
"@panaversity/ksor": patch
---

`read` names every section it will accept, not just the top-level ones

`read` resolves a `heading` three ways: a full heading path, any prefix of one,
and a section's last segment when that segment is unique in the document. The
error for a section it could not find listed only the TOP-LEVEL segments — a
strict subset of its own vocabulary — so it reported real, reachable sections as
absent. Found live: a nested section was refused by name and served on the next
call under the same name.

The error now lists the full heading paths (the form that always resolves and
never collides), states the unique-last-segment shorthand rather than doubling
the list to enumerate it, and counts the tail past twenty instead of printing an
unbounded list. The `heading` input and the `sections` output now describe the
same vocabulary in the tool schema, where an agent reads it before making the
call rather than after failing one.
