---
"@panaversity/ksor": patch
---

`ksor migrate --write-site` no longer deletes dependencies the adopter added to
their site.

Every file under `system/site` is offered as a whole-file replacement, which is
right for the copied rule modules and wrong for `system/site/package.json` — a
register ksor and the adopter both write in. Copying it whole removed anything
they had added, inside the same hunk that carried a pin bump, so a project could
stop building on the release meant to fix it. It is now merged per section: the
entries ksor ships move to this release's versions, the adopter's own survive,
and an entry ksor no longer ships is left alone rather than deleted (the tool
cannot tell one it retired from one they added).

Adds `docs/upgrading.md`, which ships in the tarball: the four-step path, the
table of what migrate carries, the list of files it does not — so an adopter
knows what to diff by hand — and the refusals to expect.
