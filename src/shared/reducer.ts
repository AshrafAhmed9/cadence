import type { Actor } from "../cf-foundation/actor.js";
import type { BoardState, Issue, IssuePriority, IssueStatus, LinkType } from "./types.js";
import { nextIssueKey } from "./types.js";

/**
 * Every board mutation lives here as a pure function of
 * `(state, actor, args) => { state, entityId, before, after }`. This is the
 * single reducer shared by three call sites: the client store (optimistic
 * local apply), the Durable Object (`applyPatch`, authoritative), and the
 * WebMCP tool handlers in `src/tools/`. Keeping mutation logic out of the
 * tool `execute` closures is what lets the same functions back both the
 * real agent and the simulated-agent fallback.
 */

export type ActionType =
  | { type: "create_issue"; payload: { title: string; body?: string; priority?: IssuePriority; labels?: string[] } }
  | { type: "update_issue"; payload: { id: string; title?: string; body?: string } }
  | { type: "set_status"; payload: { id: string; status: IssueStatus } }
  | { type: "set_priority"; payload: { id: string; priority: IssuePriority } }
  | { type: "assign"; payload: { id: string; assignee: string | null } }
  | { type: "add_label"; payload: { id: string; labelId: string } }
  | { type: "remove_label"; payload: { id: string; labelId: string } }
  | { type: "add_comment"; payload: { id: string; body: string } }
  | { type: "link_issues"; payload: { id: string; linkType: LinkType; targetId: string } }
  | { type: "move_to_cycle"; payload: { id: string; cycleId: string | null } }
  | { type: "set_estimate"; payload: { id: string; estimate: number | null } }
  | { type: "merge_duplicates"; payload: { primaryId: string; duplicateIds: string[] } }
  | { type: "split_issue"; payload: { id: string; subtitles: string[] } }
  | { type: "bulk_update"; payload: { ids: string[]; patch: Partial<Pick<Issue, "status" | "priority" | "assignee" | "cycleId">> } };

export interface ReduceResult {
  state: BoardState;
  entityId: string;
  before: unknown;
  after: unknown;
}

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`Issue "${id}" not found.`);
    this.name = "NotFoundError";
  }
}

function touch(issue: Issue): Issue {
  return { ...issue, updatedAt: Date.now() };
}

function requireIssue(state: BoardState, id: string): Issue {
  const issue = state.issues[id];
  if (!issue) throw new NotFoundError(id);
  return issue;
}

export function reduce(state: BoardState, action: ActionType, actor: Actor): ReduceResult {
  switch (action.type) {
    case "create_issue": {
      const id = crypto.randomUUID();
      const existing = Object.values(state.issues);
      const issue: Issue = {
        id,
        key: nextIssueKey(existing),
        title: action.payload.title,
        body: action.payload.body ?? "",
        status: "backlog",
        priority: action.payload.priority ?? "none",
        assignee: null,
        labels: action.payload.labels ?? [],
        cycleId: null,
        parentId: null,
        estimate: null,
        links: [],
        comments: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: actor.kind,
      };
      return {
        state: { ...state, issues: { ...state.issues, [id]: issue }, issueOrder: [id, ...state.issueOrder] },
        entityId: id,
        before: null,
        after: issue,
      };
    }

    case "update_issue": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({
        ...before,
        ...(action.payload.title !== undefined ? { title: action.payload.title } : {}),
        ...(action.payload.body !== undefined ? { body: action.payload.body } : {}),
      });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "set_status": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({ ...before, status: action.payload.status });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "set_priority": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({ ...before, priority: action.payload.priority });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "assign": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({ ...before, assignee: action.payload.assignee });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "add_label": {
      const before = requireIssue(state, action.payload.id);
      if (before.labels.includes(action.payload.labelId)) {
        return { state, entityId: before.id, before, after: before };
      }
      const after = touch({ ...before, labels: [...before.labels, action.payload.labelId] });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "remove_label": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({ ...before, labels: before.labels.filter((l) => l !== action.payload.labelId) });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "add_comment": {
      const before = requireIssue(state, action.payload.id);
      const comment = {
        id: crypto.randomUUID(),
        author: actor.kind === "human" ? actor.name : actor.name,
        authorKind: actor.kind,
        body: action.payload.body,
        createdAt: Date.now(),
      };
      const after = touch({ ...before, comments: [...before.comments, comment] });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "link_issues": {
      const before = requireIssue(state, action.payload.id);
      requireIssue(state, action.payload.targetId);
      const after = touch({
        ...before,
        links: [...before.links, { type: action.payload.linkType, issueId: action.payload.targetId }],
      });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "move_to_cycle": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({ ...before, cycleId: action.payload.cycleId });
      let next = withIssue(state, after);
      if (before.cycleId && state.cycles[before.cycleId]) {
        next = withCycle(next, {
          ...next.cycles[before.cycleId],
          issueIds: next.cycles[before.cycleId].issueIds.filter((i) => i !== before.id),
        });
      }
      if (action.payload.cycleId && next.cycles[action.payload.cycleId]) {
        const cycle = next.cycles[action.payload.cycleId];
        if (!cycle.issueIds.includes(before.id)) {
          next = withCycle(next, { ...cycle, issueIds: [...cycle.issueIds, before.id] });
        }
      }
      return { state: next, entityId: after.id, before, after };
    }

    case "set_estimate": {
      const before = requireIssue(state, action.payload.id);
      const after = touch({ ...before, estimate: action.payload.estimate });
      return { state: withIssue(state, after), entityId: after.id, before, after };
    }

    case "merge_duplicates": {
      const primary = requireIssue(state, action.payload.primaryId);
      let next = state;
      const mergedComments = [...primary.comments];
      for (const dupId of action.payload.duplicateIds) {
        if (dupId === primary.id) continue;
        const dup = requireIssue(next, dupId);
        mergedComments.push(...dup.comments);
        const closedDup = touch({ ...dup, status: "cancelled" as IssueStatus, links: [...dup.links, { type: "duplicate_of" as LinkType, issueId: primary.id }] });
        next = withIssue(next, closedDup);
      }
      const mergedPrimary = touch({ ...primary, comments: mergedComments });
      next = withIssue(next, mergedPrimary);
      return { state: next, entityId: primary.id, before: primary, after: mergedPrimary };
    }

    case "split_issue": {
      const parent = requireIssue(state, action.payload.id);
      let next = state;
      const createdIds: string[] = [];
      for (const title of action.payload.subtitles) {
        const id = crypto.randomUUID();
        const child: Issue = {
          id,
          key: nextIssueKey(Object.values(next.issues)),
          title,
          body: "",
          status: "backlog",
          priority: parent.priority,
          assignee: null,
          labels: parent.labels,
          cycleId: parent.cycleId,
          parentId: parent.id,
          estimate: null,
          links: [],
          comments: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: actor.kind,
        };
        next = { ...next, issues: { ...next.issues, [id]: child }, issueOrder: [id, ...next.issueOrder] };
        createdIds.push(id);
      }
      return { state: next, entityId: parent.id, before: parent, after: { parent, createdIds } };
    }

    case "bulk_update": {
      let next = state;
      const before: Issue[] = [];
      const after: Issue[] = [];
      for (const id of action.payload.ids) {
        const issue = requireIssue(next, id);
        before.push(issue);
        const updated = touch({ ...issue, ...action.payload.patch });
        next = withIssue(next, updated);
        after.push(updated);
      }
      return { state: next, entityId: action.payload.ids.join(","), before, after };
    }
  }
}

function withIssue(state: BoardState, issue: Issue): BoardState {
  return { ...state, issues: { ...state.issues, [issue.id]: issue } };
}

function withCycle(state: BoardState, cycle: BoardState["cycles"][string]): BoardState {
  return { ...state, cycles: { ...state.cycles, [cycle.id]: cycle } };
}
