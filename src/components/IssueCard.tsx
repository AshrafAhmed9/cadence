import type { Issue } from "../shared/types.js";

const PRIORITY_LABEL: Record<Issue["priority"], string> = {
  none: "",
  low: "low",
  medium: "med",
  high: "high",
  urgent: "urgent",
};

export function IssueCard({
  issue,
  selected,
  checked,
  onOpen,
  onCheck,
  showCheckbox,
}: {
  issue: Issue;
  selected: boolean;
  checked: boolean;
  onOpen: () => void;
  onCheck: (checked: boolean) => void;
  showCheckbox: boolean;
}) {
  return (
    <div
      className={`issue-card${selected ? " selected" : ""}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`${issue.key}: ${issue.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="key">{issue.key}</span>
        {showCheckbox && (
          <input
            type="checkbox"
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onCheck(e.target.checked)}
            aria-label={`Select ${issue.key} for bulk update`}
          />
        )}
      </div>
      <div className="title">{issue.title}</div>
      <div className="meta">
        {issue.priority !== "none" && <span className={`badge priority-${issue.priority}`}>{PRIORITY_LABEL[issue.priority]}</span>}
        {issue.estimate !== null && <span className="badge">{issue.estimate} pts</span>}
        {issue.createdBy === "agent" && <span className="provenance-chip agent">agent-created</span>}
      </div>
    </div>
  );
}
