import type { Actor } from "../cf-foundation/actor.js";
import type { ActionType } from "../shared/reducer.js";
import { reduce } from "../shared/reducer.js";
import type { BoardState } from "../shared/types.js";

export interface UndoEntry {
  /** Usually one inverse action; `bulk_update` expands to one per issue since each had different prior values. */
  inverse: ActionType[];
  actor: Actor;
  label: string;
}

export type StoreListener = (state: BoardState) => void;

/**
 * Client-side board store. Holds authoritative-for-rendering state locally
 * (an IndexedDB-backed cache in front, a live WebSocket sync client behind
 * — see `sync.ts`), applies every mutation through the same `reduce`
 * function the Durable Object and the WebMCP tools use, and maintains a
 * single undo stack shared by human and agent edits: an agent's action is
 * undone with the same Cmd+Z as the human's own.
 */
export function createBoardStore(initial: BoardState) {
  let state = initial;
  const listeners = new Set<StoreListener>();
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];
  let onDispatch: ((action: ActionType, actor: Actor) => void) | null = null;

  function getState(): BoardState {
    return state;
  }

  function subscribe(listener: StoreListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify(): void {
    for (const listener of listeners) listener(state);
  }

  /** Called by the sync client so remote-originated dispatches don't get re-broadcast. */
  function onLocalDispatch(handler: (action: ActionType, actor: Actor) => void): void {
    onDispatch = handler;
  }

  function dispatch(action: ActionType, actor: Actor, options: { record?: boolean; label?: string; broadcast?: boolean } = {}): void {
    // create_issue's inverse needs the id the reducer generates, so it's
    // computed after reduce() rather than before, unlike every other action.
    const inverse = action.type === "create_issue" ? null : computeInverse(state, action);
    const result = reduce(state, action, actor);
    state = result.state;
    if (options.record !== false) {
      const resolvedInverse: ActionType[] =
        inverse ?? [{ type: "set_status", payload: { id: result.entityId, status: "cancelled" } }];
      undoStack.push({ inverse: resolvedInverse, actor, label: options.label ?? action.type });
      redoStack.length = 0;
    }
    notify();
    if (options.broadcast !== false) onDispatch?.(action, actor);
  }

  /** Applies a mutation received from the server (another client, or an agent acting elsewhere) without re-broadcasting or touching the undo stack. */
  function applyRemote(action: ActionType, actor: Actor): void {
    state = reduce(state, action, actor).state;
    notify();
  }

  /** Replaces state wholesale with a server snapshot (e.g. on initial WebSocket connect). Clears undo history, since it no longer applies to the adopted state. */
  function hydrate(next: BoardState): void {
    state = next;
    undoStack.length = 0;
    redoStack.length = 0;
    notify();
  }

  function undo(): void {
    const entry = undoStack.pop();
    if (!entry) return;
    const redoInverse = entry.inverse.flatMap((a) => computeInverse(state, a));
    for (const a of entry.inverse) {
      state = reduce(state, a, entry.actor).state;
      onDispatch?.(a, entry.actor);
    }
    redoStack.push({ inverse: redoInverse, actor: entry.actor, label: entry.label });
    notify();
  }

  function redo(): void {
    const entry = redoStack.pop();
    if (!entry) return;
    const undoInverse = entry.inverse.flatMap((a) => computeInverse(state, a));
    for (const a of entry.inverse) {
      state = reduce(state, a, entry.actor).state;
      onDispatch?.(a, entry.actor);
    }
    undoStack.push({ inverse: undoInverse, actor: entry.actor, label: entry.label });
    notify();
  }

  return { getState, subscribe, dispatch, applyRemote, hydrate, undo, redo, onLocalDispatch, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0 };
}

export type BoardStore = ReturnType<typeof createBoardStore>;

/**
 * Builds the inverse of an action *before* it's applied, so undo can be a
 * plain re-dispatch of a captured prior action rather than a snapshot
 * restore (which would fight with concurrent remote edits in multiplayer).
 */
function computeInverse(state: BoardState, action: ActionType): ActionType[] {
  switch (action.type) {
    case "create_issue":
      // Handled specially in dispatch() — the inverse needs the id reduce() generates.
      throw new Error("unreachable: create_issue inverse is computed in dispatch()");
    case "set_status": {
      const before = state.issues[action.payload.id];
      return [{ type: "set_status", payload: { id: action.payload.id, status: before?.status ?? "backlog" } }];
    }
    case "set_priority": {
      const before = state.issues[action.payload.id];
      return [{ type: "set_priority", payload: { id: action.payload.id, priority: before?.priority ?? "none" } }];
    }
    case "assign": {
      const before = state.issues[action.payload.id];
      return [{ type: "assign", payload: { id: action.payload.id, assignee: before?.assignee ?? null } }];
    }
    case "move_to_cycle": {
      const before = state.issues[action.payload.id];
      return [{ type: "move_to_cycle", payload: { id: action.payload.id, cycleId: before?.cycleId ?? null } }];
    }
    case "set_estimate": {
      const before = state.issues[action.payload.id];
      return [{ type: "set_estimate", payload: { id: action.payload.id, estimate: before?.estimate ?? null } }];
    }
    case "bulk_update": {
      // Each issue may have had different prior values, so undo expands into
      // one restore action per issue rather than a single shared patch —
      // a shared patch would silently overwrite issues to the wrong values.
      return action.payload.ids.flatMap((id): ActionType[] => {
        const before = state.issues[id];
        if (!before) return [];
        const restore: ActionType = {
          type: "bulk_update",
          payload: {
            ids: [id],
            patch: {
              ...(action.payload.patch.status !== undefined ? { status: before.status } : {}),
              ...(action.payload.patch.priority !== undefined ? { priority: before.priority } : {}),
              ...(action.payload.patch.assignee !== undefined ? { assignee: before.assignee } : {}),
              ...(action.payload.patch.cycleId !== undefined ? { cycleId: before.cycleId } : {}),
            },
          },
        };
        return [restore];
      });
    }
    default:
      // add_label/remove_label/add_comment/link_issues/merge_duplicates/split_issue/update_issue
      // are treated as non-undoable in v1 — they're additive/log-like or destructive-with-confirmation
      // and get a confirmation dialog instead. Returning the same action makes undo a safe no-op
      // rather than corrupting state.
      return [action];
  }
}
