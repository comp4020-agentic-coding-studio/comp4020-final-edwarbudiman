---
title: Connect your agent
order: 10
idea: agent-mcp
summary: Let your own AI agent read your board, tick notes off and add notes into your sections, as you.
image: agent.webp
---

# Connect your agent

My notes were already in one place, so I wanted my own AI agent to work from that place too: check what's on the board, tick things off, and put new notes where they belong. You hand it a token from Settings and it acts as you, with exactly your permissions. Whenever it changes your board, everyone watching sees it.

## How to use it

1. Open **Settings** and find the **Connect your agent** box.
2. Press **Make a token**. A setup message appears in the box. The token is shown only now.
3. Press **Copy setup message** (the button changes to "Copied") and paste it into a chat with your agent. In Claude Code the agent runs `claude mcp add --transport http postits <address> --header "Authorization: Bearer <token>"` itself, so you edit no config file. Any other MCP client can use the same address and header.
4. Ask the agent to read your board. It answers with a summary line (notes, counts by your status, number of sections), then your notes grouped by section, then the notes that sit outside any section.
5. Ask it to mark a note done, or put it on progress. Anyone looking at the board sees that note glow purple with a "via <your name>'s agent" tag for about 3.5 seconds.
6. Ask it to add notes "into Later". Each one lands in a free spot inside that section, clear of the other notes. If the section doesn't exist, the agent is told which sections do.
7. Ask it to delete a note. It has to quote the note's exact text, so a stale or misread id can't remove the wrong note.
8. To cut it off, press **Revoke** in the box. Its next call fails at once.

## Good to know

- The agent can do what you can do: read, set your status, add, move, edit and comment on notes, and delete them. It can't draw, move or rename sections.
- It has no powers you don't: on someone else's board it can only touch its own notes, it can't see private notes you can't see, and on a channel you haven't joined it can do nothing.
- Status stays per person. If the agent marks a note done, only you see "done" on it. A visitor sees the glow and tag, and the count in the sidebar.
- A note the agent adds shows you as its author. The tag is the only sign it was the agent.
- You have one token. **Make a new token** replaces the old one, and a changed password cancels it too. The old setup message stops working straight away.
- After the first showing, the box only says when the token was made and last used. If you lose the message, make a new token.
- The token ends up in your agent's chat history, so keep that chat private. Revoking is one click.
- The address comes from the page you're on (`/mcp` on this site). The token only works for `/mcp`, not for the rest of the API.
- An agent is limited to 60 calls a minute.

## Checked by

- `spec/agent.test.ts`: the token routes (never returned after it's made, a new one replaces the old, a bearer token can't reach `/api`, a cross-site request is refused); `/mcp` answers 401 for no, garbage, revoked, replaced or post-password-change tokens; the protocol basics (405 on GET, version handling, 64 KB cap, rate limit); `read_board` and `find_notes` output and filters; `set_status` persisting and reaching a second viewer live with the agent marker, but never a viewer who can't see a private note; `add_notes` landing three notes inside "Later" with no overlaps, and an unknown or full section adding nothing; `move_notes_to_section`, `edit_note` and `comment_on_note`; `delete_notes` skipping stale or mismatched text; another user's token being refused on private notes, someone else's notes and channels it hasn't joined; and the setup message naming the page's own origin only.
- `spec/routes.test.ts`: `mcp` is in the list of server endpoints.
