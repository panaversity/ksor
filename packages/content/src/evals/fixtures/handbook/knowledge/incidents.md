---
type: Document
title: Security incidents
description: How to report a security incident and how severity is decided.
status: stable
order: 5
generated: { by: "ksor-fixture/1", at: 2026-08-20T09:00:00Z }
ksor:
  audience: [public]
  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }
---

# Security incidents

Report anything suspicious to the security channel immediately, because
reporting early and being wrong costs the company nothing while reporting late
is the expensive failure. The person who notices raises it, and the on-call
security engineer becomes incident lead from that moment.

## Severity

Severity one is customer data exposed or a production service unavailable to all
users, and it pages the duty director within fifteen minutes. Severity two is a
single customer affected or an internal system compromised. Severity three is
everything else, triaged the next working day.
