# Research: agent-mcp

## Question

How should a person's own agent (Claude Code, Claude Desktop, any MCP client) read and change their Post-its board, acting as that person, without breaking "position is meaning" or the feeling that the board is a shared, live place? The owner has already decided some things (`owner-input.md`): agents can write, a token acts as the user with no scopes, and the jobs in order are read the board, move status forward, and create notes inside label sections. Two questions are still open: how agent edits show up live to the humans on the board, and whether to use MCP or a plain skill with REST.

## What people say

Reddit refused automated fetches (`old.reddit.com` was blocked), so the user voices here come from Hacker News.

**Agents mostly read, and the person checks the result.** This matches the owner's ranked use cases.
- "I want to use Todoist MCP, but for something like background tasks and you just review it on Todoist" — yungwarlock, https://news.ycombinator.com/item?id=46269411
- "He'll turn the transcript into meeting notes, create the todos, check everything with me, do a pass" — mikethemerry, https://news.ycombinator.com/item?id=43698607
- "the assistant can proactively offer to move the Todoist task to tomorrow when it will be nicer outside" — sReinwald, https://news.ycombinator.com/item?id=46899783
- "For personal use, an MCP agent so that I can link Claude Desktop to my Todoist instance." — dan-bailey, https://news.ycombinator.com/item?id=45421277
- "Works with Claude via MCP — ask Claude what's on your list, add todos by voice" — henryaj (a todo-app maker describing his own app), https://news.ycombinator.com/item?id=47246785
- The sceptic's view: "It wrote a summary of my inbox that took as long to read as flipping through my inbox." — coffeefirst, https://news.ycombinator.com/item?id=47914047. A read tool that dumps the whole board adds nothing. It has to summarise.

**MCP versus REST plus a skill file.** From the "New MCP Roadmap" thread, https://news.ycombinator.com/item?id=49400699:
- "I still struggle to see how a MCP endpoint is easier for agents to work with compared with a REST endpoint and a skills.md file." — cube00
- "it's not easier for agents to work with. it's easier for organizations to work with." / "what MCP brings is centralized updating and distribution of the instructions" — notatoad
- "Not all agents have access to a sandbox/cli/code execution environment to run arbitrary api calls etc." — MikhailTal
- "Your agent can easily be configured to always allow certain MCP tools. This is very hard to do for only certain REST endpoints." — adrian_m
- "it often causes a proliferation of MCP tools which bloats context" — techscruggs
- "saying “tell your agent to hit /api/v3/openapi.yaml” is quite useful" — peterlk

From "MCP is dead; long live MCP", https://news.ycombinator.com/item?id=47380270:
- "MCP lets less-technical people plug their existing tools into agents. They can click through the auth flow in about 10 seconds" — phpnode
- "The reason we have MCP is because early agent designs couldn't run arbitrary CLIs. Once you can run commands, MCP becomes silly." — tptacek

Across both threads, people say MCP wins for agents with no shell (Claude Desktop, phone apps), for per-tool allow lists and for distributing instructions. REST plus a skill wins on context cost and simplicity for coding agents that can run `curl`. A small tool set answers most of the bloat complaint.

**Not found:** anyone worrying in their own words that an agent changed things without them noticing, and anyone discussing API tokens versus OAuth for a personal MCP server. Both are listed under gaps.

## How other apps do it

- **Trello (official MCP):** hosted at `mcp.trello.com/v1`, using OAuth 2.0. Cards: "View, create, update, move, archive, and mark cards done; attach and detach labels". There is no delete: "Destructive delete operations are not supported." Write access acts "using your existing Trello permissions", and "Your AI assistant cannot perform actions beyond what you can do in Trello directly." That is the same "acts as the person" rule the owner chose. The page doesn't say whether Trello marks agent actions differently. https://support.atlassian.com/trello/docs/connect-trello-to-ai-assistants-with-trello-mcp/
- **Todoist (official MCP):** designed around workflows on purpose: "We use **specialized workflow tools** instead of 30+ API-endpoint tools." Names use the user's own words ("`complete-tasks` not `close-tasks`"). It has an overview tool (`get-overview`), `find-tasks`, `complete-tasks`, `add-tasks`, and `delete-object` for deletes. The design doc lists "One-to-one API mapping without added value" as an anti-pattern. https://github.com/Doist/todoist-mcp, https://github.com/Doist/todoist-mcp/blob/main/docs/tool-design.md
- **Miro (official MCP):** OAuth 2.1, and "Respects all existing board permissions and access controls." It has a summarising read (`context_get`) and writes in bulk (`layout_create`: "Create multiple board items on a Miro board from DSL text"). Every tool is tagged Read or Write, and none of the listed tools deletes. https://developers.miro.com/docs/mcp-intro
- **Notion (3.8, 13 Oct 2026):** "See every change by every person and agent … with highlighted edits, detailed database changes, and attribution. Let your agents work while keeping their changes visible and secure." Since 28 Aug 2026 agents can also "propose changes instead of making them directly". Notion is the one big app that treats showing what an agent changed as a feature in its own right. https://www.notion.com/releases

Common pattern: a remote MCP at a URL, the agent acting as the person with their existing permissions, a handful of workflow tools, a summary tool rather than a raw dump, and deletes left out or kept apart. All four use OAuth. A pasted token, as the ADR proposes, is simpler and is what Notion offers its Business plans and the Notion REST API offers as a personal access token. It costs us one paste instead of an OAuth server.

## What HCI says

- **Workspace awareness, extended to agents.** Ream (Jiang et al., arXiv 2026) builds Gutwin and Greenberg's who/what/where awareness elements into a workspace shared with agents: "Interaction histories show who acted, what they did, which document they worked on, and when," with "blue indicating user activity and orange indicating the agents’." The motivation: "agents act at speeds that outpace human monitoring, and users’ evolving interests are not always expressed in chat." Participants "used these traces to inspect evidence, steer agents, communicate through annotations". https://arxiv.org/html/2610.09497v1
- **People watch agents work, a lot.** CLEO (Son et al., KAIST): an observational stance in "70.20% of turns", where "The user watches the agent work without intervening, often to understand its approach or decide when to act." The most common reason a user stepped in was "Seeing the agent’s work in progress gives the user an idea they had not considered". The study also found that participants "avoided intervention when the agent misinterpreted their edits." https://cleo.kixlab.org/
- **Agents fit into existing authorship norms.** Lehmann et al. (CHI 2026) made "AI use visible to all users through two new shared objects", with "Agent responses appear[ing] in the familiar comment feature". They found teams "incorporated agents into existing norms of authorship, control, and coordination, rather than treating them as team members." https://arxiv.org/abs/2509.11826. For Post-its, this argues for showing the agent as the person's own extension ("Edward, via agent") rather than as a new teammate with its own identity. That matches the owner's "no separate agent identity".
- **Tool design for agents (Anthropic engineering).** "A common error we've observed is tools that merely wrap existing software functionality or API endpoints". Build "a few thoughtful tools targeting specific high-impact workflows", "eschew low-level technical identifiers", and "prompt-engineer your error responses". https://www.anthropic.com/engineering/writing-tools-for-agents
- **Protocol.** The current MCP revision (2026-07-28) makes Streamable HTTP a single POST-only endpoint with no sessions: "Removal of the GET stream endpoint. Removal of protocol-level sessions." Servers SHOULD answer GET/DELETE with 405 and MUST validate `Origin` (403 if it's present and invalid). https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http. The previous revision (2025-06-18) had optional sessions and a GET stream. https://modelcontextprotocol.io/specification/2025-06-18/basic/transports. A guide warns that "essentially every client shipping today still speaks `2025-11-25` or earlier", so a server should accept both. https://agentcat.com/guides/building-streamablehttp-mcp-server/. A stateless JSON-only server fits one 256 MB process well: no per-client state, no streams held open.

## What Post-its has today

- **Auth seam:** `server/src/auth.ts` resolves a `sid` cookie to a `User` (`sessionUser`, `requireUser`). Everything downstream takes a `User`, so a bearer token that resolves to the same `User` reuses `canSee` / `canEdit` / `canMove` (`server/src/boards.ts:109-121`) unchanged. That is the owner's "token = the person". `changePassword` already wipes sessions in one transaction, so dropping tokens there is one more line. Sessions store `sha256(token)`, the pattern ADR-0001 copies for `agent_tokens`.
- **Live sync is free for writes:** `createNote` / `updateNote` / `deleteNote` call `hooks.noteUpserted` / `noteDeleted`, which `realtime.ts:424` broadcasts to everyone in the board's room, filtered per viewer by `canSee`. A token-authed write through the same functions shows up live on every open board with no new WebSocket work. Moves already respect the drag lock (`hooks.lockHolder`), so an agent can't yank a note a human is dragging.
- **No trace of the agent:** a note keeps only `author_id` and `updated_at`. A change made through a token looks exactly like a change the person made. Nothing marks it, live or after a reload. Presence (`realtime.ts:92`) lists open WebSocket connections only, so an agent calling REST is invisible.
- **HTTP details that matter for `/mcp`:** `dispatch` refuses non-GET `/api/*` requests whose `Origin` isn't the app's host. A missing `Origin` passes, which is what MCP clients send. `readJson` caps bodies at 16 KB and requires `application/json`. Routes are a regex table in `server/src/index.ts`. `/mcp` would sit outside `/api/` and needs its own branch in `dispatch`. There's no dependency on `@modelcontextprotocol/sdk` yet. The server has just two runtime deps (`ws`, `marked`).
- **Things in flight that change the tools:**
  - `note-sidebar` (PR #4, ready to merge) makes **status per user** with three states (none / on progress / done) and adds comments. So the agent's "set status" sets *the person's own* status, and the tool must use the new vocabulary, not `todo/doing/done`.
  - `label-sections` (in decide; the research recommends "zones") would **remove per-note labels**. Sections would be named rectangles, and a note belongs to the one containing its centre. "Create post-its into the board's existing label sections" then means *choose coordinates inside a named zone without overlapping notes*. That's a server-side placement job the agent shouldn't do by guessing pixels. Until that ships, "section" can only mean a label.
  - `agent-discovery` waits on this idea for the token-flow and `/mcp` pointers (llms.txt, API docs).
- **Notes are fixed size** (from project context), so finding a free slot inside a rectangle is a simple grid search.

## Shapes

All three share the same base, which the owner and ADR-0001 have already settled. An `agent_tokens` table (hashed, one per user, generate/revoke in Settings, wiped on password change). A `requireUserAny` that tries the bearer token, then the cookie. A token-scoped rate limiter. And one `server/src/agent.ts` module of **job-shaped functions** that call the existing `userBoard` / `channelBoard` / `createNote` / `updateNote` and own no visibility logic of their own. The shapes differ in how agents reach that module and in how the humans on the board see the agent.

### A. Remote MCP with five job tools, agent edits marked on the board

A stateless, JSON-only Streamable HTTP endpoint at `/mcp` on the same process, accepting both the 2025 revisions and 2026-07-28. It exposes about five tools named after the owner's jobs, not after the REST routes:
- `read_board`: a summary first. Counts by status and section, what's stale, and notes listed by section with their short ids.
- `find_notes`
- `set_status`: your own status, in note-sidebar's states.
- `add_notes`: batch, each with a `section` name. The server picks a free spot inside that zone, or falls back to a label.
- `move_notes_to_section`

There's no delete tool, as in Trello and Miro. Every write made through a token carries `via: "agent"` in its broadcast. Clients show a short glow on the touched note plus a small "via agent" tag next to the person's name for a few seconds. That makes agent edits visible live without a new identity.
- **For:** the owner and anyone using Claude Desktop or phone agents (no shell needed). It's also what `agent-discovery` wants to point at.
- **Evidence:** every big board or task app ships a remote MCP of this kind (Trello, Todoist, Miro). Todoist and Anthropic both argue for workflow tools over endpoint mirrors. Notion, Ream and CLEO argue for visible agent activity. MikhailTal and phpnode explain why MCP over REST for non-coding agents.
- **Cost:** large. Tokens, a Settings UI, the MCP endpoint (hand-rolled, or the SDK at roughly a few MB resident), `agent.ts`, placement inside a zone, a `via` flag through `hooks` and `realtime.ts`, the glow in `Board.tsx`, and specs plus a verify-postits MCP feature file.
- **Riskiest assumption:** that `add_notes` into a section can place notes well enough that the owner doesn't immediately drag them all. Position is the product's whole meaning, and it depends on `label-sections` landing first.

### B. Token-authed REST plus a skill (no MCP)

The existing REST routes accept the bearer token through `requireUserAny`. One new read route, `GET /api/agent/board` (JSON, or Markdown when asked), returns the triage summary. A `SKILL.md` served at `/agent/SKILL.md` (and linked from `llms.txt` by `agent-discovery`) teaches a coding agent the three jobs with `curl` examples. There are no new protocol layers and no new dependency. Agent edits are marked the same way as in A, or not at all.
- **For:** the owner's own Claude Code use. Developers with a shell.
- **Evidence:** cube00, peterlk, tptacek. Context-cost complaints about MCP. This is the cheapest path to "agent-able".
- **Cost:** small to medium. Tokens, Settings, one summary route, the skill doc.
- **Riskiest assumption:** that the owner's agents all have a shell. Claude Desktop and phone agents can't use it, and the agent has to work out section placement itself by reading coordinates. It also skips the MCP endpoint the spine (`fixed-idea.md`) and `agent-discovery` are counting on.

### C. The agent as a visible presence: MCP plus a ghost cursor

Everything in A, and the agent also *joins the room* while it works. Each token call puts a short-lived presence peer, "Edward's agent", into the board's room, with a cursor in the person's colour but ghosted. The cursor glides to each note before the agent reads or changes it, then fades after a few idle seconds. Humans watching see the agent arrive, move to "renew domain" and flip it to done, the way they see a friend. The thesis says "co-presence makes it less lonely", and here the agent becomes one more presence on your board, without being a separate identity in the data.
- **For:** the owner, if the point of agent access is that the board stays a place where you *see* things happen, not just a database.
- **Evidence:** CLEO (people watch agents in 70% of turns, and ideas come from seeing work in progress). Ream (live who/what/where of agent activity). The project's thesis and existing cursors and follow. The owner's taste for "fluid" animated motion.
- **Cost:** large, A plus more. Server-side virtual presence peers in `realtime.ts` (today presence is one entry per WebSocket), cursor animation pacing in `Board.tsx`, and deciding how long the ghost stays around after a batch of stateless calls.
- **Riskiest assumption:** that a ghost cursor reads as "my agent is helping" and not as noise or a stranger. Most agent calls happen while nobody has the board open, so the effect only appears when someone is watching.

## Recommendation

**A, with the C ghost cursor as the spike's question.** A remote MCP with five job tools is what every comparable app ships, and it serves agents with no shell. Its `agent.ts` core can serve B's REST and skill later for almost nothing. For the open attribution question, spike two treatments side by side, A's glow plus "via agent" tag and C's ghost cursor, and let the owner judge with `/taste`. Build after `note-sidebar` merges (status vocabulary), and decide `add_notes` placement together with `label-sections`.

## Sources

- https://news.ycombinator.com/item?id=46269411
- https://news.ycombinator.com/item?id=43698607
- https://news.ycombinator.com/item?id=46899783
- https://news.ycombinator.com/item?id=45421277
- https://news.ycombinator.com/item?id=47246785
- https://news.ycombinator.com/item?id=47914047
- https://news.ycombinator.com/item?id=49400699
- https://news.ycombinator.com/item?id=49399591
- https://news.ycombinator.com/item?id=47380270
- https://support.atlassian.com/trello/docs/connect-trello-to-ai-assistants-with-trello-mcp/
- https://github.com/Doist/todoist-mcp
- https://github.com/Doist/todoist-mcp/blob/main/docs/tool-design.md
- https://developers.miro.com/docs/mcp-intro
- https://www.notion.com/releases
- https://arxiv.org/html/2610.09497v1
- https://cleo.kixlab.org/
- https://arxiv.org/abs/2509.11826
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- https://agentcat.com/guides/building-streamablehttp-mcp-server/
- Repo: `docs/adr/0001-mcp-triage-server.md`, `docs/backlog.md` checkpoint F, `server/src/auth.ts`, `server/src/boards.ts`, `server/src/realtime.ts`, `server/src/index.ts`, `server/src/http.ts`, `../note-sidebar/docs/ideas/note-sidebar/decision.md`, `../label-sections/docs/ideas/label-sections/research.md`
