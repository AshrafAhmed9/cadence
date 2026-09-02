import type { AgentActor, HumanActor, PermissionScope } from "../cf-foundation/actor.js";

/**
 * Demo identity, not real auth: assigns a stable human id/name via
 * localStorage so every judge lands on a populated board with zero signup,
 * and derives one agent identity bound to that human. Full passkey auth
 * (planned) is out of scope for this pass — see README's "Known
 * limitations" section. The permission-grant mechanism this feeds
 * (`resolveToolNames`) is real and fully wired regardless.
 */
const STORAGE_KEY = "cadence.identity.v1";

const ADJECTIVES = ["Amber", "Cedar", "Quiet", "Bright", "Nimble", "Coral"];
const ANIMALS = ["Falcon", "Otter", "Heron", "Lynx", "Sparrow", "Fox"];

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${b}`;
}

export function loadOrCreateIdentity(): { human: HumanActor; makeAgent: (scope: PermissionScope) => AgentActor } {
  let raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  let parsed: { userId: string; name: string } | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    parsed = { userId: crypto.randomUUID(), name: randomName() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // storage unavailable (private mode, etc.) — identity just won't persist across reloads
    }
  }
  const human: HumanActor = { kind: "human", userId: parsed.userId, name: parsed.name };
  const makeAgent = (scope: PermissionScope): AgentActor => ({
    kind: "agent",
    agentId: `agent_${human.userId}`,
    name: `${human.name}'s Agent`,
    ownerUserId: human.userId,
    grant: { scope },
  });
  return { human, makeAgent };
}
