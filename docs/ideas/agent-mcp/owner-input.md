# Owner's input: agent-mcp

Given 2026-11-09, before research. These answers settle the seed's open questions. Research and decide work within them and don't reopen them.

1. **Write access: yes.** Agents can read and write. This is not the read-only triage of ADR-0001.
2. **No per-token scopes.** For simplicity, a token acts as the person, with exactly that user's permissions (reuse `canSee`/`canEdit`). There is no separate agent identity and there are no scopes.
3. **Main use cases, in order:**
   a. Most of the time, the agent checks or reads the board.
   b. It moves a note's status forward (`todo → doing → done`) or marks it finished.
   c. It creates post-its and arranges them into the board's existing label sections (see the `label-sections` idea).

   Shape the tools around these jobs, not as a full CRUD mirror of the API.

## Still open for decide

- How agent-made edits show up live to humans on the board (attribution, cursor).
- MCP versus a plain skill with REST.
