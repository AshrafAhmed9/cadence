Vendored from the shared `@webmcp-challenge/cf-foundation` package built
while working on all three WebMCP Challenge entries (cadence, consequence,
relay) — see https://github.com/AshrafAhmed9/webmcp-kit for the sibling
published library, and the other two app repos for where this same code
also lives. Kept in-repo rather than published separately since it's an
internal helper (actor/permission model, hash-chained audit log, a synced
Durable Object base), not meant to be discovered as standalone tooling the
way webmcp-kit is.
