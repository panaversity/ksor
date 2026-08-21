---
"@panaversity/ksor": patch
---

Internal: the env-contract drift test scans only the checkout's source

No adopter-visible behaviour changes. The test that guarantees every
adopter-settable environment variable is named in the scaffold's `env.example`
walked `packages/` with a `statSync` per entry, and descended into the fake npm
install another suite roots inside `packages/ksor`. That cost two ways: the
copied template sources were scanned twice, and an entry deleted between the
`readdir` and the `statSync` crashed the whole run — which is what took CI red
on run 32526491721, on an `llms.txt` being cleaned up concurrently.

The walk now takes each entry's type from the readdir snapshot itself, so a
vanishing entry cannot crash it, and it skips transient install trees, so its
input no longer depends on whether another suite is mid-run. The `REPO_ONLY`
exemption list was deleted as dead: it named seven variables that no scanned
file can contain, because the walk excludes test files in the first place. The
honesty check that is supposed to catch stale exemptions now covers every
exemption list, which is what its name always claimed.
