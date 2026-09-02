import type { Actor } from "../cf-foundation/actor.js";
import type { ActionType } from "../shared/reducer.js";
import type { BoardState } from "../shared/types.js";
import type { BoardStore } from "./store.js";

export type SyncStatus = "connecting" | "open" | "closed" | "unavailable";

/**
 * Connects a BoardStore to the live Durable Object over WebSocket. Applies
 * the server snapshot on connect, forwards local dispatches, and applies
 * incoming patches from other clients via `store.applyRemote`. Optional —
 * the store works standalone (seeded, local-only) if this never connects,
 * which is what keeps the app usable when offline or during local dev
 * without `wrangler dev` running.
 */
export function connectSync(
  store: BoardStore,
  boardId: string,
  actor: Actor,
  onStatus: (status: SyncStatus) => void,
  onSnapshot?: (state: BoardState) => void,
): () => void {
  let ws: WebSocket | null = null;
  let closedByCaller = false;

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    onStatus("connecting");
    try {
      ws = new WebSocket(`${proto}//${location.host}/api/board/${boardId}`);
    } catch {
      onStatus("unavailable");
      return;
    }

    ws.addEventListener("open", () => onStatus("open"));
    ws.addEventListener("close", () => {
      onStatus("closed");
      if (!closedByCaller) setTimeout(connect, 2000);
    });
    ws.addEventListener("error", () => onStatus("unavailable"));

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "snapshot") {
        onSnapshot?.(msg.payload as BoardState);
      } else if (msg.type === "patch") {
        const patch = msg.payload as { type: ActionType["type"]; payload: unknown; actor: Actor };
        store.applyRemote({ type: patch.type, payload: patch.payload } as ActionType, patch.actor);
      }
    });
  }

  store.onLocalDispatch((action, dispatchActor) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: action.type, payload: action.payload, actor: dispatchActor, timestamp: Date.now() }));
    }
  });

  connect();

  return () => {
    closedByCaller = true;
    ws?.close();
  };
}
