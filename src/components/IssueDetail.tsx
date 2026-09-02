import { useState } from "react";
import type { Actor } from "../cf-foundation/actor.js";
import type { BoardState, IssuePriority, IssueStatus } from "../shared/types.js";
import type { BoardStore } from "../lib/store.js";

const STATUSES: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"];
const PRIORITIES: IssuePriority[] = ["none", "low", "medium", "high", "urgent"];

export function IssueDetail({
  board,
  issueId,
  store,
  human,
  onClose,
}: {
  board: BoardState;
  issueId: string;
  store: BoardStore;
  human: Actor;
  onClose: () => void;
}) {
  const issue = board.issues[issueId];
  const [commentText, setCommentText] = useState("");
  if (!issue) return null;

  return (
    <aside className="detail-panel" role="dialog" aria-label={`Issue ${issue.key}`}>
      <button onClick={onClose} aria-label="Close issue detail">✕ Close</button>
      <h2>
        <span style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 13 }}>{issue.key}</span>
        <br />
        {issue.title}
      </h2>
      <span className={`provenance-chip ${issue.createdBy}`}>created by {issue.createdBy === "agent" ? "your agent" : "you"}</span>

      <div className="field-row">
        <label htmlFor="status-select">Status</label>
        <select
          id="status-select"
          value={issue.status}
          onChange={(e) => store.dispatch({ type: "set_status", payload: { id: issue.id, status: e.target.value as IssueStatus } }, human, { label: "set status" })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label htmlFor="priority-select">Priority</label>
        <select
          id="priority-select"
          value={issue.priority}
          onChange={(e) => store.dispatch({ type: "set_priority", payload: { id: issue.id, priority: e.target.value as IssuePriority } }, human, { label: "set priority" })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label htmlFor="estimate-input">Estimate</label>
        <input
          id="estimate-input"
          type="number"
          value={issue.estimate ?? ""}
          style={{ width: 70 }}
          onChange={(e) =>
            store.dispatch(
              { type: "set_estimate", payload: { id: issue.id, estimate: e.target.value === "" ? null : Number(e.target.value) } },
              human,
              { label: "set estimate" },
            )
          }
        />
      </div>

      <p style={{ color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{issue.body}</p>

      {issue.labels.length > 0 && (
        <div className="meta" style={{ marginBottom: 12 }}>
          {issue.labels.map((l) => (
            <span key={l} className="badge">{board.labels[l]?.name ?? l}</span>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 12, color: "var(--text-dim)" }}>Comments</h3>
      {issue.comments.map((c) => (
        <div className="comment" key={c.id}>
          <div className="author">
            {c.author}
            <span className={`provenance-chip ${c.authorKind}`}>{c.authorKind}</span>
          </div>
          <div>{c.body}</div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <input
          style={{ flex: 1 }}
          placeholder="Add a comment…"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && commentText.trim()) {
              store.dispatch({ type: "add_comment", payload: { id: issue.id, body: commentText.trim() } }, human, { label: "comment" });
              setCommentText("");
            }
          }}
        />
      </div>
    </aside>
  );
}
