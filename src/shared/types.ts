export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
export type IssuePriority = "none" | "low" | "medium" | "high" | "urgent";
export type LinkType = "blocks" | "blocked_by" | "relates_to" | "duplicate_of";
export type ActorKind = "human" | "agent";

export interface IssueLink {
  type: LinkType;
  issueId: string;
}

export interface Comment {
  id: string;
  author: string;
  authorKind: ActorKind;
  body: string;
  createdAt: number;
}

export interface Issue {
  id: string;
  key: string; // "CAD-142"
  title: string;
  body: string; // markdown source, always rendered as text — never as HTML
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string | null;
  labels: string[];
  cycleId: string | null;
  parentId: string | null;
  estimate: number | null;
  links: IssueLink[];
  comments: Comment[];
  createdAt: number;
  updatedAt: number;
  createdBy: ActorKind;
}

export interface Cycle {
  id: string;
  name: string;
  startsAt: number;
  endsAt: number;
  issueIds: string[];
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Member {
  id: string;
  name: string;
  kind: ActorKind;
  avatarColor: string;
  ownerUserId?: string; // set when kind === "agent"
}

export interface BoardState {
  issues: Record<string, Issue>;
  cycles: Record<string, Cycle>;
  labels: Record<string, Label>;
  members: Record<string, Member>;
  issueOrder: string[]; // stable display order
}

export function nextIssueKey(existing: Issue[]): string {
  const max = existing.reduce((m, i) => {
    const n = Number(i.key.split("-")[1] ?? 0);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `CAD-${max + 1}`;
}
