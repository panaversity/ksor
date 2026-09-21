/**
 * The store: a careful editor of the `.env` this project already has.
 *
 * This is an INTEGRATION-tier suite because it touches the filesystem — that
 * is the tier rule here ("a file that reads the filesystem belongs in the
 * second one however small it is"), and it is also the honest tier: the
 * property under test is what survives a write to a real file, which a mocked
 * `writeFileSync` would not exercise at all.
 *
 * Every case points `ORCAROUTER_CREDENTIALS_FILE` at a scratch directory, so
 * none of them can reach a real `.env` — including the operator's.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ORCA_KEY_VAR,
  OrcaCredentialFileError,
  clearStoredKey,
  operatorCredential,
  operatorResolver,
  readStoredKey,
  storedSummary,
  writeStoredKey,
} from "./store.js";

const KEY_A = "sk-orca-aaaaaaaaaaaaaaaaaaaa";
const KEY_B = "sk-orca-bbbbbbbbbbbbbbbbbbbb";

let dir: string;
let file: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ksor-orca-store-"));
  file = path.join(dir, ".env");
  env = { ORCAROUTER_CREDENTIALS_FILE: file };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const raw = (): string => readFileSync(file, "utf8");

describe("writing and reading", () => {
  it("round-trips a key", () => {
    expect(readStoredKey(env)).toBeNull();
    writeStoredKey(KEY_A, env);
    expect(readStoredKey(env)).toBe(KEY_A);
  });

  it("replaces in place, without disturbing one other byte of the file", () => {
    const original = [
      "# my record's secrets",
      "KSOR_DB_URL=postgresql://user:pw@host:5432/db",
      "",
      "# a comment between entries",
      `${ORCA_KEY_VAR}=${KEY_A}`,
      "KSOR_AUTH=disabled-local",
      "",
    ].join("\n");
    writeFileSync(file, original);
    writeStoredKey(KEY_B, env);
    const after = raw();
    // The database DSN is the load-bearing assertion: a writer that
    // regenerated this file from parsed keys would delete it, and the user
    // would find out at `ksor serve` rather than here.
    expect(after).toContain("KSOR_DB_URL=postgresql://user:pw@host:5432/db");
    expect(after).toContain("# my record's secrets");
    expect(after).toContain("# a comment between entries");
    expect(after).toContain("KSOR_AUTH=disabled-local");
    expect(after).toContain(`${ORCA_KEY_VAR}=${KEY_B}`);
    expect(after).not.toContain(KEY_A);
    expect(after.split("\n").length).toBe(original.split("\n").length);
  });

  it("appends when the variable is not there yet", () => {
    writeFileSync(file, "KSOR_DB_URL=postgresql://x\n");
    writeStoredKey(KEY_A, env);
    expect(raw()).toBe(`KSOR_DB_URL=postgresql://x\n${ORCA_KEY_VAR}=${KEY_A}\n`);
  });

  it("creates the file, and only the file — no stray temp left behind", () => {
    writeStoredKey(KEY_A, env);
    expect(readStoredKey(env)).toBe(KEY_A);
    expect(existsSync(file)).toBe(true);
    // The temp file the write goes through is RENAMED, never left behind.
    expect(readdirSync(dir).sort()).toEqual([".env"]);
  });

  it("reads through `export `, spaces and quotes, which hand-edited files carry", () => {
    for (const line of [
      `export ${ORCA_KEY_VAR}=${KEY_A}`,
      `${ORCA_KEY_VAR} = ${KEY_A}`,
      `${ORCA_KEY_VAR}="${KEY_A}"`,
      `${ORCA_KEY_VAR}='${KEY_A}'`,
    ]) {
      writeFileSync(file, `${line}\n`);
      expect(readStoredKey(env), line).toBe(KEY_A);
    }
  });

  it("refuses a value that is not an OrcaRouter key, and writes nothing", () => {
    writeFileSync(file, "KSOR_DB_URL=keep-me\n");
    expect(() => writeStoredKey("sk-proj-oops", env)).toThrow(OrcaCredentialFileError);
    expect(raw()).toBe("KSOR_DB_URL=keep-me\n");
  });

  it("refuses — and does not echo — a value that is a wrong key of the right shape", () => {
    // The refusal message may name the shape; it may not carry the value.
    try {
      writeStoredKey("not-a-key-at-all-but-long-enough-to-redact", env);
      expect.unreachable("should have refused");
    } catch (exc) {
      expect(exc).toBeInstanceOf(OrcaCredentialFileError);
      expect(String((exc as Error).message)).not.toContain("long-enough-to-redact");
    }
  });

  it("an empty assignment reads as no key, not as an empty key", () => {
    writeFileSync(file, `${ORCA_KEY_VAR}=\n`);
    expect(readStoredKey(env)).toBeNull();
  });
});

describe("clearing", () => {
  it("removes the line and reports that it did", () => {
    writeFileSync(file, `KSOR_DB_URL=keep\n${ORCA_KEY_VAR}=${KEY_A}\n`);
    expect(clearStoredKey(env)).toBe(true);
    expect(readStoredKey(env)).toBeNull();
    expect(raw()).toBe("KSOR_DB_URL=keep\n");
  });

  it("reports that there was nothing to remove, rather than claiming success", () => {
    expect(clearStoredKey(env)).toBe(false);
  });

  it("does not leave an empty assignment — unset and empty read differently", () => {
    writeFileSync(file, `${ORCA_KEY_VAR}=${KEY_A}\n`);
    clearStoredKey(env);
    expect(raw()).not.toContain(ORCA_KEY_VAR);
  });
});

describe("what a caller may see", () => {
  it("the summary never contains the key", () => {
    writeStoredKey(KEY_A, env);
    const summary = storedSummary(env);
    expect(JSON.stringify(summary)).not.toContain(KEY_A);
    expect(summary?.masked).toContain("sk-orca-");
    expect(summary?.source).toBe("api_key");
  });

  it("reports no credential as null, not as a placeholder", () => {
    expect(storedSummary(env)).toBeNull();
  });
});

describe("the environment wins over the file, as it does everywhere in ksor", () => {
  it("an exported variable is used instead of the stored one", async () => {
    writeStoredKey(KEY_A, env);
    const credential = await operatorCredential({ ...env, [ORCA_KEY_VAR]: KEY_B });
    expect(credential?.apiKey).toBe(KEY_B);
  });

  it("falls back to the file when the variable is unset or blank", async () => {
    writeStoredKey(KEY_A, env);
    expect((await operatorCredential({ ...env, [ORCA_KEY_VAR]: "   " }))?.apiKey).toBe(KEY_A);
    expect((await operatorCredential(env))?.apiKey).toBe(KEY_A);
  });

  it("is null when neither holds a key — the caller writes the sentence", async () => {
    expect(await operatorCredential(env)).toBeNull();
  });
});

describe("the resolver a transport holds", () => {
  it("throws a named refusal naming BOTH remedies when there is no credential", async () => {
    const resolve = operatorResolver(env);
    await expect(resolve()).rejects.toThrow(/ksor connect orcarouter/);
    await expect(resolve()).rejects.toThrow(/--key/);
  });

  it("resolves the stored credential when there is one", async () => {
    writeStoredKey(KEY_A, env);
    const credential = await operatorResolver(env)();
    expect(credential.apiKey).toBe(KEY_A);
    expect(credential.source).toBe("api_key");
  });

  it("never puts the key in the refusal it throws", async () => {
    writeStoredKey(KEY_A, env);
    // Corrupt the file into something unreadable as a key, then confirm the
    // failure path still does not echo the value it read.
    writeFileSync(file, `${ORCA_KEY_VAR}="\n`);
    try {
      await operatorResolver(env)();
      expect.unreachable("should have refused");
    } catch (exc) {
      expect(String((exc as Error).message)).not.toContain(KEY_A);
    }
  });
});
