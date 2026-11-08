# Idea: agent-mcp

Started 2026-11-09 by the owner.

## Seed

Make Post-its fully agent-able: a user's own agent (Claude Code, Claude Desktop, any MCP client) can do on the board what the user can — read notes, boards and channels, and also create, edit, move, set status, comment and label notes — not just the read-only triage in ADR-0001 / backlog checkpoint F. Shape to research: self-serve API tokens in Settings (T33, hashed, revocable), a token-authed API that reuses canSee/canEdit (no split ownership), an MCP server over Streamable HTTP on the same process (/mcp), and a Claude Code skill (and maybe a plugin) that teaches an agent how to use it. Open questions for decide: read-only first or read+write; per-token scopes; how agent-made edits show up live to humans on the board (attribution, cursor); MCP vs plain skill+REST. Size: large. Start from docs/adr/0001-mcp-triage-server.md and docs/backlog.md checkpoint F.
