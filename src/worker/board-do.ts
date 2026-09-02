import { SyncedDurableObject, type Actor, type Patch } from "../cf-foundation/index.js";
import { reduce, type ActionType } from "../shared/reducer.js";
import type { BoardState } from "../shared/types.js";
import { seedBoard } from "../../seed/issues.js";

/**
 * One Durable Object per board. Holds the authoritative BoardState,
 * applies mutations through the same `reduce` function the client and the
 * WebMCP tools use, and broadcasts every patch to connected clients so
 * multiple humans and agents can work the same board live.
 */
export class BoardDurableObject extends SyncedDurableObject {
  private cached: BoardState | null = null;

  private async loadState(): Promise<BoardState> {
    if (this.cached) return this.cached;
    const stored = await this.state.storage.get<BoardState>("board");
    this.cached = stored ?? seedBoard();
    if (!stored) await this.state.storage.put("board", this.cached);
    return this.cached;
  }

  protected async snapshot(): Promise<BoardState> {
    return this.loadState();
  }

  protected async applyPatch(patch: Patch): Promise<{ entityId: string; before: unknown; after: unknown }> {
    const state = await this.loadState();
    const action = { type: patch.type, payload: patch.payload } as ActionType;
    const result = reduce(state, action, patch.actor as Actor);
    this.cached = result.state;
    await this.state.storage.put("board", this.cached);
    return { entityId: result.entityId, before: result.before, after: result.after };
  }

  protected async resetState(): Promise<void> {
    this.cached = seedBoard();
    await this.state.storage.put("board", this.cached);
  }

  async getAuditTrailPublic() {
    return this.getAuditTrail();
  }
}
