# Research: note-sidebar

## Question

Can a note get a "back side" (proof and comments in a right-hand sidebar) without making the board busier or less direct? The thesis is that **position is meaning, and co-presence makes it less lonely**. A sidebar should give people who drop by a way to talk about a note in place, and must not turn the board into Trello or cover it in comment pins.

## What people say

I found no Reddit or Hacker News threads on this. Searches with `site:reddit.com` and HN-style queries returned only app directories and unrelated pages. The real-user voices below come from vendor community forums and GitHub issues instead.

**Comment pins cover the board.** This is the most common complaint.
- Miro: "The comment icon is placed on the part of the note where you right-clicked. Most of the time, that means it obscures the note text." A later reply: "The comment obscures so much of the text so much of the time that you have to keep moving them." [1]
- Miro: "the comments quickly get out of control and clutter the board." [2]

**People want comments tied to the element, so they follow it when it moves.**
- Excalidraw: "Especially when collaborating, the ability to comment elements on a whiteboard would rock!" A 2024 follow-up: "Is it also possible to attach/link a comment to a particular drawn element/text, would be super helpful when rearranging elements" [3]
- Penpot's whiteboard request is nearly this idea word for word: "Clicking a sticky shows a right panel with info who created it, ability to add comments, maybe see edit revisions, idk." [4]

**Workarounds show that people treat notes and comments as the same kind of thing.**
- Miro teams use "a "Comments" Kanban using Sticky Notes instead of Comments feature", but "You can't tag folks via stick notes". [2]
- Penpot: stickies are better than comments because "Unlike comments, they'd always be visible in all views." [4] Hidden comments get forgotten, so the board needs a small marker.

**Photo proof of a finished task is already a product.** Sticky Tasks: "When you finish the task, take a completion photo to mark it done." "Finish the task and snap a completion photo for accountability." [5] That listing ties proof to finishing a task. The owner has decided that here proof is free-form and not tied to status.

## How other apps do it

- **FigJam** attaches comments to objects: "If you comment on a specific shape or sticky, FigJam will attach your comment to that object." It also has a sidebar list: "All the comments in the file will be listed in the right sidebar when you're in comment mode." [6] Comments sit behind a separate comment mode, not a plain click.
- **Milanote** treats a comment as a card attached to another card: "You can attach a comment to a note, image, or other card." "If someone moves the card, your comment will move with it." Its stated goal is "keeping your board looking neat." [7]
- **Trello**'s card back holds attachments, comments and activity. The 2025 redesign aimed to "reduce screen clutter", and you can "expand/collapse the card's comments and activity section" from a menu at the bottom of the card back. [8] Trello is the product the seed says not to become.
- **Notion side peek** opens an item "on the right side of your screen" so you can "keep your database items visible and interactive on the left side of your screen", "making it easier to jump between pages and make quick edits with fewer clicks". [9] This is the same pattern as the seed's "click another note to switch".
- **Miro** cards have "Open in side panel" as an explicit icon or shortcut, not a single click. I saw this only in search summaries and did not open the page, so it is not cited.

Common pattern: comments attach to the object and move with it. The thread lives in a side panel, and the canvas shows at most a small marker. No app I found opens the panel on **every plain click**. FigJam and Miro both need a mode or an explicit button.

## What HCI says

- **Anchored conversations.** Churchill et al. (CHI 2000) built "an application-independent tool called Anchored Conversations that brings together text-based conversations and documents", "allowing text chats to be anchored into documents." [10] Talk attached to the thing it's about is an established idea. Here the anchor is a note, and the note's position already carries meaning.
- **Nonmodal over modal.** NN/g: "Modal dialogs interrupt users and demand an action." With a nonmodal dialog, "The user can continue interacting with the main content … while the dialog is open," and "In situations where the task is not critical, a nonmodal dialog might be appropriate." [11] Elsewhere they recommend: "Favor nonmodal overlays placed at the bottom or on the side of the page. These are far less intrusive". [12] This supports a sidebar that leaves the board usable (pan, drag, click another note) over a centred modal.
- **Information scraps.** Bernstein et al. studied "little squares of colorful paper stuck on monitors … to-do lists tucked away in pockets". The team said, "I would never make the claim that we're trying to replace Post-its". [13] A note's value is that it is small and quick. Its back side should stay optional and not ask for anything when a note is created.
- Shneiderman's "overview first, zoom and filter, then details-on-demand" fits this idea (board = overview, sidebar = details on demand). I couldn't read the text in either PDF copy, so it isn't cited.

## What Post-its has today

- **Click handling** (`client/src/pages/Board.tsx`, `onNoteDown` / `onPointerUp`). A press starts a `pending` gesture. More than 3 px of movement (8 px plus a long press on touch) turns it into a drag. A pointerup still in `pending` is a click without movement, and the existing `collapse` branch already uses it. That makes "only a still click opens the sidebar" a small hook in an existing spot. Shift-click and box-select go through other branches, so they stay out naturally.
- **Single click already means select.** The selection toolbar (colour, Edit, Label, Status, Duplicate, Delete) appears on click. A sidebar on the same click adds a second thing that appears, so the two have to share the screen. The toolbar sits at the bottom centre, so a right-hand sidebar doesn't collide with it on desktop.
- **Permissions** (`server/src/boards.ts`). `canSee` covers private notes (author plus board owner) and is "the one place that rule lives". Comment and proof reads and broadcasts should go through it. `canEdit` covers channel members, or the author on a user board.
- **Sync.** Writes go through REST, then `realtime.ts` broadcasts to the board's room. New `comment:*` / `proof:*` events fit the same route. The schema is numbered migrations in `server/src/db.ts`, and the next one is 6.
- **Size limit.** `server/src/http.ts` has `MAX_BODY = 16 * 1024`. A ~200 KB image cannot use the JSON body path, so it needs its own upload route with its own cap. Images should be stored as BLOBs in their own table and served one at a time (`GET /api/proof/:id`), never inlined in the board fetch, to keep within 256 MB. At 5 × 200 KB = 1 MB per note, disk is fine. Memory is only at risk if images are loaded in bulk.
- **Fixed-size notes.** A marker (comment count, proof icon) has to fit in a corner without pushing the 280-character text around.
- **Related:** the `approved` status already exists in the schema for parked job approval. Proof could later back it, but that stays out of scope.

## Shapes

### A. Peek sidebar with two sections (the seed as written)

A still single click opens a nonmodal right sidebar for that note: the note's text at the top, then **Proof** (up to ~5 items, text or image), then **Comments** (newest at the bottom, with an input). Clicking another note switches to it, and Esc or empty canvas closes the panel. The board stays usable underneath. A small corner marker on the note shows the comment count and a proof icon. Everything syncs live and survives a reload, private notes stay private, and phones get a bottom sheet. **For:** the owner and visitors who want to talk about a specific note or show it's done. **Evidence:** Penpot's near-identical request [4], Notion side peek [9], NN/g on nonmodal panels [11][12], attached comments in FigJam and Milanote [6][7]. **Cost:** largest. Two tables plus a BLOB table, a new upload route outside the 16 KB cap, client-side image downscaling, about four new broadcast events, the sidebar UI, a mobile sheet and the marker. **Riskiest assumption:** that opening a panel on every still click won't feel like something "in the way". No comparable app does this on a plain click [6]. A test of moving notes around quickly will tell.

### B. Text first: comments plus text proof, images later

Same sidebar and click rules as A, but in round one proof items are text only (a link or a sentence), and image proof comes in a second step. **For:** the same people. This is the cheapest way to test whether the sidebar interaction and live comments feel right before building the image pipeline. **Evidence:** the same as A. The main complaints [1][2] are about clutter and finding comments, not about missing images. **Cost:** about half of A. No upload route, no BLOBs, and no memory risk. **Riskiest assumption:** that proof without a photo is still worth having. The photo-proof apps [5] suggest a photo is what makes proof feel real, so text proof may feel like just another comment.

### C. One timeline, with proof as a pinned entry

One stream on the back of the note. Every entry is a comment, and the note's editor can mark an entry (text or image) as **proof**, which pins it to the top. There's one input box and no second section. **For:** owners who rarely add proof and mostly chat. **Evidence:** Miro users already merge notes and comments [2]. Trello's card back puts everything in one place and has been criticised for clutter [8], which argues against a second section that is usually empty. **Cost:** a little less than A. One table with an `is_proof` flag. Images are still needed. **Riskiest assumption:** that proof doesn't need its own space. The owner asked for two sections by name, so this shape goes against the seed and needs the owner's sign-off.

## Recommendation

Pick **A**, delivered as B then A: the spike builds the still-click sidebar, live comments, text proof and the corner marker, and the image proof comes in a second step once the click behaviour feels right. The biggest unknown is the interaction (does every still click opening a panel get in the way?), not storage, and the image upload route is the most expensive part. Keep the panel nonmodal, as NN/g and Notion's side peek suggest, so the board stays usable while it's open.

## Sources

1. https://community.miro.com/ask-the-community-45/better-placement-of-sticky-note-comment-9472
2. https://community.miro.com/inspiration-and-connection-67/comments-any-procedures-or-ideas-to-keep-a-handle-on-them-459
3. https://github.com/excalidraw/excalidraw/issues/2710
4. https://community.penpot.app/t/feature-intuitive-sticky-notes-collaborative-whiteboarding/351
5. https://apps.apple.com/app/id6755642471
6. https://help.figma.com/hc/en-us/articles/1500004290941-Comments-in-FigJam
7. https://help.milanote.com/en/articles/10684379-comments
8. https://support.atlassian.com/trello/docs/new-card-back/
9. https://www.notion.com/releases/2022-07-20
10. https://www.maurocherubini.it/anchored-conversations-chatting-in-the-context-of-a-document/ (quotes the abstract of Churchill et al., CHI 2000, doi:10.1145/332040.332475)
11. https://www.nngroup.com/articles/modal-nonmodal-dialog/
12. https://www.nngroup.com/articles/popups/
13. https://news.mit.edu/2008/info-scraps-tt1210
