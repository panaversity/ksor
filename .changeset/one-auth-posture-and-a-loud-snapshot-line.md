---
"@panaversity/ksor": patch
---

**Breaking:** `KSOR_AUTH_DISABLED` and `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED` are
replaced by one variable, `KSOR_AUTH`, whose value is the decision:

```sh
KSOR_AUTH=disabled-local    # no auth, loopback only — a public bind REFUSES
KSOR_AUTH=disabled-public   # no auth, served to anyone who can reach the port
```

Two booleans that had to agree to express one decision produced a state neither
name could tell you, and a fourth combination that meant nothing. `AUTH_DISABLED`
sounds like it already means "auth is off", so being told you also need
`ALLOW_PUBLIC_UNAUTHENTICATED` read as the tool asking you to say the same thing
twice. The guarantee is unchanged and unweakened — a copied `.env` carrying
`disabled-local` still refuses on a container, which is the leak that pair
existed to catch. Setting either retired variable now refuses at boot and names
its replacement.

**The boot report no longer stays silent about ephemeral snapshot keys.** Unset
`KSOR_SNAPSHOT_KEYS` mints a per-process signing key — honest for one process,
and wrong for the container hosts we ship a Dockerfile for. A generation pin
issued by one instance is then unverifiable by the next, so `read` silently drops
to the active generation and reports `refreshed (invalid)`. It fails soft, so
nothing errors and nothing logs; the only symptom is an agent reading a
generation it did not search. Found on a real deployment by noticing one read in
three come back unpinned. On a public bind the door now says so:

```
snapshot EPHEMERAL key — generation pins will NOT survive a restart or a
         second instance; set KSOR_SNAPSHOT_KEYS to a value shared by every replica
```

Not a refusal — a loopback dev run and a genuine single-instance deployment are
both legitimate — but no longer silent where the assumption stops holding.

`docs/deploying.md` splits its configuration table into three tiers: required to
boot, set on any container host, and set once auth is on. Listing six variables
as one table read as "set all of these or you are doing it wrong", and only the
first tier was ever true.
