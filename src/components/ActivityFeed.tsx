import { useEffect, useState } from "react";
import type { ActivityEntry, ActivityLog } from "webmcp-kit";

export function ActivityFeed({ log }: { log: ActivityLog }) {
  const [entries, setEntries] = useState<ActivityEntry[]>(() => log.getAll());

  useEffect(() => log.subscribe((_e, all) => setEntries(all)), [log]);

  return (
    <div className="activity-feed" aria-live="polite" aria-label="Agent activity feed">
      {entries.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 12 }}>No tool calls yet. Ask your agent to do something on this board.</p>}
      {entries.map((e) => (
        <div key={e.id} className={`activity-entry ${e.actor}${e.error ? " error" : ""}`}>
          <div>
            <span className="tool-name">{e.toolName}</span>
            <span style={{ color: "var(--text-faint)" }}> · {e.actor} · {Math.round(e.durationMs)}ms</span>
          </div>
          {e.error ? (
            <div className="error-text">{e.error}</div>
          ) : (
            <div style={{ color: "var(--text-dim)", marginTop: 2, wordBreak: "break-word" }}>
              {truncate(JSON.stringify(e.input))} → {truncate(JSON.stringify(e.output))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function truncate(s: string, max = 90): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
