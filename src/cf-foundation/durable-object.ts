import type { AuditRecord } from "./audit-log.js";
import { appendAuditRecord } from "./audit-log.js";
import type { Actor } from "./actor.js";

export interface Patch {
  type: string;
  payload: unknown;
  actor: Actor;
  timestamp: number;
}

/**
 * Base class for the "one Durable Object per board / per application"
 * pattern used by Cadence and Consequence: a single object serializes all
 * mutations, appends them to a hash-chained audit log, and fans updates
 * out to every connected client over the WebSocket Hibernation API (so
 * idle connections don't hold the object in memory between messages).
 *
 * Subclasses implement `applyPatch` with their own entity model; this
 * class only owns connection lifecycle, broadcast, and the audit trail.
 */
export abstract class SyncedDurableObject implements DurableObject {
  protected state: DurableObjectState;
  protected env: unknown;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
    this.env = env;
  }

  /** Apply a mutation to subclass-owned state. Return the entity id and before/after snapshot for the audit log. */
  protected abstract applyPatch(patch: Patch): Promise<{ entityId: string; before: unknown; after: unknown }>;

  /** Serialize current state for a newly connected client (sent once, on connect). */
  protected abstract snapshot(): Promise<unknown>;

  /**
   * Wipe stored state and the audit log back to the seed. The seed only
   * ever loads once, on an object's first request — after that, every demo
   * or judging session permanently mutates the same live object. Without
   * this, a board that's already been triaged/deduped by earlier testing
   * stays that way for whoever opens the URL next.
   */
  protected abstract resetState(): Promise<void>;

  // Below this much idle time, a client-triggered "reset if idle" request
  // is refused rather than applied — so a new tab opening while someone
  // else is actively using the board can't wipe their in-progress work,
  // and the endpoint can't be used to grief other viewers by spamming it.
  private static readonly IDLE_RESET_THRESHOLD_MS = 2 * 60 * 1000;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      const expected = (this.env as { RESET_KEY?: string } | undefined)?.RESET_KEY;
      if (!expected || request.headers.get("x-reset-key") !== expected) {
        return new Response("Not found", { status: 404 });
      }
      await this.performReset();
      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname.endsWith("/reset-if-idle")) {
      const lastActivity = (await this.state.storage.get<number>("lastActivityAt")) ?? 0;
      const idleFor = Date.now() - lastActivity;
      if (idleFor < SyncedDurableObject.IDLE_RESET_THRESHOLD_MS) {
        return Response.json({ reset: false, reason: "active within the last 2 minutes" });
      }
      await this.performReset();
      return Response.json({ reset: true });
    }

    const upgrade = request.headers.get("Upgrade");
    if (upgrade === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }
    return new Response("Expected WebSocket upgrade", { status: 400 });
  }

  private async performReset(): Promise<void> {
    await this.resetState();
    const entries = await this.state.storage.list({ prefix: "audit:" });
    await this.state.storage.delete(Array.from(entries.keys()));
    // A fresh reset counts as activity, not idleness — otherwise a burst of
    // tabs opening seconds apart would each trigger their own reset.
    await this.state.storage.put("lastActivityAt", Date.now());
  }

  private async handleWebSocketUpgrade(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation API: the runtime can evict this DO from memory between
    // messages and wake it back up on the next one, without dropping the
    // socket — essential for a Durable Object that many idle boards sit on.
    this.state.acceptWebSocket(server);
    const snapshot = await this.snapshot();
    server.send(JSON.stringify({ type: "snapshot", payload: snapshot }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let patch: Patch;
    try {
      patch = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: "error", payload: "invalid message" }));
      return;
    }

    const { entityId, before, after } = await this.applyPatch(patch);
    await this.appendAudit(patch, entityId, before, after);
    await this.state.storage.put("lastActivityAt", Date.now());
    this.broadcast(patch, ws);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    ws.close();
  }

  private broadcast(patch: Patch, sender: WebSocket): void {
    const message = JSON.stringify({ type: "patch", payload: patch });
    for (const ws of this.state.getWebSockets()) {
      if (ws !== sender) ws.send(message);
    }
  }

  private async appendAudit(patch: Patch, entityId: string, before: unknown, after: unknown): Promise<AuditRecord> {
    const prev = await this.state.storage.get<AuditRecord>("audit:latest");
    const record = await appendAuditRecord(prev, {
      actor: patch.actor,
      action: patch.type,
      entityId,
      before,
      after,
    });
    await this.state.storage.put(`audit:${record.seq}`, record);
    await this.state.storage.put("audit:latest", record);
    return record;
  }

  protected async getAuditTrail(): Promise<AuditRecord[]> {
    // "audit:latest" duplicates the newest "audit:<seq>" entry under a
    // fixed key (for O(1) prevHash lookups on append) — exclude it here or
    // the newest record would appear twice.
    const entries = await this.state.storage.list<AuditRecord>({ prefix: "audit:" });
    entries.delete("audit:latest");
    return Array.from(entries.values()).sort((a, b) => a.seq - b.seq);
  }
}
