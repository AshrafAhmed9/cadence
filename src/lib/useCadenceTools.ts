import { useMemo, useRef, useState } from "react";
import type { Actor } from "../cf-foundation/actor.js";
import { resolveToolNames } from "../cf-foundation/actor.js";
import { createActivityLog, type DefinedTool, type ConfirmFn } from "@ashraf009/webmcp-kit";
import { useScopedTools } from "@ashraf009/webmcp-kit/react";
import type { BoardStore } from "./store.js";
import { createCadenceTools, type Selection } from "../tools/index.js";
import { CADENCE_TOOL_SCOPES } from "../shared/tool-scopes.js";

export type ConfirmRequest = { message: string; resolve: (approved: boolean) => void };

/**
 * Owns the app's live tool surface. Registers board-level tools for the
 * lifetime of the page, and issue/filter-scoped tools only while a
 * selection or active filter makes them relevant — the `toolchange` event
 * this produces (via webmcp-kit's `useScopedTools`) is the clearest
 * on-camera proof that WebMCP's tool set is a function of live page state,
 * not a static list a server-side MCP server could hand out once.
 *
 * The registered set is also filtered per the acting agent's permission
 * grant (`resolveToolNames`), so a read-only agent never even sees
 * `bulk_update` in its tool list.
 */
export function useCadenceTools(store: BoardStore, agent: Actor, selection: Selection) {
  const activityLog = useMemo(() => createActivityLog(), []);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirmRef = useRef<(message: string) => Promise<boolean>>(async (message) => {
    return new Promise((resolve) => setConfirmRequest({ message, resolve: (v) => { setConfirmRequest(null); resolve(v); } }));
  });

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const tools = useMemo(
    () =>
      createCadenceTools({
        store,
        actor: agent,
        getSelection: () => selectionRef.current,
        activityLog,
        confirmations: {
          confirmMerge: ((input: { primaryId: string; duplicateIds: string[] }) =>
            confirmRef.current(`Merge ${input.duplicateIds.length} duplicate(s) into ${input.primaryId}?`)) as unknown as ConfirmFn<any>,
          confirmSplit: ((input: { subtitles: string[] }) =>
            confirmRef.current(`Split into ${input.subtitles.length} sub-issue(s)?`)) as unknown as ConfirmFn<any>,
          confirmBulk: ((input: { ids: string[] }) =>
            confirmRef.current(`Apply this change to ${input.ids.length} issue(s)?`)) as unknown as ConfirmFn<any>,
        },
      }),
    [store, agent, activityLog],
  );

  const allowed = useMemo(() => new Set(resolveToolNames(CADENCE_TOOL_SCOPES, agent)), [agent]);
  const filterAllowed = (list: DefinedTool<any, any>[]) => list.filter((t) => allowed.has(t.name));

  const onInvoke = (entry: { toolName: string; input: unknown; output: unknown; error?: string; durationMs: number }) => {
    activityLog.log({ ...entry, actor: agent.kind });
  };

  // Board-level tools: registered for the lifetime of the page.
  useScopedTools(true, () => filterAllowed([...tools.read, ...tools.activity, tools.write.find((t) => t.name === "create_issue")!, ...tools.higherOrder]), { onInvoke }, [tools]);

  // Issue-scoped tools: only while an issue is open.
  useScopedTools(
    selection.issueId !== null,
    () => filterAllowed(tools.write.filter((t) => t.name !== "create_issue")),
    { onInvoke },
    [tools, selection.issueId],
  );

  // Filter/selection-scoped tools: bulk_update only appears once a filter narrows the board.
  useScopedTools(
    selection.filter !== null,
    () => filterAllowed(tools.higherOrder.filter((t) => t.name === "bulk_update")),
    { onInvoke },
    [tools, selection.filter],
  );

  const boardLevelAllowed = filterAllowed([...tools.read, ...tools.activity, tools.write.find((t) => t.name === "create_issue")!, ...tools.higherOrder]).length;
  const issueScopedAllowed = selection.issueId !== null ? filterAllowed(tools.write.filter((t) => t.name !== "create_issue")).length : 0;
  const filterScopedAllowed = selection.filter !== null ? filterAllowed(tools.higherOrder.filter((t) => t.name === "bulk_update")).length : 0;
  const registeredCount = boardLevelAllowed + issueScopedAllowed + filterScopedAllowed;

  return { tools, activityLog, confirmRequest, registeredCount };
}
