/**
 * Every mutation in every app is attributed to an Actor — a human or an
 * agent acting on a human's behalf. Agents are first-class workspace
 * members with their own identity and a permission grant, never an
 * anonymous caller impersonating their human.
 */

export interface HumanActor {
  kind: "human";
  userId: string;
  name: string;
}

export interface AgentActor {
  kind: "agent";
  agentId: string;
  name: string;
  /** The human who authorized this agent to act. */
  ownerUserId: string;
  grant: PermissionGrant;
}

export type Actor = HumanActor | AgentActor;

/**
 * Permission scopes, ordered least to most capable. A grant of "triage"
 * implies "read"; "write" implies "triage" and "read"; "full" implies all
 * of the above plus irreversible/consequential actions.
 */
export type PermissionScope = "read" | "triage" | "write" | "full";

const SCOPE_RANK: Record<PermissionScope, number> = {
  read: 0,
  triage: 1,
  write: 2,
  full: 3,
};

export interface PermissionGrant {
  scope: PermissionScope;
  /** Optional explicit deny-list of tool names, even if scope would otherwise allow them. */
  deniedTools?: readonly string[];
}

/**
 * A registry mapping tool name -> minimum scope required to call it. Each
 * app declares one; `resolveToolNames` and `isToolAllowed` use it to decide
 * which tools an actor's `document.modelContext.registerTool` calls should
 * include. This is what makes the registered tool set differ per viewer —
 * a static server-side MCP tool list cannot do this.
 */
export type ToolScopeRegistry = Record<string, PermissionScope>;

export function isToolAllowed(
  toolName: string,
  registry: ToolScopeRegistry,
  actor: Actor,
): boolean {
  if (actor.kind === "human") return true;
  const required = registry[toolName];
  if (required === undefined) return false; // unknown tools are denied by default
  if (actor.grant.deniedTools?.includes(toolName)) return false;
  return SCOPE_RANK[actor.grant.scope] >= SCOPE_RANK[required];
}

export function resolveToolNames(registry: ToolScopeRegistry, actor: Actor): string[] {
  return Object.keys(registry).filter((name) => isToolAllowed(name, registry, actor));
}
