---
"@panaversity/ksor": patch
---

Keep sign-in callbacks working when development mode repeats an effect. Report token-exchange and browser-storage failures instead of leaving the callback loading, and preserve non-ASCII names from identity tokens. Existing projects can update their site with `ksor migrate --write --write-site`.
