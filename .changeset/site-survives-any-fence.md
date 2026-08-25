---
"@panaversity/ksor": patch
---

A code fence in a language the highlighter does not carry renders as plain
text instead of failing the build. A record is not a code project: an author
writing ` ```promql `, ` ```logql ` or ` ```gotemplate ` is describing their own
stack, and shiki throws on a language it has no grammar for — so one fence
anywhere in the record took the whole site down with a stack trace naming a
file in `node_modules`. Found on a real 187-document handbook where three such
languages appeared across some 3,000 fences.
