import { defineTool } from "webmcp-kit";
import type { BoardStore } from "../lib/store.js";
import type { Issue, IssuePriority, IssueStatus } from "../shared/types.js";

function summarize(issue: Issue) {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    labels: issue.labels,
    cycleId: issue.cycleId,
    estimate: issue.estimate,
    updatedAt: issue.updatedAt,
  };
}

export interface Selection {
  issueId: string | null;
  filter: { status?: IssueStatus; labels?: string[]; cycleId?: string } | null;
  view: "board" | "list" | "cycle";
}

export function createReadTools(store: BoardStore, getSelection: () => Selection) {
  const listIssues = defineTool({
    name: "list_issues",
    description: "List issues, optionally filtered by status, assignee, priority, labels, or cycle.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const },
        assignee: { type: "string" },
        priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] as const },
        cycleId: { type: "string" },
        limit: { type: "number", description: "Max results, default 50" },
      },
      required: [],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      const state = store.getState();
      let issues = Object.values(state.issues);
      if (input.status) issues = issues.filter((i) => i.status === input.status);
      if (input.assignee) issues = issues.filter((i) => i.assignee === input.assignee);
      if (input.priority) issues = issues.filter((i) => i.priority === input.priority);
      if (input.cycleId) issues = issues.filter((i) => i.cycleId === input.cycleId);
      issues.sort((a, b) => b.updatedAt - a.updatedAt);
      return issues.slice(0, input.limit ?? 50).map(summarize);
    },
  });

  const getIssue = defineTool({
    name: "get_issue",
    description: "Get full details of one issue by id or key, including comments and links.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Issue id or key, e.g. CAD-142" } },
      required: ["id"],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      const state = store.getState();
      const issue =
        state.issues[input.id] ?? Object.values(state.issues).find((i) => i.key === input.id);
      if (!issue) return { error: `Issue "${input.id}" not found.` };
      return issue;
    },
  });

  const searchIssues = defineTool({
    name: "search_issues",
    description: "Search issues by text across title and body.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      const q = input.query.toLowerCase();
      const state = store.getState();
      const matches = Object.values(state.issues)
        .filter((i) => i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q))
        .slice(0, input.limit ?? 25);
      return matches.map(summarize);
    },
  });

  const getBoardState = defineTool({
    name: "get_board_state",
    description: "Get board-level summary: counts per status column, active filters, current view.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } as const,
    annotations: { readOnlyHint: true },
    handler() {
      const state = store.getState();
      const counts: Record<IssueStatus, number> = {
        backlog: 0,
        todo: 0,
        in_progress: 0,
        in_review: 0,
        done: 0,
        cancelled: 0,
      };
      for (const issue of Object.values(state.issues)) counts[issue.status]++;
      return { counts, selection: getSelection(), totalIssues: Object.keys(state.issues).length };
    },
  });

  const getCurrentSelection = defineTool({
    name: "get_current_selection",
    description: "Get what the human currently has selected or open in the UI.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } as const,
    annotations: { readOnlyHint: true },
    handler() {
      return getSelection();
    },
  });

  const listLabels = defineTool({
    name: "list_labels",
    description: "List all labels available on the board.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } as const,
    annotations: { readOnlyHint: true },
    handler() {
      return Object.values(store.getState().labels);
    },
  });

  const listCycles = defineTool({
    name: "list_cycles",
    description: "List all cycles (sprints) with their date ranges.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } as const,
    annotations: { readOnlyHint: true },
    handler() {
      return Object.values(store.getState().cycles);
    },
  });

  return { listIssues, getIssue, searchIssues, getBoardState, getCurrentSelection, listLabels, listCycles };
}

export type { IssuePriority };
