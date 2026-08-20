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

- `@panaversity/ksor` 0.x is pre-release, but it is NOT inert: since 0.0.7 the
  CLI ingests corpus content, sends it to an embedding provider, writes it to
  Postgres, and serves it over a network-facing MCP door. In scope accordingly:
  the MCP surface and its auth postures, the ingest write plane and its
  row-level-security roles, the audience/takedown filters that decide what a
  caller may be served, snapshot-token handling, and egress to the configured
  embedding provider. The attack surface grows with each implemented verb, and
  this policy applies to all of it.
- Supply-chain reports about this repository's dependencies are in scope —
  the repo enforces a 48-hour release quarantine (`minimumReleaseAge`) and a
  build-script allowlist in `pnpm-workspace.yaml`.
