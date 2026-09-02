# Security & trust model

Cadence registers ~24 [WebMCP](https://github.com/webmachinelearning/webmcp) tools with `document.modelContext`. This document states what those tools can and cannot do, and why.

## Threat model

The primary risk in any tool-exposing web app is **prompt injection**: content an attacker controls (an issue title, a comment body) reaching the calling agent as if it were a trusted instruction, or a tool being used to exfiltrate data the agent shouldn't have access to.

## What the tool surface does not expose

- **No network egress.** No tool makes an outbound request to anything other than this app's own Durable Object. There is nothing for a tool to exfiltrate data *to*.
- **No arbitrary code execution.** Every tool is a fixed, named operation with a JSON-Schema-validated input. There is no `eval`, no free-form query language, no way to pass code as data.
- **User content never renders as markup.** Issue titles, bodies, and comments are rendered as plain text (React's default escaping; nothing uses `dangerouslySetInnerHTML`). Text an attacker plants in an issue body cannot become live HTML, script, or a link the agent would treat as a navigable/privileged instruction.
- **Consequential actions require a human in the loop.** `merge_duplicates`, `split_issue`, and `bulk_update` are wrapped with `withConfirmation` (see `webmcp-kit`). The mutation does not run until a human clicks "Approve" in a dialog naming exactly what will happen. An agent cannot merge, split, or bulk-edit anything unattended.
- **Every mutation is attributed.** All writes carry an `actor` (human or a specific named agent) and are appended to a hash-chained audit log server-side (`appendAuditRecord`, vendored from the shared `cf-foundation` helpers in `src/cf-foundation/`). A compromised or misbehaving agent's actions are fully traceable and undoable (`Cmd+Z`, shared with the human's own undo stack).
- **Tool exposure is permission-scoped.** An agent's grant (`read` / `triage` / `write` / `full`) determines which tools it ever sees via `resolveToolNames`. A `read`-scoped agent's `document.modelContext.registerTool` calls never even include `bulk_update` or `merge_duplicates`. This is enforced before registration, not by the tool refusing at call time.

## What is out of scope for this pass

- Full input sanitization against extremely large payloads (a DoS concern, not a correctness one, for a hackathon-scale deployment).
- Rate limiting on the Durable Object's WebSocket endpoint.
- Real authentication (see README's "Known limitations"). Identity is a local, unauthenticated demo id, so the permission model is real and enforced, but not yet backed by verified human identity.

Found an issue? This is a hackathon submission without a dedicated security contact; please open a GitHub issue.
