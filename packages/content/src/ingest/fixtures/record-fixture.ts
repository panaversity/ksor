/**
 * Test support: write a profile-shaped record (record spec §1–§5) to disk the
 * way `ksor init` + `ksor build` would leave it — instance, policy, ledger,
 * concepts, generated indexes and a `build.lock.json` whose document hashes
 * match the tree — so an ingest test can start from a record that passes the
 * checker and break exactly one thing. Not a test file: it touches the
 * filesystem, and every tier that needs it imports it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ContentInstance } from "../../instance.js";
import { checkRecord } from "../../record/check.js";
import { loadRecord } from "../../record/load.js";
import { conceptHashes } from "../lock-gate.js";

export const APPROVER = "human:cfo";
export const TAKEDOWN_ACTOR = "human:ciso";
export const GENERATED_AT = "2026-08-20T09:00:00Z";
export const APPROVED_AT = "2026-08-21T09:00:00Z";

export function policyText(
  audiences: readonly string[] = [],
  takedownActors: readonly string[] = [TAKEDOWN_ACTOR],
): string {
  const registry =
    audiences.length === 0
      ? ""
      : `audiences:\n${audiences.map((a) => `  ${a}:\n    description: ${a} readers\n`).join("")}`;
  return (
    `version: "0.1"\n${registry}approval_authorities:\n  - actors: [${APPROVER}]\n` +
    `takedown_authorities:\n  actors: [${takedownActors.join(", ")}]\n`
  );
}

export function instanceText(name: string, title: string = name, database: boolean = true): string {
  return (
    `---\nformat: 2\nname: ${name}\ntitle: ${title}\ndescription: The ${title} record.\n` +
    (database ? "database:\n  dsn_env: KSOR_DB_URL\n" : "") +
    "embedding:\n  provider: fake\n---\n\nAnswer only from the record.\n"
  );
}

export interface DocSpec {
  readonly title: string;
  readonly description?: string;
  readonly status?: "draft" | "stable" | "deprecated";
  readonly audience?: readonly string[];
  readonly order?: number;
  /** Extra frontmatter lines, verbatim (top level). */
  readonly extra?: string;
  /** Extra lines under `ksor:`, verbatim, two-space indented. */
  readonly ksor?: string;
  readonly body: string;
}

/** A concept in the profile's shape: stable, approved, public unless said otherwise. */
export function profileDoc(spec: DocSpec): string {
  const status = spec.status ?? "stable";
  const audience = spec.audience ?? ["public"];
  const lines = [
    "---",
    "type: Document",
    `title: ${JSON.stringify(spec.title)}`,
    `description: ${JSON.stringify(spec.description ?? `${spec.title}, in one sentence.`)}`,
    `status: ${status}`,
    ...(spec.order === undefined ? [] : [`order: ${spec.order}`]),
    `generated: { by: "fixture/1", at: ${GENERATED_AT} }`,
    ...(spec.extra === undefined ? [] : [spec.extra.replace(/\n$/, "")]),
    "ksor:",
    `  audience: [${audience.join(", ")}]`,
    ...(status === "stable" ? [`  approval: { by: "${APPROVER}", at: ${APPROVED_AT} }`] : []),
    ...(spec.ksor === undefined ? [] : [spec.ksor.replace(/\n$/, "")]),
    "---",
    "",
    spec.body.replace(/\n$/, ""),
    "",
  ];
  return lines.join("\n");
}

export interface RecordSpec {
  readonly name: string;
  readonly title?: string;
  /** Bundle-relative path (`policies/x.md`) → text. */
  readonly docs: Readonly<Record<string, string>>;
  readonly audiences?: readonly string[];
  readonly policy?: string;
  readonly ledger?: string | null;
  readonly instance?: string;
  readonly database?: boolean;
}

/** Write the record and its lock; returns the root. */
export function writeRecord(root: string, spec: RecordSpec): string {
  mkdirSync(join(root, ".ksor"), { recursive: true });
  writeFileSync(
    join(root, "instance.md"),
    spec.instance ?? instanceText(spec.name, spec.title ?? spec.name, spec.database ?? true),
  );
  writeFileSync(
    join(root, ".ksor", "governance.yaml"),
    spec.policy ?? policyText(spec.audiences ?? []),
  );
  if (spec.ledger !== undefined && spec.ledger !== null) {
    writeFileSync(join(root, ".ksor", "takedowns.yaml"), spec.ledger);
  }
  for (const [rel, text] of Object.entries(spec.docs)) {
    const abs = join(root, "knowledge", rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  writeIndexesAndLock(root);
  return root;
}

/** Regenerate every index and the lock from the tree as it is now (what `ksor build` will do). */
export function writeIndexesAndLock(root: string, buildId: string = "sha256:fixture"): void {
  const record = loadRecord(root);
  const check = checkRecord(record, { mode: "build" });
  for (const [path, text] of check.indexes) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  writeLock(root, buildId);
}

export function writeLock(root: string, buildId: string = "sha256:fixture"): void {
  const record = loadRecord(root);
  const documents = [...conceptHashes(record)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, sha256]) => ({ path, sha256 }));
  const lock = {
    format: 1,
    build_id: buildId,
    as_of: "2026-08-25T12:00:00Z",
    documents,
  };
  writeFileSync(join(root, "build.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
}

/** The kernel's view of a fixture record, for callers that never parse instance.md. */
export function instanceOf(
  tenantId: string,
  corpusId: string,
  overrides: Partial<ContentInstance> = {},
): ContentInstance {
  return {
    name: corpusId,
    corpusId,
    tenantId,
    title: corpusId,
    description: `The ${corpusId} record.`,
    toolchain: null,
    dsnEnv: "KSOR_DB_URL",
    abstain: { vectorFloor: null, keywordFloor: null },
    textSearchConfig: "english",
    maximumResponseCharacters: 120_000,
    instructions: "",
    embeddingProvider: "fake",
    embeddingModel: "fake-embed-001",
    embeddingDim: 1536,
    ...overrides,
  };
}
