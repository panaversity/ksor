# Agent evals

Evals measure the product claim directly: **can an agent answer correctly from
the governed corpus — with a citation — and does it abstain when the corpus is
silent?**

## Contract

Each eval is a directory:

```text
evals/<name>/
├── PROMPT.md   # the question, written the way a real user would ask it
└── EVAL.ts     # assertions on the agent's answer
```

Every eval runs in two variants:

- **baseline** — the agent gets the question with no ksor surface.
- **with-mcp** — the agent gets the question plus the ksor MCP surface over
  `workbench/example-corpus`.

An eval passes when the with-mcp variant answers with a citation to the
governing document, and fails usefully when baseline already passes (the
surface added nothing) or when with-mcp invents an answer the corpus does not
support.

**Every suite must include at least one out-of-corpus question whose only
passing answer is the abstention** — for the example corpus, the foreign
currency question that `knowledge/policies/purchase-approval.md` deliberately
leaves open.

## Status

The harness is not implemented yet; it lands with `ksor serve`
(see `research/base-environment.md` §6 and `docs/status.md`). Evals are
CI-only once live — they spend model tokens.
