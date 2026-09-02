import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isWebMCPAvailable } from "webmcp-kit";
import type { PermissionScope } from "../cf-foundation/actor.js";
import { createBoardStore } from "../lib/store.js";
import { connectSync, type SyncStatus } from "../lib/sync.js";
import { loadOrCreateIdentity } from "../lib/identity.js";
import { useCadenceTools } from "../lib/useCadenceTools.js";
import { seedBoard } from "../../seed/issues.js";
import { Board } from "./Board.js";
import { IssueDetail } from "./IssueDetail.js";
import { CommandPalette } from "./CommandPalette.js";
import { ActivityFeed } from "./ActivityFeed.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { WebMCPBanner } from "./WebMCPBanner.js";
import { SimulatedAgentPanel } from "./SimulatedAgentPanel.js";
import type { IssueStatus } from "../shared/types.js";
import "./styles.css";

const identity = loadOrCreateIdentity();
const store = createBoardStore(seedBoard());

export function App() {
  const board = useSyncExternalStore(store.subscribe, store.getState);
  const [webMCPAvailable] = useState(isWebMCPAvailable());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [scope, setScope] = useState<PermissionScope>("full");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<IssueStatus | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);

  const agent = useMemo(() => identity.makeAgent(scope), [scope]);

  useEffect(() => {
    const disconnect = connectSync(store, identity.human.userId, identity.human, setSyncStatus, (snapshot) => {
      // The Durable Object seeds itself with the same seed data on first
      // creation (see board-do.ts), so its snapshot is always non-empty —
      // adopt it whenever a connection succeeds, replacing the local seed
      // so every client converges on the one authoritative board.
      store.hydrate(snapshot);
    });
    return disconnect;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        store.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selection = useMemo(
    () => ({
      issueId: selectedIssueId,
      filter: statusFilter ? { status: statusFilter } : null,
      view: "board" as const,
    }),
    [selectedIssueId, statusFilter],
  );

  const { tools, activityLog, confirmRequest, registeredCount } = useCadenceTools(store, agent, selection);

  const bulkMode = statusFilter !== null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">Cadence</span>
        <span style={{ color: "var(--text-faint)" }}>signed in as {identity.human.name}</span>
        <div className="spacer" />
        <label style={{ fontSize: 11, color: "var(--text-dim)" }}>
          Agent grant:{" "}
          <select value={scope} onChange={(e) => setScope(e.target.value as PermissionScope)} aria-label="Agent permission scope">
            <option value="read">read</option>
            <option value="triage">triage</option>
            <option value="write">write</option>
            <option value="full">full</option>
          </select>
        </label>
        <span className={`tool-count${registeredCount > 0 ? " pulse" : ""}`} title="Tools currently registered with document.modelContext">
          {webMCPAvailable ? `${registeredCount} tools live` : "WebMCP unavailable"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>sync: {syncStatus}</span>
        <button onClick={() => setPaletteOpen(true)}>⌘K Search</button>
        <button
          title="Wipe this board back to the seeded starting data. Only affects your own board."
          onClick={async () => {
            if (!confirm("Reset this board back to the seeded starting data? This can't be undone.")) return;
            const res = await fetch(`/api/board/${identity.human.userId}/reset-if-idle`, { method: "POST" });
            const body = await res.json().catch(() => null);
            if (body?.reset) location.reload();
            else alert("Board was touched in the last 2 minutes — try again shortly.");
          }}
        >
          Reset demo data
        </button>
      </header>

      <WebMCPBanner available={webMCPAvailable} />

      <main className="main-column">
        <div className="filter-bar">
          <select
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter((e.target.value || null) as IssueStatus | null)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="backlog">Backlog</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {bulkMode && checkedIds.size > 0 && (
            <span style={{ color: "var(--text-dim)" }}>{checkedIds.size} selected — bulk_update tool is now live</span>
          )}
          <button onClick={() => store.dispatch({ type: "create_issue", payload: { title: "New issue" } }, identity.human, { label: "create issue" })}>
            + New issue
          </button>
        </div>

        <Board
          board={board}
          statusFilter={statusFilter}
          selectedId={selectedIssueId}
          checkedIds={checkedIds}
          bulkMode={bulkMode}
          onOpen={setSelectedIssueId}
          onCheck={(id, checked) =>
            setCheckedIds((prev) => {
              const next = new Set(prev);
              if (checked) next.add(id);
              else next.delete(id);
              return next;
            })
          }
        />
      </main>

      <aside className="sidebar">
        <div className="sidebar-header">
          <span>Agent activity</span>
        </div>
        <ActivityFeed log={activityLog} />
        <SimulatedAgentPanel allTools={tools.all} activityLog={activityLog} />
      </aside>

      {selectedIssueId && (
        <IssueDetail board={board} issueId={selectedIssueId} store={store} human={identity.human} onClose={() => setSelectedIssueId(null)} />
      )}

      <CommandPalette board={board} open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenIssue={setSelectedIssueId} />
      <ConfirmDialog request={confirmRequest} />
    </div>
  );
}
