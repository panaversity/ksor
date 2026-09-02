---
"@panaversity/ksor": patch
---

The agent tier authenticates through `claude`'s own login, never an API key.

Where the repository needs model inference — today, the skill evals — it uses
`claude -p`: a developer's logged-in CLI locally, and in CI a long-lived token
from `claude setup-token` in `CLAUDE_CODE_OAUTH_TOKEN`. The tier no longer reads
`ANTHROPIC_API_KEY` and no longer passes `--bare`, because bare mode does not
read the OAuth token (per the official headless docs) and would have quietly
fallen back to needing the key it is not supposed to have. A guard holds both.

The pending owner action changes with it: a `CLAUDE_CODE_OAUTH_TOKEN` repository
secret, not an API key. Test infrastructure only; nothing an adopter installs
behaves differently.
