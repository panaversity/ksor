---
"@panaversity/ksor": patch
---

`ksor serve` reports its own posture instead of forwarding other people's warnings

Booting printed four alarming paragraphs at an operator who had done nothing
wrong: the driver's multi-line `SECURITY WARNING` about `sslmode` aliases, ksor's
own three-line restatement of the same thing, and the MCP SDK's note about a
`responseMode` ksor chose deliberately.

The driver's warning is correct and its remedy is one word, so ksor now applies
it: a remote `sslmode=require|prefer|verify-ca` is rewritten to `verify-full`
before the connection is made. The connection is unchanged today — pg 8 was
already resolving all three to full verification, which is the entire content of
its warning — and it can no longer be silently downgraded by a driver upgrade.
The SDK's note describes a recorded decision, not a defect, and is suppressed by
exact message so that anything else it says still reaches the operator.

What is left is the record's posture, aligned and in ksor's own voice, with the
two lines that decide whether to trust what happens next saying what they mean:
auth `DISABLED` now names the bind it is survivable on, and an absent abstention
floor says out-of-corpus questions will be answered rather than refused.
