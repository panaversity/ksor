/**
 * Where the OrcaRouter key is kept — the project's OWN secret file, not a new
 * store.
 *
 * `ksor` already has exactly one place a provider secret lives: a `.env` beside
 * the record, which `.gitignore` excludes (`.env*`, with `!.env.example`
 * negated) and which `loadDotEnv()` reads on every run. Inventing a second
 * credential store for OrcaRouter would mean a user has two files to protect
 * and two files to lose, and the integration spec is explicit that the key
 * goes "wherever your project already keeps secrets". So this module is a
 * careful editor of that one file, not a store of its own.
 *
 * Three properties the editor holds:
 *
 * 1. **Nothing else in the file moves.** A `.env` is hand-written and full of
 *    the operator's own values and comments; a writer that regenerates it from
 *    parsed keys deletes all of that. Only the `ORCAROUTER_API_KEY` line is
 *    touched, in place, and every other byte survives.
 * 2. **The key is never printed.** `read` returns the credential; `status`
 *    returns a MASKED summary. Nothing in this module writes a key to stdout,
 *    to stderr, or into an error message — including the errors.
 * 3. **Clearing is symmetric.** `clear` removes the line. It never writes an
 *    empty value, because `FOO=` and "unset" read the same to a human and
 *    differently to the code that decides whether to prompt.
 *
 * Note what is NOT here: no encryption, no keychain, no obfuscation. A `.env`
 * is a plaintext file the user already trusts with their database DSN. Adding
 * a second, weaker cipher on top of it would be security theatre; the honest
 * boundary is file permissions and `.gitignore`, which the scaffold already
 * sets.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ApiKeyCredentialSource,
  looksLikeOrcaKey,
  type CredentialSummary,
  type OrcaCredential,
} from "./credential.js";
import { redact } from "./pkce.js";

/** The variable name, in the shape this repo's other provider keys use. */
export const ORCA_KEY_VAR = "ORCAROUTER_API_KEY";

/**
 * Overridable so a test never touches a real `.env`, and so a deployment can
 * name a file outside the working directory. The DEFAULT is the file
 * `loadDotEnv()` already reads, which is the whole point.
 */
export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ORCAROUTER_CREDENTIALS_FILE;
  if (explicit !== undefined && explicit !== "") return path.resolve(explicit);
  return path.resolve(process.cwd(), ".env");
}

export class OrcaCredentialFileError extends Error {
  readonly slug = "ksor-orcarouter-credentials";
  constructor(message: string) {
    super(message);
    this.name = "OrcaCredentialFileError";
  }
}

/** `KEY=value` for the variable, or null. Tolerates `export `, spaces and quotes. */
function findLine(lines: readonly string[]): { index: number; value: string } | null {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${ORCA_KEY_VAR}\\s*=(.*)$`);
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index] ?? "");
    if (match === null) continue;
    let raw = (match[1] ?? "").trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
      (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
    ) {
      raw = raw.slice(1, -1);
    }
    return { index, value: raw };
  }
  return null;
}

/** The stored key, or null when there is none. Never logged by any caller. */
export function readStoredKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = credentialsPath(env);
  if (!existsSync(file)) return null;
  const found = findLine(readFileSync(file, "utf8").split("\n"));
  return found === null || found.value === "" ? null : found.value;
}

/**
 * A credential for the stored key, ready for the seam — or null when nothing
 * is stored. This is the door the transport and the catalog use; they never
 * touch the file.
 */
export async function storedCredential(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OrcaCredential | null> {
  const key = readStoredKey(env);
  if (key === null) return null;
  return await new ApiKeyCredentialSource(key).acquire();
}

/**
 * The credential an OPERATOR's process should use, in the order the rest of
 * this repo reads secrets: a real environment variable first (so CI and a
 * deployment override the file, exactly as `loadDotEnv()`'s contract says),
 * then the `.env` beside the record.
 *
 * Returns null when neither holds a key — the caller decides what to say,
 * because "you have not connected yet" and "your key was rejected" are
 * different sentences with different remedies.
 */
export async function operatorCredential(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OrcaCredential | null> {
  const fromEnv = env[ORCA_KEY_VAR];
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return await new ApiKeyCredentialSource(fromEnv.trim()).acquire();
  }
  return await storedCredential(env);
}

/**
 * The same thing as a resolver, for the transport and the catalog — which take
 * a function so they never hold a key across calls.
 */
export function operatorResolver(
  env: NodeJS.ProcessEnv = process.env,
): () => Promise<OrcaCredential> {
  return async (): Promise<OrcaCredential> => {
    const credential = await operatorCredential(env);
    if (credential === null) {
      throw new OrcaCredentialFileError(
        `no OrcaRouter credential: ${ORCA_KEY_VAR} is unset and ${credentialsPath(env)} holds no key\n` +
          "  fix: run `ksor connect orcarouter` (browser authorization), or " +
          "`ksor connect orcarouter --key` to paste one",
      );
    }
    return credential;
  };
}

/** What a status line may print. Never the key. Reads the FILE only. */
export function storedSummary(env: NodeJS.ProcessEnv = process.env): CredentialSummary | null {
  const key = readStoredKey(env);
  if (key === null) return null;
  return {
    source: "api_key",
    userId: null,
    scope: "unknown",
    generation: 0,
    masked: redact(key),
  };
}

/**
 * The summary of the credential that is ACTUALLY IN USE, in the same order
 * `operatorCredential` resolves it: a real environment variable first, then the
 * file.
 *
 * A status card that read only the file would report "not set" to an operator
 * who exported the variable — the single most confusing thing a status card can
 * do, and a bug this repo has already paid for once (a key read from the env in
 * one place and from a file in another). One precedence, one function.
 */
export function currentSummary(env: NodeJS.ProcessEnv = process.env): CredentialSummary | null {
  const fromEnv = env[ORCA_KEY_VAR];
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return {
      source: "api_key",
      userId: null,
      scope: "unknown",
      generation: 0,
      masked: redact(fromEnv.trim()),
    };
  }
  return storedSummary(env);
}

/**
 * Write the key, replacing any existing line in place. Creates the file when
 * it does not exist. Returns the path written.
 *
 * A rewrite is done through a sibling temp file and `renameSync` so an
 * interrupted write cannot leave a half-written `.env` — the file holds the
 * user's database DSN, and truncating it to save a provider key would be a
 * catastrophic trade.
 */
export function writeStoredKey(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = key.trim();
  if (!looksLikeOrcaKey(trimmed)) {
    // Format only — see credential.ts. This catches a paste of the wrong
    // string; it does not and cannot claim the key works.
    throw new OrcaCredentialFileError(
      `that does not look like an OrcaRouter key (expected an sk-orca-… value, got ${redact(trimmed)})`,
    );
  }
  const file = credentialsPath(env);
  mkdirSync(path.dirname(file), { recursive: true });
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const hadTrailingNewline = existing === "" || existing.endsWith("\n");
  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  const found = findLine(lines);
  if (found === null) {
    lines.push(`${ORCA_KEY_VAR}=${trimmed}`);
  } else {
    lines[found.index] = `${ORCA_KEY_VAR}=${trimmed}`;
  }
  const body = lines.join("\n") + (hadTrailingNewline || existing === "" ? "\n" : "");
  const temp = `${file}.ksor-tmp`;
  writeFileSync(temp, body, { mode: 0o600 });
  renameSync(temp, file);
  return file;
}

/**
 * Remove the line. Returns true when something was removed.
 *
 * Deliberately NOT called on a failed reauthentication: a transient or
 * misclassified failure that deletes the stored secret turns a recoverable
 * state into an account the user has to set up again. The caller marks the
 * account `needsReauth` and leaves the bytes alone until a new login succeeds.
 */
export function clearStoredKey(env: NodeJS.ProcessEnv = process.env): boolean {
  const file = credentialsPath(env);
  if (!existsSync(file)) return false;
  const existing = readFileSync(file, "utf8");
  const lines = existing.replace(/\n$/, "").split("\n");
  const found = findLine(lines);
  if (found === null) return false;
  lines.splice(found.index, 1);
  const body = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  const temp = `${file}.ksor-tmp`;
  writeFileSync(temp, body, { mode: 0o600 });
  renameSync(temp, file);
  return true;
}
