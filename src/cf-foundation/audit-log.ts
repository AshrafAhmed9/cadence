import type { Actor } from "./actor.js";

export interface AuditRecord {
  seq: number;
  actor: Actor;
  action: string;
  entityId: string;
  before: unknown;
  after: unknown;
  timestamp: number;
  /** SHA-256 of (prevHash + this record's canonical content), hex-encoded. */
  hash: string;
  prevHash: string;
}

const GENESIS_HASH = "0".repeat(64);

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fixed key order so `appendAuditRecord` and `verifyAuditChain` hash
 * exactly the same bytes for the same logical record. Do not replace this
 * with `JSON.stringify(record)` — object key order isn't part of the
 * `AuditRecord` type's contract and must not be allowed to drift between
 * the two call sites.
 */
function canonicalize(record: Omit<AuditRecord, "hash">): string {
  const { seq, prevHash, timestamp, actor, action, entityId, before, after } = record;
  return JSON.stringify({ seq, prevHash, timestamp, actor, action, entityId, before, after });
}

/**
 * A hash-chained, append-only audit log: each record's hash covers the
 * previous record's hash plus its own content, so any edit or deletion of
 * history is detectable by recomputing the chain. Used wherever a
 * submission needs to be provably tamper-evident (Consequence's provenance
 * bundle) and, more generally, as the backing store for every app's
 * "who did what, when" activity feed.
 *
 * Storage-agnostic: `append` takes the previous record so callers control
 * persistence (Durable Object storage, D1, etc).
 */
export async function appendAuditRecord(
  prev: AuditRecord | undefined,
  entry: Omit<AuditRecord, "seq" | "hash" | "prevHash" | "timestamp">,
): Promise<AuditRecord> {
  const seq = (prev?.seq ?? -1) + 1;
  const prevHash = prev?.hash ?? GENESIS_HASH;
  const timestamp = Date.now();
  const withoutHash = { ...entry, seq, prevHash, timestamp };
  const hash = await sha256Hex(canonicalize(withoutHash));
  return { ...withoutHash, hash };
}

export async function verifyAuditChain(records: AuditRecord[]): Promise<{ valid: boolean; brokenAt?: number }> {
  let prevHash = GENESIS_HASH;
  for (const record of records) {
    const { hash, ...rest } = record;
    const recomputed = await sha256Hex(canonicalize(rest));
    if (recomputed !== hash || rest.prevHash !== prevHash) {
      return { valid: false, brokenAt: record.seq };
    }
    prevHash = hash;
  }
  return { valid: true };
}
