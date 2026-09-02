import { useState } from "react";
import type { ActivityLog, DefinedTool } from "webmcp-kit";

function findTool(tools: DefinedTool<any, any>[], name: string): DefinedTool<any, any> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Simulated agent script references unknown tool "${name}"`);
  return tool;
}

async function runLogged(tools: DefinedTool<any, any>[], log: ActivityLog, name: string, input: unknown) {
  const tool = findTool(tools, name);
  const start = performance.now();
  try {
    const output = await tool.call(input as never);
    log.log({ toolName: name, input, output, actor: "agent", durationMs: performance.now() - start });
    return output;
  } catch (err) {
    log.log({ toolName: name, input, output: undefined, error: err instanceof Error ? err.message : String(err), actor: "agent", durationMs: performance.now() - start });
    throw err;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the exact same tool functions a real WebMCP agent would call —
 * `tool.call(input)`, not a separate mock implementation — so this panel
 * proves the app is fully usable without WebMCP, using code that can't
 * drift from what the real integration does.
 */
export function SimulatedAgentPanel({
  allTools,
  activityLog,
}: {
  allTools: DefinedTool<any, any>[];
  activityLog: ActivityLog;
}) {
  const [running, setRunning] = useState<string | null>(null);

  async function runTriage() {
    setRunning("triage");
    try {
      const untriaged = (await runLogged(allTools, activityLog, "triage_inbox", {})) as { id: string; suggestedPriority: string }[];
      for (const item of untriaged) {
        await delay(400);
        await runLogged(allTools, activityLog, "set_priority", { id: item.id, priority: item.suggestedPriority });
      }
    } finally {
      setRunning(null);
    }
  }

  async function runDedupe() {
    setRunning("dedupe");
    try {
      const clusters = (await runLogged(allTools, activityLog, "find_duplicates", {})) as { issueIds: string[] }[];
      for (const cluster of clusters) {
        await delay(400);
        await runLogged(allTools, activityLog, "merge_duplicates", {
          primaryId: cluster.issueIds[0],
          duplicateIds: cluster.issueIds.slice(1),
        });
      }
    } finally {
      setRunning(null);
    }
  }

  async function runCycleSummary() {
    setRunning("cycle");
    try {
      const cycles = (await runLogged(allTools, activityLog, "list_cycles", {})) as { id: string; name: string }[];
      const current = cycles.find((c) => c.name.toLowerCase().includes("13")) ?? cycles[0];
      if (current) {
        await delay(300);
        await runLogged(allTools, activityLog, "summarize_cycle", { cycleId: current.id });
      }
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="simulated-agent">
      <h4>Simulated agent (works without WebMCP)</h4>
      <button disabled={running !== null} onClick={runTriage}>
        {running === "triage" ? "Triaging…" : "Triage the backlog"}
      </button>
      <button disabled={running !== null} onClick={runDedupe}>
        {running === "dedupe" ? "Finding duplicates…" : "Find & merge duplicates"}
      </button>
      <button disabled={running !== null} onClick={runCycleSummary}>
        {running === "cycle" ? "Summarizing…" : "Summarize current cycle"}
      </button>
    </div>
  );
}
