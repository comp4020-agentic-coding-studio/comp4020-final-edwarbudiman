# Decision: agent-mcp

Decided 2026-11-09 by the owner, in the lead's tab. Builds on `owner-input.md` (write access, token = the person with no scopes, jobs ranked read > status > create into sections).

## Picked

**Shape A: a remote MCP with job-shaped tools, with agent edits marked on the board.** A stateless, JSON-only Streamable HTTP endpoint at `/mcp` on the same Node process, authed by a personal API token generated in Settings (hashed, one per user, revocable, wiped on password change). The token resolves to the same `User`, so `canSee` / `canEdit` / `canMove` apply unchanged. One `server/src/agent.ts` module holds job-shaped functions over the existing board and note functions, so REST writes keep broadcasting live through `hooks.noteUpserted`.

Tools, named after the jobs and not mirroring the routes:
- `read_board`: a summary first (counts by status and by section, what's stale), then notes grouped by section, each with a short id.
- `find_notes`
- `set_status`: the person's own status, in note-sidebar's states (none / on progress / done).
- `add_notes`: a batch. Each note names a `section`, and the server picks a free, non-overlapping spot inside that section's zone.
- `move_notes_to_section`
- `edit_note`: rewrite a note's text (only notes the person could edit).
- `comment_on_note`: through note-sidebar's comments, posted as the person.
- `delete_notes`: takes the ids **and each note's current text**. If the text doesn't match, the delete fails, so a stale or misread id can't remove the wrong note.

Every write through a token carries `via: "agent"` in its broadcast, and the board shows it (the treatment is the spike question).

**Setup by chat.** Settings has a "Connect your agent" box with a ready-made message holding the `/mcp` URL and the token. The person pastes it into a chat with their agent, and the agent configures itself (in Claude Code it runs `claude mcp add --transport http ... --header "Authorization: Bearer ..."`). The person never edits a config file. This is for non-technical and fast-moving people.

## Why

- Owner: read and write, with the token acting as the person, "for simplicity". No scopes and no separate agent identity.
- The owner picked A over B and C after the research. It serves agents without a shell (Claude Desktop, phone), it's what agent-discovery and the spine expect, and comparable apps (Trello, Todoist, Miro) ship this shape.
- Edit, comment and delete were added beyond the three main jobs, so the agent can do on the board what the person can. Delete gets the confirm-by-text guard because notes can't be restored.
- Setup by chat: "so it will be easier for non-tech or fast moving people to do it".
- Pasted token rather than OAuth, to start. OAuth is a later brief if Claude Desktop needs it.

## Not picked

- **B. Token REST plus a skill, no MCP.** It only works for agents with a shell, and skips the `/mcp` endpoint that agent-discovery and the spine count on. `agent.ts` can still back a REST route later for almost nothing.
- **C. Ghost cursor as the whole shape.** Not rejected: its ghost cursor is one of the two treatments in the spike.
- **OAuth from the start.** Too big for a first build on one 256 MB machine. Not rejected, only deferred.

## It works if

1. In Settings I copy the "Connect your agent" message and paste it into a Claude Code chat. The agent connects itself with no file editing, and `read_board` then returns my board grouped by section, with counts by status.
2. The agent sets a note to done. A second browser on the board sees the change live with the agent marker, and the new status is still there after a reload.
3. The agent adds 3 notes "into section X". They land inside X's zone without overlapping each other or existing notes.
4. A token can't read or change anything my login couldn't. A spec checks this against another user's private board and a note I can't edit.
5. After I revoke the token, or change my password, the next MCP call fails with 401. `delete_notes` with a stale or mismatched note text deletes nothing.

## Spike question

When the agent changes my board while I'm watching, which feels right: **(a)** a short glow plus a "via agent" tag, or **(b)** a ghost cursor ("Edward's agent") that glides to each note it touches? Both go behind `?v=a` / `?v=b`. The spike also checks that pasting the setup message connects Claude Code using a static bearer header, which is the research's main risk.

## Sequencing

**One build, after label-sections merges** (owner's choice). Both dependencies were already on `main` when this was decided (note-sidebar 0167ee3, label-sections PR #6), and `main` was merged into `feat/agent-mcp` (c45afd6). So the build isn't blocked; it waits only on the spike's taste gate. The spike needs a token, a minimal `/mcp` with `read_board`, `set_status` and `add_notes` into a section, the chat setup message, and the two attribution treatments.

## Open questions

- Claude Desktop: does a custom connector accept a static bearer header, or does it force OAuth? If it forces OAuth, chat setup covers Claude Code first, and OAuth becomes a later brief.
- The pasted setup message puts the token in the agent's chat history. Is that acceptable, given the token can be revoked in one click? (The orchestrator assumes yes.)
- `@modelcontextprotocol/sdk` or a hand-rolled endpoint: whichever stays lean within 256 MB. The builder measures and picks.
- How long the ghost cursor stays after a burst of stateless calls (only if (b) wins).
- `project-context.md` still says "read-only MCP triage server". The owner updates it.
