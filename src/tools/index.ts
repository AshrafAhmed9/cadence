import type { Actor } from "../cf-foundation/actor.js";
import { defineTool, type ActivityLog } from "webmcp-kit";
import type { BoardStore } from "../lib/store.js";
import { createReadTools, type Selection } from "./read.js";
import { createWriteTools } from "./write.js";
import { createHigherOrderTools, type HigherOrderDeps } from "./higher-order.js";

export { type Selection } from "./read.js";

function createActivityTool(log: ActivityLog) {
  return defineTool({
    name: "get_activity",
    description: "Get recent tool-call activity on this board, with actor attribution.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
      required: [],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      return log.getAll().slice(0, input.limit ?? 20);
    },
  });
}

export function createCadenceTools(params: {
  store: BoardStore;
  actor: Actor;
  getSelection: () => Selection;
  activityLog: ActivityLog;
  confirmations: HigherOrderDeps;
}) {
  const read = createReadTools(params.store, params.getSelection);
  const write = createWriteTools(params.store, params.actor);
  const higherOrder = createHigherOrderTools(params.store, params.actor, params.confirmations);
  const activity = createActivityTool(params.activityLog);

  return {
    read: Object.values(read),
    write: Object.values(write),
    higherOrder: Object.values(higherOrder),
    activity: [activity],
    all: [...Object.values(read), ...Object.values(write), ...Object.values(higherOrder), activity],
  };
}
