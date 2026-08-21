---
---

Test-only: no shipped behaviour changed, so this deliberately carries no version
bump. `audience-binding.integration.test.ts` asserted its guarantee by counting
`runRead(` against `audienceScope(ctx)` and comparing totals, which cannot tell
pairing from arithmetic — two bindings on one call and none on another satisfies
it exactly (verified: counts stay 6 === 6 while one serving read is unscoped).
Each call is now inspected inside its own window, bounded by the next call rather
than by a fixed span, and a failure names the line.
