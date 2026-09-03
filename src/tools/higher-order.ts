import type { Actor } from "../cf-foundation/actor.js";
import { defineTool, withConfirmation, type ConfirmFn } from "@ashraf009/webmcp-kit";
import type { BoardStore } from "../lib/store.js";
import type { Issue, IssuePriority } from "../shared/types.js";
import { NotFoundError } from "../shared/reducer.js";

function resolveId(store: BoardStore, idOrKey: string): string {
  const state = store.getState();
  if (state.issues[idOrKey]) return idOrKey;
  const byKey = Object.values(state.issues).find((i) => i.key === idOrKey);
  if (!byKey) throw new NotFoundError(idOrKey);
  return byKey.id;
}

const STOPWORDS = new Set(["the", "a", "an", "to", "of", "in", "on", "for", "is", "and", "with", "when", "not"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const URGENCY_KEYWORDS = ["crash", "down", "outage", "data loss", "security", "broken", "blocker", "cannot", "regression"];

function suggestPriority(issue: Issue): IssuePriority {
  const text = `${issue.title} ${issue.body}`.toLowerCase();
  if (URGENCY_KEYWORDS.some((k) => text.includes(k))) return "urgent";
  if (text.includes("should") || text.includes("improve")) return "low";
  return "medium";
}

export interface HigherOrderDeps {
  confirmMerge: ConfirmFn<any>;
  confirmSplit: ConfirmFn<any>;
  confirmBulk: ConfirmFn<any>;
}

export function createHigherOrderTools(store: BoardStore, actor: Actor, deps: HigherOrderDeps) {
  const triageInbox = defineTool({
    name: "triage_inbox",
    description: "List untriaged issues (backlog, no priority set) with a suggested priority for each, for the agent to act on with set_priority.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } as const,
    annotations: { readOnlyHint: true },
    handler() {
      const issues = Object.values(store.getState().issues).filter(
        (i) => i.status === "backlog" && i.priority === "none",
      );
      return issues.map((i) => ({ id: i.id, key: i.key, title: i.title, suggestedPriority: suggestPriority(i) }));
    },
  });

  const findDuplicates = defineTool({
    name: "find_duplicates",
    description: "Find clusters of likely-duplicate issues by title/body similarity, with a 0-1 score. Pass results to merge_duplicates.",
    inputSchema: {
      type: "object",
      properties: { minScore: { type: "number", description: "Similarity threshold, default 0.2. Real paraphrased duplicates rarely exceed 0.3 on bag-of-words overlap, so this is tuned low on purpose — expect some false positives at the low end and read the score." } },
      required: [],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      const threshold = input.minScore ?? 0.2;
      const issues = Object.values(store.getState().issues).filter((i) => i.status !== "cancelled");
      const tokens = new Map(issues.map((i) => [i.id, tokenize(`${i.title} ${i.body}`)]));
      const clusters: { issueIds: string[]; keys: string[]; score: number }[] = [];
      const claimed = new Set<string>();

      for (let a = 0; a < issues.length; a++) {
        if (claimed.has(issues[a].id)) continue;
        const cluster = [issues[a].id];
        let clusterScore = 0;
        for (let b = a + 1; b < issues.length; b++) {
          if (claimed.has(issues[b].id)) continue;
          const score = jaccard(tokens.get(issues[a].id)!, tokens.get(issues[b].id)!);
          if (score >= threshold) {
            cluster.push(issues[b].id);
            clusterScore = Math.max(clusterScore, score);
          }
        }
        if (cluster.length > 1) {
          for (const id of cluster) claimed.add(id);
          clusters.push({
            issueIds: cluster,
            keys: cluster.map((id) => store.getState().issues[id].key),
            score: Math.round(clusterScore * 100) / 100,
          });
        }
      }
      return clusters;
    },
  });

  const mergeDuplicatesBase = {
    name: "merge_duplicates",
    description: "Merge a cluster of duplicate issues into one primary issue, preserving comments and closing the rest as duplicates. Requires human confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        primaryId: { type: "string" },
        duplicateIds: { type: "array", items: { type: "string" } },
      },
      required: ["primaryId", "duplicateIds"],
      additionalProperties: false,
    } as const,
    handler(input: { primaryId: string; duplicateIds: string[] }) {
      const primaryId = resolveId(store, input.primaryId);
      const duplicateIds = input.duplicateIds.map((id) => resolveId(store, id));
      store.dispatch({ type: "merge_duplicates", payload: { primaryId, duplicateIds } }, actor, {
        label: `merge ${duplicateIds.length} duplicate(s) into ${input.primaryId}`,
      });
      return { ok: true, primaryId, mergedCount: duplicateIds.length };
    },
  };
  const mergeDuplicates = withConfirmation(mergeDuplicatesBase, deps.confirmMerge);

  const splitIssueBase = {
    name: "split_issue",
    description: "Split one issue into several sub-issues under it, each inheriting its priority, labels, and cycle. Requires human confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        subtitles: { type: "array", items: { type: "string" }, description: "Titles for the new sub-issues" },
      },
      required: ["id", "subtitles"],
      additionalProperties: false,
    } as const,
    handler(input: { id: string; subtitles: string[] }) {
      const id = resolveId(store, input.id);
      store.dispatch({ type: "split_issue", payload: { id, subtitles: input.subtitles } }, actor, {
        label: `split ${input.id} into ${input.subtitles.length} sub-issues`,
      });
      return { ok: true, createdCount: input.subtitles.length };
    },
  };
  const splitIssue = withConfirmation(splitIssueBase, deps.confirmSplit);

  const bulkUpdateBase = {
    name: "bulk_update",
    description: "Apply a status/priority/assignee/cycle patch to many issues at once. Requires human confirmation and returns a preview if not yet confirmed.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const },
        priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] as const },
        assignee: { type: "string" },
        cycleId: { type: "string" },
      },
      required: ["ids"],
      additionalProperties: false,
    } as const,
    handler(input: { ids: string[]; status?: any; priority?: any; assignee?: string; cycleId?: string }) {
      const ids = input.ids.map((id) => resolveId(store, id));
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.assignee !== undefined) patch.assignee = input.assignee;
      if (input.cycleId !== undefined) patch.cycleId = input.cycleId;
      store.dispatch({ type: "bulk_update", payload: { ids, patch } }, actor, {
        label: `bulk update ${ids.length} issue(s)`,
      });
      return { ok: true, updatedCount: ids.length };
    },
  };
  const bulkUpdate = withConfirmation(bulkUpdateBase, deps.confirmBulk);

  const summarizeCycle = defineTool({
    name: "summarize_cycle",
    description: "Summarize a cycle: scope, progress, at-risk items, and blocked issues.",
    inputSchema: {
      type: "object",
      properties: { cycleId: { type: "string" } },
      required: ["cycleId"],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      const state = store.getState();
      const cycle = state.cycles[input.cycleId];
      if (!cycle) return { error: `Cycle "${input.cycleId}" not found.` };
      const issues = cycle.issueIds.map((id) => state.issues[id]).filter(Boolean);
      const done = issues.filter((i) => i.status === "done").length;
      const blocked = issues.filter((i) => i.links.some((l) => l.type === "blocked_by"));
      const daysLeft = Math.max(0, Math.ceil((cycle.endsAt - Date.now()) / 86_400_000));
      return {
        cycle: cycle.name,
        totalIssues: issues.length,
        done,
        completionRate: issues.length ? Math.round((done / issues.length) * 100) : 0,
        daysLeft,
        blockedIssues: blocked.map((i) => ({ key: i.key, title: i.title })),
        atRisk: daysLeft <= 2 && done / Math.max(issues.length, 1) < 0.7,
      };
    },
  });

  const estimateAndRank = defineTool({
    name: "estimate_and_rank",
    description: "Propose a priority ordering for a set of issues, with reasoning for each position.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
      additionalProperties: false,
    } as const,
    annotations: { readOnlyHint: true },
    handler(input) {
      const state = store.getState();
      const weight: Record<IssuePriority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
      const issues = input.ids.map((id) => resolveId(store, id)).map((id) => state.issues[id]);
      const ranked = [...issues].sort((a, b) => {
        const w = weight[b.priority] - weight[a.priority];
        if (w !== 0) return w;
        return (a.estimate ?? 99) - (b.estimate ?? 99);
      });
      return ranked.map((i, idx) => ({
        rank: idx + 1,
        key: i.key,
        title: i.title,
        reasoning: i.estimate === null ? `${i.priority} priority, unestimated — estimate before committing` : `${i.priority} priority, ${i.estimate} points`,
      }));
    },
  });

  return { triageInbox, findDuplicates, mergeDuplicates, splitIssue, bulkUpdate, summarizeCycle, estimateAndRank };
}
