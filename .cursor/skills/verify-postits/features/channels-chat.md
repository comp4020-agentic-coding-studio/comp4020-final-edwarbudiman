# Channels and chat

Channels and chat let a user join a shared channel board with others, post chat messages in it, and see unread counts for channels/people in the sidebar.

## Sub-features

- `channel-join` joins an existing channel (e.g. the seeded `#lobby`).
- `channel-create` creates a new channel.
- `chat-post` posts a message in a channel's chat panel.
- `sidebar-unread` shows an unread-count badge for a channel with new activity.

## How to get to it (user POV)

- Sidebar `link` for a joined channel (e.g. `link "Say hi. Everyone starts here." href="/c/lobby"`) navigates to that channel's board.
- `button "Browse channels"` / `button "Create a channel"` in the sidebar to discover or create one.
- On a channel board, open the chat panel (`aria-label="Channel chat"`) and type into `aria-label="Message"`.

## Driving it with claude-in-chrome

Preconditions:

- Two MCP tabs: tab A as `demo1`, tab B as `demo2`. Both are seeded into `#lobby` already (`seedDemo`).

- **Join/navigate.** On tab A, `computer left_click` the `#lobby` sidebar link. The board switches to the channel board at `/c/lobby`.
- **Post a chat message.** Open the chat panel (`aria-label="Channel chat"`), `form_input`/`computer type` into `aria-label="Message"` with a probe string, e.g. `verify-probe-hello`, then submit (Enter or a send button next to it — confirm via `read_page` first).
- **Confirm delivery on the other tab.** On tab B (also on `/c/lobby`, chat panel open), `read_page`/screenshot shows `verify-probe-hello` appear in the chat history within a couple seconds.
- **Confirm persistence.** Reload tab B's page and re-open the chat panel; the message is still present (server-held history, not just a live broadcast) — check via `chat:history` by simply reloading and reading the panel again.
- **Sidebar unread.** Before tab B opens `#lobby`, have tab A post another distinct message while tab B is elsewhere (e.g. its own board at `/`). On tab B's sidebar, the `#lobby` entry shows an unread-count badge. Opening the channel clears it.
- **Proof.** Screenshot of tab A's sent message and tab B's received view of the same message, plus a screenshot of the unread badge appearing and then clearing.

## Gotchas

- The seeded `#lobby` channel already has both demo users joined, so `channel-join` on a *new* channel needs `Create a channel` or `Browse channels` first — don't assume every channel test can reuse `#lobby` for join-flow proof, only for chat/unread proof.
- Posting a probe message into the shared `#lobby` pollutes a channel other verification runs or real demo users might read; prefer creating a disposable channel (`verify-probe-<RUN_ID>`) for anything beyond a quick smoke check, and note in cleanup that channel history isn't automatically deleted by this skill's teardown (it lives in the disposable `DATA_DIR`, so it disappears with the instance regardless).
- This feature was mapped from the route/WebSocket survey (`/api/channels`, `chat:msg`/`chat:history`, `board_seen` sidebar table) and ARIA labels found via static inspection, not yet driven end-to-end in this skill's proving run. Drive it fully before relying on it, and correct this file if anything differs.
