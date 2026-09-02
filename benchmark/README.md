# WebMCP tool calls vs. DOM interaction: a small, honest benchmark

This measures the mechanical cost of two ways to operate the live, deployed
[Cadence](https://cadence-webmcp.ashrafahmed1232.workers.dev) app: calling its
WebMCP tools directly over the wire, versus driving the same actions through
its actual UI with Playwright.

## What this is not

**There is no LLM in this benchmark.** Both paths are scripted and
deterministic. This does not measure agent reasoning quality, task
success rate under ambiguity, or real-world token/cost economics: those
require a real model in the loop, which costs money to run
([WindTunnel](https://github.com/nekuda-ai/WindTunnel) does this properly,
at real API cost, across many models). This benchmark exists specifically
because it's free and reproducible without a key: it isolates one narrower
question (how many discrete interactions and how much wall-clock time does
each interface need to get the same task done, mechanically) from the much
harder and more expensive question of how well an agent decides what to do.

## Method

Three fixed tasks, run against the same live Cloudflare Durable Object
(a fresh `bench-<task>-<path>` board id, reset to seed state before each
run), once per interface:

- **Tool-call path**: a WebSocket client sends the exact same
  `{type, payload, actor, timestamp}` message shape Cadence's own
  `src/lib/sync.ts` sends when a real tool's handler calls
  `store.dispatch()`. Not a mock. This hits the real Durable Object's
  `applyPatch`. Timing starts after the initial connection/snapshot (so
  connection setup isn't counted, matching the DOM path not counting page
  load) and ends when a fresh snapshot confirms the write actually landed.
- **DOM path**: Playwright opens the real deployed URL and drives the actual
  UI (click search, type a query, click the result, operate the real
  `<select>`/`<input>` elements, close the panel) using the same selectors
  a real user would interact with (`aria-label`s, `role`s, `placeholder`s).

Run it yourself from this directory: `npm install`, then
`RESET_KEY=<the worker's reset secret> node run.mjs`. The reset secret is
admin-only (it's not the same thing an attacker could extract from the
client bundle) so this isn't runnable by a stranger without it.

## Results (median of 3 runs, 2 Sep 2026)

| Task | Tool calls | Tool-path ms | DOM steps | DOM-path ms |
|---|---:|---:|---:|---:|
| Set one issue's priority | 1 | ~128 | 5 | ~123 |
| Add one comment | 1 | ~133 | 6 | ~84 |
| Triage 7 backlog issues (bulk) | 7 | ~128 | 35 | ~385 |

## What this actually shows

For a single, one-shot action, the two interfaces are roughly comparable in
wall-clock time on this measure, unsurprising since one WebSocket message
and one button click aren't meaningfully different costs on the same
machine. **The gap opens specifically as task complexity grows.** Triaging
7 issues is 7 tool calls either way, but the DOM path needs 5 real UI
interactions per issue (open search, type, click, select, close) versus one
message per issue for the tool path. That's a fixed per-item multiplier
(5 DOM steps for every 1 tool call in this task set), and it shows up
directly in wall-clock time: ~385ms vs. ~128ms, a real and consistent
~3x, not a rounding artifact: the three runs landed within about
±5ms of each other.

The honest interpretation: WebMCP's advantage here isn't raw speed on a
single action, it's that a tool call doesn't re-pay the UI's per-action
navigation cost on every item. An agent (or a person) using named tools
does one dispatch per unit of work; an agent driving the DOM re-does the
same multi-step navigation dance every single time, because the DOM has no
concept of "the operation," only "the elements you'd click to cause it."
That gap should be expected to widen, not narrow, on any UI with more than
one step per action, which describes most real applications, not just
this one.

## Limitations, stated plainly

- n=1 task type repeated 3 times, not a statistically powered sample.
- Both paths ran from the same machine against the same live Cloudflare
  edge, so absolute numbers reflect this specific network path, not a
  general claim about latency everywhere.
- No LLM means no measurement of what actually matters most in practice:
  whether an agent can figure out *what* to click/call in the first place.
  A DOM-driving agent also has to parse the rendered page to find
  selectors; a tool-calling agent reads a schema. That asymmetry, which is
  arguably the bigger real-world advantage, isn't captured by this
  mechanical benchmark at all.
