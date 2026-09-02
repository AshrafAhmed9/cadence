import type { ConfirmRequest } from "../lib/useCadenceTools.js";

export function ConfirmDialog({ request }: { request: ConfirmRequest | null }) {
  if (!request) return null;
  return (
    <div
      className="modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm agent action"
      onKeyDown={(e) => {
        if (e.key === "Escape") request.resolve(false);
      }}
    >
      <div className="modal">
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Your agent wants to:</p>
        <p style={{ fontWeight: 600 }}>{request.message}</p>
        <div className="actions">
          <button onClick={() => request.resolve(false)}>Decline</button>
          <button className="primary" onClick={() => request.resolve(true)} autoFocus>
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
