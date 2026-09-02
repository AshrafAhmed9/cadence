# Cadence

An issue tracker where an agent is a real teammate on the board, not a chatbot bolted onto the side of one.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/). Cadence registers its tools with [`document.modelContext`](https://github.com/webmachinelearning/webmcp), so any WebMCP-aware agent (ChatGPT's in-app browser, Chrome with the WebMCP flag) can triage the backlog, dedupe issues, split epics, and re-prioritize a sprint. It does this through the same functions the UI itself calls, attributed under its own identity, gated by its own permission grant.

**Live:** [cadence-webmcp.ashrafahmed1232.workers.dev](https://cadence-webmcp.ashrafahmed1232.workers.dev)

## Try it

```js
document.modelContext.registerTool({
  name: "search_issues",
  description: "Search issues by title and body text.",
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  execute: async ({ query }) => ({ content: [{ type: "text", text: JSON.stringify(searchIssuesInStore(query)) }] }),
});
```
*(Simplified. The real registration goes through [`webmcp-kit`](https://github.com/AshrafAhmed9/webmcp-kit)'s `defineTool`/`registerTools`, see below.)*

Open the deployed URL in ChatGPT's in-app browser, or in Chrome with `chrome://flags/#enable-webmcp-testing` enabled, and ask your agent to triage the backlog, find and merge duplicate issues, or summarize the current cycle. In any other browser, the **Simulated Agent** panel in the sidebar runs the same three scripts against the same underlying functions.

## Why this is a strong fit for WebMCP

A server-side MCP tool wrapping a REST API can list issues and file new ones. It cannot:

- **See what the human currently has selected, and change its own tool set accordingly.** Select an issue and `add_comment`, `split_issue`, and friends appear. Apply a status filter and `bulk_update` appears. Nothing is registered until it's relevant, which you can check live via the tool-count indicator in the top bar and in Chrome's Model Context Tool Inspector.
- **Land on the same undo stack as the human.** An agent's edit is undone with the human's own `Cmd+Z`, because both write through the identical `reduce()` function against the identical local state. They aren't two code paths that happen to converge; they're one.
- **Be scoped per-agent, live.** The "Agent grant" selector in the top bar changes a real permission grant (`read`/`triage`/`write`/`full`), and `resolveToolNames` filters which tools that agent's `registerTool` calls even include. Switch to `read` and watch `bulk_update` disappear from the registered set entirely, not just refuse when called.

## How it improves the experience

Triaging a backlog, finding duplicates across a hundred loosely-worded tickets, and re-prioritizing a sprint: these are exactly the tasks a person finds tedious and an agent finds tractable, but only if it can act with real authority inside the tool, not by clicking through a UI it's guessing at. Cadence's higher-order tools (`triage_inbox`, `find_duplicates`, `estimate_and_rank`) do real analysis against real board state. The confirmation gate on `merge_duplicates`/`split_issue`/`bulk_update` means the agent can *propose* consequential changes without being trusted to make them unattended.

## Benchmark

[`benchmark/`](./benchmark) compares calling Cadence's tools directly against driving the same actions through its actual UI with Playwright, no LLM involved on either side. A single-item action costs about the same either way; a 7-item bulk task is roughly 3x faster over tool calls, because the DOM path re-pays a fixed per-item navigation cost that a tool call doesn't. Full methodology and honest limitations (small sample, no model in the loop) are in the benchmark's own README.

## Tools

26 tools total, filtered per the active agent's permission grant before they're ever registered.

| Tool | Kind | What it does |
|---|---|---|
| `list_issues` | read | Filter issues by status, assignee, priority, labels, cycle |
| `get_issue` | read | Full detail for one issue, including comments and links |
| `search_issues` | read | Text search across title and body |
| `get_board_state` | read | Column counts, active filters, current view |
| `get_current_selection` | read | What the human has selected right now |
| `list_labels` / `list_cycles` | read | Available labels / cycles |
| `get_activity` | read | Recent tool-call activity with actor attribution |
| `triage_inbox` | read | Untriaged issues with a suggested priority each |
| `find_duplicates` | read | Likely-duplicate clusters by title/body similarity |
| `summarize_cycle` | read | Cycle scope, progress, at-risk and blocked items |
| `estimate_and_rank` | read | Proposed priority ordering, with reasoning |
| `create_issue` / `update_issue` | write | Create an issue / edit title or body |
| `set_status` / `set_priority` / `assign` | write | Change status, priority, or assignee |
| `add_label` / `remove_label` | write | Edit labels |
| `add_comment` | write | Comment under the caller's own identity |
| `link_issues` | write | `blocks` / `blocked_by` / `relates_to` / `duplicate_of` |
| `move_to_cycle` / `set_estimate` | write | Move into a cycle / set story points |
| `merge_duplicates` | write, confirmation-gated | Merge a cluster into one issue |
| `split_issue` | write, confirmation-gated | One issue → parent plus sub-issues |
| `bulk_update` | write, confirmation-gated | Patch many issues at once |

## Architecture

- **`src/shared/reducer.ts`**: the one place board mutations are defined, as pure `(state, actor, action) → state` functions. Shared by the client store, the Durable Object, and every WebMCP tool handler.
- **`src/tools/`**: tool definitions built on [`webmcp-kit`](https://github.com/AshrafAhmed9/webmcp-kit)'s `defineTool`. Each tool's `handler` is a plain function; `webmcp-kit` is the only place that knows about the `{ content: [...] }` WebMCP result shape.
- **`src/lib/useCadenceTools.ts`**: registers tool sets dynamically via `useScopedTools`, filtered per the active agent's permission grant.
- **`src/worker/`**: a Cloudflare Worker + Durable Object (`SyncedDurableObject`, vendored in `src/cf-foundation/`) holding authoritative board state, broadcasting live over WebSocket, and appending every mutation to a hash-chained audit log.
- **`seed/issues.ts`**: deliberately messy seed data (real duplicate reports, vague untriaged titles) so the higher-order tools have genuine work to do, not a tidy board with nothing to fix.

## Known limitations

- **Auth is a local demo identity, not real passkey authentication.** A stable id/name pair is generated and stored in `localStorage` so every visitor lands on a populated board with zero signup. The permission-grant mechanism it feeds (`resolveToolNames`, filtering which tools an agent's grant unlocks) is fully real and enforced. It just isn't backed by verified human identity yet.
- **Undo is best-effort for additive actions.** Comments, labels, and links are treated as non-undoable in this pass (Cmd+Z is a safe no-op for them) rather than risk corrupting state. Status/priority/assignee/estimate/cycle changes, including `bulk_update`, undo correctly per-issue.
- **Accessibility.** Full keyboard operability is in place (command palette, all mutating actions reachable without a mouse), but a full WCAG 2.2 AA screen-reader pass hasn't happened yet.

## Development

```bash
npm install
npm run dev        # Vite dev server, client-only (no live sync)
npm run worker:dev # wrangler dev, for the Durable Object backend
npm run build
npm run deploy     # wrangler deploy
```

## License

MIT. See [LICENSE](./LICENSE).
