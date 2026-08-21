---
"@panaversity/ksor": patch
---

Three defects found by auditing 0.0.10 against a live record

**A repeated `sslmode` was read the wrong end.** `pinnedTlsDsn` took the FIRST
value of a repeated parameter; `pg` takes the LAST. So on
`?sslmode=require&sslmode=disable` — whose effective mode is `disable` — the pin
saw a weak mode, collapsed the duplicates into one `verify-full`, turned TLS on,
and printed "TLS verified" at an operator whose DSN ended in `disable`. The
direction was safe; silently overruling an explicit opt-out and then misreporting
it was not. All three TLS functions now read the mode the driver will use.

The same sweep asserted the larger worry the pin creates — that re-serializing a
connection string could alter a credential. Seventeen DSNs with the passwords
people actually paste (raw `@`, spaces, `%`, `+`, brackets, non-ASCII,
percent-encoded separators) are now checked field by field against `pg`'s own
resolved view: everything the driver derives is byte-identical, and so is the
TLS decision.

**The outline's `position` disclosed documents an audience may not see.** It was
the rank in the whole record, so a public caller received 1, 3, 4 — a gap exactly
where an internal sibling sat, telling them something exists and roughly where.
The same row's `child_count` was already computed over visible children only, so
one response object disagreed with itself. `position` is now the rank among the
siblings the caller can see, computed as a window over the filtered set so it
stays correct across pages and at every depth, and both it and `depth` say what
they are in the tool schema.

**`ksor serve` now says when the record has no identity yet.** The MCP door
already refused to pass an unedited `instance.md` to agents as instructions —
it substitutes a plain statement that the scope is unstated — but the operator
starting the server was told nothing, so a record serving with no declared
identity looked exactly like one that had been described. It is a boot line now,
beside the abstention posture: both answer "how much should I trust this".
