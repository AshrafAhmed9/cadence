// WebMCP-tool-call vs DOM-interaction benchmark, run against the live
// deployed Cadence app. No LLM involved on either side — this measures the
// mechanical cost of each interface (round trips, wall-clock time), not
// model reasoning quality. See README.md in this directory for why, and
// what this does and doesn't prove.
import { chromium } from "playwright";
import WebSocket from "ws";
import { readFileSync } from "node:fs";

const HOST = "cadence-webmcp.ashrafahmed1232.workers.dev";
const RESET_KEY = process.env.RESET_KEY;
if (!RESET_KEY) {
  console.error("Set RESET_KEY before running this.");
  process.exit(1);
}

function boardIdFor(taskId) {
  return `bench-${taskId}`;
}

async function resetBoard(boardId) {
  const res = await fetch(`https://${HOST}/api/board/${boardId}/reset`, {
    method: "POST",
    headers: { "x-reset-key": RESET_KEY },
  });
  if (!res.ok) throw new Error(`reset failed: ${res.status}`);
}

// --- Tool-call path: same message shape src/lib/sync.ts sends when a
// dispatched action fires, i.e. exactly what happens when a WebMCP tool's
// handler calls store.dispatch(). No mock — this is the real DO endpoint.
class ToolClient {
  constructor(boardId) {
    this.boardId = boardId;
    this.calls = 0;
    this.snapshot = null;
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://${HOST}/api/board/${this.boardId}`);
      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "snapshot") {
          this.snapshot = msg.payload;
          resolve();
        }
      });
      this.ws.on("error", reject);
    });
  }
  // One "tool call" = one dispatched action over the wire. None of the
  // tasks below read state between calls in the same loop, so there's no
  // need to wait for a server ack before sending the next one.
  async call(type, payload) {
    this.calls++;
    this.ws.send(JSON.stringify({ type, payload, actor: { kind: "agent", agentId: "bench-agent", name: "Bench Agent", ownerUserId: "bench", grant: { scope: "full" } }, timestamp: Date.now() }));
  }
  close() {
    this.ws.close();
  }
  // Polls a fresh snapshot until `predicate` is true, so the timed span
  // covers real end-to-end completion (write landed in the Durable
  // Object's storage), not just "the message was sent."
  async waitUntil(predicate, { timeoutMs = 10000, intervalMs = 40 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const snap = await refreshSnapshot(this);
      if (predicate(snap)) return snap;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("waitUntil timed out");
  }
}

async function refreshSnapshot(client) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://${HOST}/api/board/${client.boardId}`);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "snapshot") {
        ws.close();
        resolve(msg.payload);
      }
    });
  });
}

// --- Task definitions -------------------------------------------------

const tasks = [
  {
    id: "set-priority",
    name: "Set one issue's priority to high",
    domSteps: 5, // open search, type query, click result, select priority, close
    async tool(client, state) {
      const issue = Object.values(state.issues)[0];
      await client.call("set_priority", { id: issue.id, priority: "high" });
      await client.waitUntil((s) => s.issues[issue.id]?.priority === "high");
    },
    async dom(page) {
      await page.getByRole("button", { name: /Search/ }).click();
      await page.getByLabel("Search issues").fill("Login fails");
      await page.getByRole("dialog", { name: "Command palette" }).getByRole("option").first().click();
      await page.locator("#priority-select").selectOption("high");
      await page.getByLabel("Close issue detail").click();
    },
  },
  {
    id: "add-comment",
    name: "Add a comment to one issue",
    domSteps: 6, // open search, type query, click result, fill comment, press enter, close
    async tool(client, state) {
      const issue = Object.values(state.issues)[0];
      await client.call("add_comment", { id: issue.id, body: "Looking into this now." });
      await client.waitUntil((s) => s.issues[issue.id]?.comments.length > 0);
    },
    async dom(page) {
      await page.getByRole("button", { name: /Search/ }).click();
      await page.getByLabel("Search issues").fill("Login fails");
      await page.getByRole("dialog", { name: "Command palette" }).getByRole("option").first().click();
      await page.getByPlaceholder("Add a comment…").fill("Looking into this now.");
      await page.getByPlaceholder("Add a comment…").press("Enter");
      await page.getByLabel("Close issue detail").click();
    },
  },
  {
    id: "triage-backlog",
    name: "Set priority=medium on every untriaged backlog issue",
    domSteps: 7 * 5, // 5 DOM steps per matching issue (see set-priority), 7 issues in the seed
    async tool(client, state) {
      const targets = Object.values(state.issues).filter((i) => i.status === "backlog" && i.priority === "none");
      for (const issue of targets) {
        await client.call("set_priority", { id: issue.id, priority: "medium" });
      }
      await client.waitUntil((s) => targets.every((t) => s.issues[t.id]?.priority === "medium"));
      return targets.length;
    },
    async dom(page) {
      // The app doesn't expose board state to window, so drive the search
      // palette per issue using the known, fixed seed titles instead.
      const seed = JSON.parse(readFileSync(new URL("./seed-backlog-titles.json", import.meta.url)));
      for (const title of seed) {
        await page.getByRole("button", { name: /Search/ }).click();
        await page.getByLabel("Search issues").fill(title);
        const option = page.getByRole("dialog", { name: "Command palette" }).getByRole("option").first();
        if (await option.count()) {
          await option.click();
          await page.locator("#priority-select").selectOption("medium");
          await page.getByLabel("Close issue detail").click();
        } else {
          await page.keyboard.press("Escape");
        }
      }
      return seed.length;
    },
  },
];

async function timeIt(fn) {
  const start = Date.now();
  const result = await fn();
  return { ms: Date.now() - start, result };
}

async function runTask(task) {
  const results = { task: task.id, name: task.name };

  // Tool-call path
  {
    const boardId = boardIdFor(`${task.id}-tool`);
    await resetBoard(boardId);
    const client = new ToolClient(boardId);
    await client.connect(); // connection + initial snapshot, not timed — matches DOM path not timing page load
    const { ms } = await timeIt(() => task.tool(client, client.snapshot));
    results.tool = { ms, calls: client.calls };
    client.close();
  }

  // DOM path
  {
    const boardId = boardIdFor(`${task.id}-dom`);
    await resetBoard(boardId);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.addInitScript((id) => {
      localStorage.setItem("cadence.identity.v1", JSON.stringify({ userId: id, name: "Bench Bot" }));
    }, boardId);
    await page.goto(`https://${HOST}/`);
    await page.waitForSelector(".board", { timeout: 15000 });
    const { ms } = await timeIt(() => task.dom(page));
    results.dom = { ms, steps: task.domSteps };
    await browser.close();
  }

  return results;
}

const allResults = [];
for (const task of tasks) {
  console.log(`Running: ${task.name}`);
  const r = await runTask(task);
  console.log(JSON.stringify(r, null, 2));
  allResults.push(r);
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(allResults, null, 2));
