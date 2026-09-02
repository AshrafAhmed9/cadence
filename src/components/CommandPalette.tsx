import { useEffect, useMemo, useState } from "react";
import type { BoardState } from "../shared/types.js";

export function CommandPalette({
  board,
  open,
  onClose,
  onOpenIssue,
}: {
  board: BoardState;
  open: boolean;
  onClose: () => void;
  onOpenIssue: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.toLowerCase();
    return Object.values(board.issues)
      .filter((i) => !q || i.title.toLowerCase().includes(q) || i.key.toLowerCase().includes(q))
      .slice(0, 8);
  }, [board, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  if (!open) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    if (e.key === "ArrowUp") setActiveIndex((i) => Math.max(i - 1, 0));
    if (e.key === "Enter" && results[activeIndex]) {
      onOpenIssue(results[activeIndex].id);
      onClose();
    }
  }

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          autoFocus
          placeholder="Search issues by title or key…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search issues"
        />
        <ul role="listbox">
          {results.map((issue, idx) => (
            <li
              key={issue.id}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                onOpenIssue(issue.id);
                onClose();
              }}
            >
              <span style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 11 }}>{issue.key}</span>{" "}
              {issue.title}
            </li>
          ))}
          {results.length === 0 && <li style={{ color: "var(--text-faint)" }}>No matches</li>}
        </ul>
      </div>
    </>
  );
}
