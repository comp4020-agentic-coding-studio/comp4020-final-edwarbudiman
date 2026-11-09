# Agent MCP

A person connects their own AI agent to their account. In Settings, "Connect your agent" makes a personal token and a setup message to paste into a chat with the agent. The agent then talks to `POST /mcp` (stateless Streamable HTTP, JSON only) as that person, with exactly their permissions. It reads the board grouped by section, moves a note's status, adds notes into named sections, edits, comments and deletes with a guard (each note's current text must match). Everyone watching the board sees an agent's change live, with a purple glow and a "via <name>'s agent" tag for 3.5 seconds.

## Sub-features

- `agent-token` Settings → "Connect your agent" → "Make a token" shows the setup message once, with Copy, Make a new token and Revoke. Afterwards the box shows created and last-used times, never the token. One token per user: a new one replaces the old.
- `agent-setup-message` the message names `location.origin + "/mcp"` (never a hard-coded host) and the `claude mcp add --transport http postits <url> --header "Authorization: Bearer <token>"` command.
- `agent-auth` `/mcp` needs `Authorization: Bearer <token>`. No token, a garbage token, a revoked or replaced token, or a token after a password change gives 401 with `WWW-Authenticate: Bearer`. A bearer token does not work on `/api/*`.
- `agent-read` `read_board` returns Markdown: a summary line (notes, counts by your status, sections), then `## <section>` blocks and `## Not in a section`, each note as `- [status] #id text`.
- `agent-status` `set_status` ("none", "on progress", "done") changes the person's own status; a second tab sees the ✓ or status change live, the note glows with the tag, and a reload keeps it.
- `agent-add` `add_notes` with a `section` puts each note in a free, non-overlapping spot inside that zone; an unknown or full section is a tool error listing the real sections and adds nothing.
- `agent-guard` `delete_notes` deletes a note only if its text matches exactly; mismatches are skipped and listed.
- `agent-permissions` a token can't read private notes of someone else's board, or edit, delete or move notes its person couldn't.

## How to get to it (user POV)

- Open Settings (header menu), scroll to "Connect your agent", press "Make a token", press "Copy setup message", paste it into a chat with Claude Code.
- Keep the board open in another tab or browser while the agent works.

## Driving it with claude-in-chrome

Preconditions: baseline launch from `../SKILL.md`; `demo1` has a board with a section named "Later" (press `G`, drag, name it) and at least two notes outside it. `demo2` is logged in in a second profile or tab and visits `/demo1` (tabs share one cookie jar, so log demo2 in last or use a second profile).

- **Token.** As demo1 open `/settings`, press "Make a token". The textarea holds a message with `claude mcp add --transport http postits http://localhost:<VERIFY_CLIENT_PORT>/mcp --header "Authorization: Bearer pi_…"`. Reload: no token shown, "An agent token is active", created and last-used times. `select user_id, created_at, last_used_at from api_tokens` has one row, and `token_hash` is 64 hex characters, never the token.
- **Connect the real binary** (or curl the same JSON-RPC calls). In a temp directory: run the `claude mcp add …` line from the message with the API port in place of the client port (`http://localhost:$VERIFY_SERVER_PORT/mcp`), then `claude mcp list` must print `postits … ✔ Connected`. Remove it afterwards with `claude mcp remove postits`. Note: use the full path of the real binary if `claude` is shadowed by a mise shim.
- **curl equivalents.** `curl -s localhost:$VERIFY_SERVER_PORT/mcp -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_board","arguments":{}}}'`.
- **Live status with glow.** Put demo2's tab on `/demo1`. Call `set_status` with a note id and `"done"`. In demo2's tab the note glows purple with a "via demo1's agent" tag for about 3.5 s: take the screenshot inside 3 seconds. Reload: the status is still there (`select * from note_status`).
- **Add into a section.** Call `add_notes` with three notes and `section: "Later"`. All three appear inside the Later zone, none over another note. An unknown section returns `isError: true` and names "Later".
- **Guarded delete.** `delete_notes` with a wrong `text` deletes nothing and says why; with the exact text the note disappears from demo2's tab at once.
- **Revoke.** Press Revoke in Settings (or Make a new token): the next `/mcp` call with the old token is `401`. Screenshot or capture the status line.
- **Permissions.** With demo2's token on `/demo1`: `edit_note` and `delete_notes` on demo1's notes are tool errors, `read_board {board:"demo1"}` omits demo1's private notes.

## Gotchas

- The raw token is shown once, right after "Make a token". Lose it and make a new one; that invalidates the old.
- The glow lasts 3.5 s. Trigger the tool call and take the screenshot in the same step.
- `/mcp` is on the API port (`PORT`), which in dev the Vite client also proxies; the setup message uses the page's origin, so in dev it names the client port, which works through the proxy.
- The agent acts as the person, so a note it adds shows the person as author. The tag is the only sign that it was the agent.
- `claude` may be a shell alias or mise shim; call the installed binary by path for the connect proof.
- The rate limit is 60 calls a minute per person: a tight verification loop can hit `-32029`.
