import type { BoardState, IssueStatus } from "../shared/types.js";
import { IssueCard } from "./IssueCard.js";

const COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "done", label: "Done" },
  { status: "cancelled", label: "Cancelled" },
];

export function Board({
  board,
  statusFilter,
  selectedId,
  checkedIds,
  bulkMode,
  onOpen,
  onCheck,
}: {
  board: BoardState;
  statusFilter: IssueStatus | null;
  selectedId: string | null;
  checkedIds: Set<string>;
  bulkMode: boolean;
  onOpen: (id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
}) {
  const columns = statusFilter ? COLUMNS.filter((c) => c.status === statusFilter) : COLUMNS;
  return (
    <div className="board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))` }}>
      {columns.map((col) => {
        const issues = board.issueOrder
          .map((id) => board.issues[id])
          .filter((i) => i && i.status === col.status);
        return (
          <div className="column" key={col.status}>
            <h3>
              <span>{col.label}</span>
              <span>{issues.length}</span>
            </h3>
            {issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                selected={issue.id === selectedId}
                checked={checkedIds.has(issue.id)}
                showCheckbox={bulkMode}
                onOpen={() => onOpen(issue.id)}
                onCheck={(checked) => onCheck(issue.id, checked)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
