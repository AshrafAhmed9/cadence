export { BoardDurableObject } from "./board-do.js";

export interface Env {
  BOARD: DurableObjectNamespace;
  ASSETS: Fetcher;
}

/**
 * Every board lives in a single Durable Object, keyed by board id (a demo
 * account gets one fixed board so the judge-facing URL always lands on a
 * populated board with zero setup — see README for the auth caveat).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/board/")) {
      const boardId = url.pathname.split("/")[3] ?? "demo";
      const id = env.BOARD.idFromName(boardId);
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
