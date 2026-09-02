import type { BoardState, Cycle, Issue, Label, Member } from "../src/shared/types.js";

/**
 * Seed data is deliberately messy: it contains real duplicate reports,
 * vague untriaged titles, and issues with no estimate or priority set — so
 * `triage_inbox`, `find_duplicates`, and `estimate_and_rank` have genuine
 * work to do on camera instead of operating on a suspiciously tidy board.
 */

const day = 86_400_000;

const labels: Label[] = [
  { id: "bug", name: "bug", color: "#e5484d" },
  { id: "feature", name: "feature", color: "#5b5bd6" },
  { id: "perf", name: "performance", color: "#f5a623" },
  { id: "docs", name: "docs", color: "#6b7280" },
  { id: "infra", name: "infra", color: "#0ea5e9" },
];

const members: Member[] = [
  { id: "u_amy", name: "Amy Chen", kind: "human", avatarColor: "#e5484d" },
  { id: "u_ravi", name: "Ravi Kapoor", kind: "human", avatarColor: "#5b5bd6" },
  { id: "u_lena", name: "Lena Fischer", kind: "human", avatarColor: "#f5a623" },
];

interface SeedIssue {
  title: string;
  body: string;
  status: Issue["status"];
  priority: Issue["priority"];
  assignee: string | null;
  labels: string[];
  cycleId: string | null;
  estimate: number | null;
  ageDays: number;
}

const seedIssues: SeedIssue[] = [
  // A genuine duplicate cluster: three reports of the same login bug, worded differently.
  { title: "Login fails after password reset", body: "Users who reset their password can't log in — get a 401 immediately after the reset email flow completes.", status: "todo", priority: "none", assignee: null, labels: ["bug"], cycleId: null, estimate: null, ageDays: 2 },
  { title: "Can't log in after resetting password", body: "Same as above — reset password, then login returns unauthorized. Happens every time in prod.", status: "backlog", priority: "none", assignee: null, labels: ["bug"], cycleId: null, estimate: null, ageDays: 1 },
  { title: "401 on login post password-reset flow", body: "Support ticket: customer reset password via email link, subsequent login attempt fails with a 401 error.", status: "backlog", priority: "none", assignee: null, labels: ["bug"], cycleId: null, estimate: null, ageDays: 3 },

  // Another duplicate pair: export timeout.
  { title: "CSV export times out for large boards", body: "Exporting a board with 500+ issues to CSV hangs and eventually times out client-side.", status: "todo", priority: "medium", assignee: "u_lena", labels: ["perf"], cycleId: "c_current", estimate: 5, ageDays: 6 },
  { title: "Large board CSV export hangs", body: "Same export feature — boards over ~500 issues cause the export to hang indefinitely.", status: "backlog", priority: "none", assignee: null, labels: [], cycleId: null, estimate: null, ageDays: 1 },

  // Vague, untriaged — good triage_inbox candidates.
  { title: "Fix the thing with cycle dates", body: "Someone mentioned cycle end dates look off in the sidebar. Need to look into it.", status: "backlog", priority: "none", assignee: null, labels: [], cycleId: null, estimate: null, ageDays: 4 },
  { title: "Investigate slow board load", body: "Board takes a while to load for the design team. No repro steps yet.", status: "backlog", priority: "none", assignee: null, labels: ["perf"], cycleId: null, estimate: null, ageDays: 5 },
  { title: "App crashes on filter", body: "One user reported the app crashed while applying a filter. Need more info but flagging now.", status: "backlog", priority: "none", assignee: null, labels: ["bug"], cycleId: null, estimate: null, ageDays: 1 },
  { title: "Data loss on offline reconnect", body: "A user's local edits disappeared after their laptop reconnected to wifi. Potential sync bug, high impact if confirmed.", status: "backlog", priority: "none", assignee: null, labels: ["bug", "infra"], cycleId: null, estimate: null, ageDays: 2 },

  // Real in-progress work, properly triaged, for board texture.
  { title: "Add keyboard shortcut for command palette", body: "Cmd+K should open the command palette from anywhere in the app.", status: "in_progress", priority: "medium", assignee: "u_amy", labels: ["feature"], cycleId: "c_current", estimate: 3, ageDays: 8 },
  { title: "Support drag-to-reorder in backlog", body: "Backlog items should be reorderable via drag and drop, persisting the order.", status: "in_progress", priority: "low", assignee: "u_ravi", labels: ["feature"], cycleId: "c_current", estimate: 5, ageDays: 9 },
  { title: "Write onboarding docs for new members", body: "New team members have no written guide to the board's conventions.", status: "todo", priority: "low", assignee: null, labels: ["docs"], cycleId: "c_next", estimate: 2, ageDays: 3 },
  { title: "Migrate label colors to design tokens", body: "Label colors are hardcoded hex values scattered through the codebase; move to shared tokens.", status: "in_review", priority: "low", assignee: "u_lena", labels: ["infra"], cycleId: "c_current", estimate: 3, ageDays: 10 },
  { title: "Rate limit the public API", body: "The public API has no rate limiting, which is a real risk under load.", status: "todo", priority: "high", assignee: "u_ravi", labels: ["infra", "bug"], cycleId: "c_current", estimate: 8, ageDays: 5 },
  { title: "Dark mode contrast fixes", body: "Several dark-mode surfaces fail WCAG AA contrast, flagged in the accessibility pass.", status: "todo", priority: "medium", assignee: "u_amy", labels: ["bug"], cycleId: "c_current", estimate: 3, ageDays: 4 },
  { title: "Cache board state for instant reload", body: "Board should render instantly from cache on reload, then reconcile with the server.", status: "backlog", priority: "medium", assignee: null, labels: ["perf", "feature"], cycleId: null, estimate: null, ageDays: 6 },
  { title: "Weekly digest email for cycle summaries", body: "Send a weekly email summarizing cycle progress to each member.", status: "backlog", priority: "low", assignee: null, labels: ["feature"], cycleId: null, estimate: null, ageDays: 12 },
  { title: "Blocked: SSO rollout waiting on IT", body: "SSO integration is code-complete but blocked on the customer's IT team providing SAML metadata.", status: "in_review", priority: "high", assignee: "u_ravi", labels: ["infra"], cycleId: "c_current", estimate: 5, ageDays: 11 },
  { title: "Comment mentions don't send notifications", body: "@mentioning someone in a comment should notify them; currently a no-op.", status: "todo", priority: "medium", assignee: null, labels: ["bug", "feature"], cycleId: "c_current", estimate: 3, ageDays: 3 },
  { title: "Audit log page is missing pagination", body: "The audit log view loads the entire history at once, which is slow for old boards.", status: "backlog", priority: "medium", assignee: null, labels: ["perf"], cycleId: null, estimate: null, ageDays: 2 },

  // Completed work, for a realistic done column.
  { title: "Add board-level activity feed", body: "Live feed of tool calls and edits, visible in the sidebar.", status: "done", priority: "high", assignee: "u_amy", labels: ["feature"], cycleId: "c_prev", estimate: 5, ageDays: 15 },
  { title: "Fix flaky cycle-progress calculation", body: "Cycle completion percentage occasionally showed >100%.", status: "done", priority: "medium", assignee: "u_lena", labels: ["bug"], cycleId: "c_prev", estimate: 2, ageDays: 18 },
  { title: "Set up CI for the board service", body: "Basic lint/typecheck/test pipeline for the board backend.", status: "done", priority: "medium", assignee: "u_ravi", labels: ["infra"], cycleId: "c_prev", estimate: 3, ageDays: 20 },
];

function buildBoard(): BoardState {
  // Computed here, not at module scope: Cloudflare Workers doesn't
  // guarantee wall-clock time outside a request's I/O context, so a
  // `Date.now()` read at module top-level can be frozen to an arbitrary
  // fixed value (seen live: every "recent" timestamp came out as just the
  // offset from epoch). Calling this at request/reset time gets a real
  // clock read.
  const now = Date.now();
  const cycles: Cycle[] = [
    { id: "c_prev", name: "Cycle 12", startsAt: now - 21 * day, endsAt: now - 7 * day, issueIds: [] },
    { id: "c_current", name: "Cycle 13", startsAt: now - 7 * day, endsAt: now + 3 * day, issueIds: [] },
    { id: "c_next", name: "Cycle 14", startsAt: now + 3 * day, endsAt: now + 17 * day, issueIds: [] },
  ];
  const issues: Record<string, Issue> = {};
  const issueOrder: string[] = [];
  seedIssues.forEach((s, idx) => {
    const id = `seed_${idx}`;
    const createdAt = now - s.ageDays * day;
    issues[id] = {
      id,
      key: `CAD-${idx + 1}`,
      title: s.title,
      body: s.body,
      status: s.status,
      priority: s.priority,
      assignee: s.assignee,
      labels: s.labels,
      cycleId: s.cycleId,
      parentId: null,
      estimate: s.estimate,
      links: [],
      comments: [],
      createdAt,
      updatedAt: createdAt,
      createdBy: "human",
    };
    issueOrder.push(id);
    if (s.cycleId) {
      const cycle = cycles.find((c) => c.id === s.cycleId);
      cycle?.issueIds.push(id);
    }
  });

  return {
    issues,
    cycles: Object.fromEntries(cycles.map((c) => [c.id, c])),
    labels: Object.fromEntries(labels.map((l) => [l.id, l])),
    members: Object.fromEntries(members.map((m) => [m.id, m])),
    issueOrder,
  };
}

export function seedBoard(): BoardState {
  return buildBoard();
}
