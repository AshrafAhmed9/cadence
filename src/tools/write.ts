import type { Actor } from "../cf-foundation/actor.js";
import { defineTool } from "@ashraf009/webmcp-kit";
import type { BoardStore } from "../lib/store.js";
import { NotFoundError } from "../shared/reducer.js";

function resolveId(store: BoardStore, idOrKey: string): string {
  const state = store.getState();
  if (state.issues[idOrKey]) return idOrKey;
  const byKey = Object.values(state.issues).find((i) => i.key === idOrKey);
  if (!byKey) throw new NotFoundError(idOrKey);
  return byKey.id;
}

/**
 * Write tools take an `actor` fixed at creation time — a component
 * registers these once per (store, actor) pair via `useScopedTools`, so
 * every mutation an agent makes through WebMCP is attributed to that
 * specific agent identity, never anonymized to "the API caller."
 */
export function createWriteTools(store: BoardStore, actor: Actor) {
  const createIssue = defineTool({
    name: "create_issue",
    description: "Create a new issue on the board.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] as const },
        labels: { type: "array", items: { type: "string" } },
      },
      required: ["title"],
      additionalProperties: false,
    } as const,
    handler(input) {
      store.dispatch({ type: "create_issue", payload: input }, actor, { label: `create "${input.title}"` });
      const state = store.getState();
      const created = Object.values(state.issues).sort((a, b) => b.createdAt - a.createdAt)[0];
      return { created: created ? { id: created.id, key: created.key } : null };
    },
  });

  const updateIssue = defineTool({
    name: "update_issue",
    description: "Update an issue's title or body.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "update_issue", payload: { id, title: input.title, body: input.body } }, actor, {
        label: `update ${input.id}`,
      });
      return { ok: true };
    },
  });

  const setStatus = defineTool({
    name: "set_status",
    description: "Change an issue's status column.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const },
      },
      required: ["id", "status"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "set_status", payload: { id, status: input.status } }, actor, {
        label: `set ${input.id} to ${input.status}`,
      });
      return { ok: true };
    },
  });

  const setPriority = defineTool({
    name: "set_priority",
    description: "Change an issue's priority.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] as const } },
      required: ["id", "priority"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "set_priority", payload: { id, priority: input.priority } }, actor, {
        label: `set ${input.id} priority to ${input.priority}`,
      });
      return { ok: true };
    },
  });

  const assign = defineTool({
    name: "assign",
    description: "Assign an issue to a member, or pass null to unassign.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, assignee: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "assign", payload: { id, assignee: input.assignee ?? null } }, actor, {
        label: `assign ${input.id}`,
      });
      return { ok: true };
    },
  });

  const addLabel = defineTool({
    name: "add_label",
    description: "Add a label to an issue.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, labelId: { type: "string" } },
      required: ["id", "labelId"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "add_label", payload: { id, labelId: input.labelId } }, actor, {
        label: `label ${input.id}`,
      });
      return { ok: true };
    },
  });

  const removeLabel = defineTool({
    name: "remove_label",
    description: "Remove a label from an issue.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, labelId: { type: "string" } },
      required: ["id", "labelId"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "remove_label", payload: { id, labelId: input.labelId } }, actor, {
        label: `unlabel ${input.id}`,
      });
      return { ok: true };
    },
  });

  const addComment = defineTool({
    name: "add_comment",
    description: "Add a comment to an issue, authored under the caller's own identity.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, body: { type: "string" } },
      required: ["id", "body"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "add_comment", payload: { id, body: input.body } }, actor, {
        label: `comment on ${input.id}`,
      });
      return { ok: true };
    },
  });

  const linkIssues = defineTool({
    name: "link_issues",
    description: "Link two issues (blocks, blocked_by, relates_to, or duplicate_of).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        linkType: { type: "string", enum: ["blocks", "blocked_by", "relates_to", "duplicate_of"] as const },
        targetId: { type: "string" },
      },
      required: ["id", "linkType", "targetId"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      const targetId = resolveId(store, input.targetId);
      store.dispatch({ type: "link_issues", payload: { id, linkType: input.linkType, targetId } }, actor, {
        label: `link ${input.id} to ${input.targetId}`,
      });
      return { ok: true };
    },
  });

  const moveToCycle = defineTool({
    name: "move_to_cycle",
    description: "Move an issue into a cycle, or pass null to remove it from its current cycle.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, cycleId: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "move_to_cycle", payload: { id, cycleId: input.cycleId ?? null } }, actor, {
        label: `move ${input.id} to cycle`,
      });
      return { ok: true };
    },
  });

  const setEstimate = defineTool({
    name: "set_estimate",
    description: "Set an issue's story-point estimate.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, estimate: { type: "number" } },
      required: ["id"],
      additionalProperties: false,
    } as const,
    handler(input) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "set_estimate", payload: { id, estimate: input.estimate ?? null } }, actor, {
        label: `estimate ${input.id}`,
      });
      return { ok: true };
    },
  });

  return {
    createIssue,
    updateIssue,
    setStatus,
    setPriority,
    assign,
    addLabel,
    removeLabel,
    addComment,
    linkIssues,
    moveToCycle,
    setEstimate,
  };
}
