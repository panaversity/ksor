# Security policy

Knowledge Systems of Record can contain sensitive institutional information
and can influence AI agent behavior. Treat issues involving the following as
particularly important: unauthorized corpus access, provenance bypass,
malicious source ingestion, prompt injection through knowledge content,
privilege escalation, unsafe MCP exposure, build tampering, dependency
compromise, and anything that makes ungoverned knowledge appear authoritative.

## Reporting

Report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/panaversity/ksor/security/advisories/new).
Do not open public issues for security reports.

Please include: the affected version or commit, a reproduction, and the impact
as you understand it. You will get an acknowledgement within 72 hours.

## Scope notes

- `@panaversity/ksor` 0.x is pre-release; the placeholder CLI executes no
  corpus content. The attack surface grows with each implemented verb, and
  this policy applies to all of it.
- Supply-chain reports about this repository's dependencies are in scope —
  the repo enforces a 48-hour release quarantine (`minimumReleaseAge`) and a
  build-script allowlist in `pnpm-workspace.yaml`.
