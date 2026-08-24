---
"@panaversity/ksor": patch
---

New skill: **`make-summary`**. Ask your coding agent to summarise a document
and it writes `<doc>.summary.md` from the document, which the site renders as a
Summary tab beside the document's own words.

It is `make-slides`' discipline applied to prose: read the document whole,
write the summary, check every claim and every number back against it, and
report what it left out because the document did not support it.

With one rule of its own — **every `##` section must be represented**. A
summary that covers the opening and trails off is worse than none: a reader who
used it believes they have the whole document. It also declines to summarise a
document too short to compress, and says so, rather than writing a Summary tab
that restates the page.

Slides had a generator; summaries did not, which is why records tend to have
one summary and forty documents.
