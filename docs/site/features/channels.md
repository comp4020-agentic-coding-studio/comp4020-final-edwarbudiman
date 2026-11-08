---
title: Channels and chat
order: 6
summary: Shared boards that anyone in the channel can edit, with a chat the server never stores.
image: feature-channels.webp
---

# Channels and chat

Your own board belongs to you. A channel is a board you share with a small group, where every member can edit any note.

## How to use it

1. Open the sidebar (**Channels and people**).
2. **Browse channels** to join a public one, or **Create a channel**.
3. Under **Who can join**, choose public, or private with a key. Give the key to the people you want in.
4. Use the channel's chat for quick talk next to the board.

## The sidebar

The sidebar lists the channels you're in and the people whose boards you've visited. Each shows how many notes are new to you since you last looked.

## Good to know

Chat goes only between the people in the room right now. The server relays it but never saves it.

## Checked by

- `spec/channels.test.ts`: public and private channels, keys, and member edits.
- `spec/chat.test.ts`: chat reaches peers and is never written to the database.
- `spec/sidebar.test.ts`: the new-note counts.
