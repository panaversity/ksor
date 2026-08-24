---
"@panaversity/ksor": patch
---

Trim the shell-retirement revision in AGENTS.md from 222 words to 129, keeping
what an agent must act on and moving the reasoning to the commit that carried
it.

Working rule 6 requires a reversed decision to keep its entry and gain a
revision note, so removing it is not available — and it is not irrelevant
either: without it an agent looks for a deleted directory with no explanation,
or restores two-shell assertions thinking they were lost by accident, or reads
decision 9, sees no obstacle, and treats dropping `output: "export"` as
unblocked. That last one is the reason it stays.

But coding principle 1 applies to this file too — context is liability, and
AGENTS.md loads every session. The narrative half was 90 words explaining why
the proof had been valuable, which the commit already records.

Also documents the thing that was missing entirely: **how to keep people out of
the site.** The door's auth had four recipes; the site had nothing, and the
most common requirement — "everyone signs in before reading anything" — is also
the easiest, needs no ksor change, and was written down nowhere.

Three shapes, separated because they had been muddled: a host-level gate in
front of the origin (protects every byte, holds against `curl`, and makes a
site sign-in button redundant rather than complementary); per-audience builds
for a restricted subset (enforcement by absence, already built); and the
per-request case, which a static export cannot express and which issue #130
records rather than implements. Plus what does not work — hiding rendered
content behind a browser check, which presents rather than protects.

The per-request case gets three answers rather than a deferral: **read through
the door** (already applies audience scope per request and logs an actor per
read — per-person governance with an audit trail a static site cannot have),
**split the record** (content needing per-person confidentiality inside one tier
usually belongs in its own record), or **fork the site**, which an adopter owns
outright under decision 4.

The fork is offered with what it costs stated: ksor's guarantee is enforcement
by ABSENCE, asserted against a positive control; a request-time filter is a
different guarantee and becomes the adopter's to test. A filter that is bypassed
serves the document; an absent file cannot be.
