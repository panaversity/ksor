/**
 * Snapshot tokens — search→read consistency (oracle SC/lib/snapshot.py).
 * A search response pins the generation it answered from; the caller's
 * follow-up reads the SAME corpus even across a mid-conversation flip.
 *
 * Deployment-bound twice: per-deployment signing keys AND the instance
 * digest in the payload — a valid token from one deployment is never
 * accepted by another serving the same nominal corpus. (ksor adaptation:
 * the digest is sha256 of instance.md itself — there is no bundle.)
 * Validation failures REFUSE WITH A REASON and the caller serves the
 * active generation saying so (`snapshot: "refreshed"`) — never an error,
 * never a silent switch. Tokens only ever mint for the generation a search
 * just answered from — nothing can mint for a building generation.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 30 minutes; GC grace is TTL + 10 min. */
export const TOKEN_TTL_S: number = 30 * 60;

export interface KeyRing {
  readonly keys: ReadonlyMap<string, Buffer>;
  /** Mint with the active key; keep validating old ids until their tokens age out (≤ TTL). */
  readonly active: string;
}

/**
 * `KSOR_SNAPSHOT_KEYS` = "kid=secret[,kid2=secret2]" — the secret is the
 * literal string's UTF-8 bytes, never hex-decoded (the oracle's gotcha,
 * carried as a comment so nobody "fixes" it). First kid is active. Unset:
 * an ephemeral per-process key — honest for a single replica, because
 * validation failure already fails soft to `snapshot: "refreshed"`.
 */
export function keyRingFromEnv(raw: string | undefined): KeyRing {
  if (raw === undefined || raw.trim() === "") {
    const kid = "ephemeral";
    return { keys: new Map([[kid, randomBytes(32)]]), active: kid };
  }
  const keys = new Map<string, Buffer>();
  let active: string | null = null;
  for (const part of raw.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0 || eq === part.length - 1) {
      throw new Error(
        `KSOR_SNAPSHOT_KEYS entry ${JSON.stringify(part)} is not kid=secret — ` +
          "a half-parsed key ring would mint tokens nothing can validate; " +
          "write comma-separated kid=secret pairs, first one active",
      );
    }
    const kid = part.slice(0, eq).trim();
    keys.set(kid, Buffer.from(part.slice(eq + 1), "utf8"));
    active = active ?? kid;
  }
  if (active === null) throw new Error("KSOR_SNAPSHOT_KEYS declared no keys");
  return { keys, active };
}

export interface SnapshotToken {
  readonly token: string;
  readonly expiresAt: string;
}

export interface TokenVerdict {
  readonly generation: number | null;
  readonly reason: null | "expired" | "foreign_deployment" | "unknown_key" | "invalid";
}

interface Payload {
  readonly corpus_id: string;
  readonly tenant_id: string;
  readonly generation: number;
  readonly instance_digest: string;
  readonly expires_at: string;
  readonly key_id: string;
}

/** Canonical JSON: sorted keys, no spaces — the byte layout the HMAC signs. */
function canonical(payload: Payload): string {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify(sorted);
}

const b64url = (data: Buffer | string): string => Buffer.from(data).toString("base64url");

function sign(key: Buffer, payload: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

/** isoformat(timespec="seconds") parity: no milliseconds. */
function isoSeconds(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface SnapshotScope {
  readonly corpusId: string;
  readonly tenantId: string;
  readonly instanceDigest: string;
}

export function mint(
  ring: KeyRing,
  scope: SnapshotScope,
  generation: number,
  nowMs: number = Date.now(),
): SnapshotToken {
  const key = ring.keys.get(ring.active);
  if (key === undefined) throw new Error(`snapshot key ring has no active key ${ring.active}`);
  const expiresAt = isoSeconds(nowMs + TOKEN_TTL_S * 1000);
  const payload: Payload = {
    corpus_id: scope.corpusId,
    tenant_id: scope.tenantId,
    generation,
    instance_digest: scope.instanceDigest,
    expires_at: expiresAt,
    key_id: ring.active,
  };
  const body = canonical(payload);
  return { token: `${b64url(body)}.${b64url(sign(key, body))}`, expiresAt };
}

export function validate(
  ring: KeyRing,
  token: string,
  scope: SnapshotScope,
  nowMs: number = Date.now(),
): TokenVerdict {
  const invalid: TokenVerdict = { generation: null, reason: "invalid" };
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return invalid;
  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0] ?? "", "base64url").toString("utf8")) as Payload;
  } catch {
    return invalid;
  }
  if (typeof payload !== "object" || payload === null) return invalid;
  const key = ring.keys.get(payload.key_id);
  if (key === undefined) return { generation: null, reason: "unknown_key" };
  const expected = sign(key, canonical(payload));
  const got = Buffer.from(parts[1] ?? "", "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return invalid;
  if (payload.corpus_id !== scope.corpusId || payload.tenant_id !== scope.tenantId) return invalid;
  if (payload.instance_digest !== scope.instanceDigest) {
    return { generation: null, reason: "foreign_deployment" };
  }
  const expires = Date.parse(payload.expires_at);
  if (Number.isNaN(expires)) return invalid;
  if (nowMs >= expires) return { generation: null, reason: "expired" };
  if (typeof payload.generation !== "number" || !Number.isInteger(payload.generation)) {
    return invalid;
  }
  return { generation: payload.generation, reason: null };
}
