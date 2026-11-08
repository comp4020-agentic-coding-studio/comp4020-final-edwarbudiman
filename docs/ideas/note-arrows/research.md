# Research: note-arrows

## Question

Post-its' thesis is "position is meaning, and co-presence makes it less lonely". It is "not a team whiteboard, not a diagram tool" (`docs/project-context.md`). The question: can an arrow add the one kind of meaning that position can't carry (A comes before B, A affects B) without Post-its drifting into a diagram tool or project manager? And what fresh note style makes the arrow feel like part of the note, not a separate layer?

## What people say

Reddit could not be searched: the research tools are blocked from reddit.com (WebSearch returned "The following domains are not accessible to our user agent: ['reddit.com']", and `site:reddit.com` queries came back with no Reddit results). The quotes below come from Hacker News, product forums and GitHub instead. One Reddit complaint shows up second-hand, through a GitHub issue.

**People want dependencies, not just a list**

- "Imo dependencies is the big difference between something you can use on complex projects, and a "mere" to-do list" (darkteflon, about Todoist) [HN 34470488](https://news.ycombinator.com/item?id=34470488)
- "For some reason, they steadfastly refuse to introduce blocking/blocked by flags." (darkteflon) [HN 34470488](https://news.ycombinator.com/item?id=34470488)
- darkteflon also says they don't need a visual graph, only a way to group and filter by dependency. [HN 34470488](https://news.ycombinator.com/item?id=34470488)
- "Ideally then, given all these tasks and their dependencies, what should I work on next?" (k1t) [HN 34470488](https://news.ycombinator.com/item?id=34470488)
- kolaente asked whether labelling a block is enough, or whether the app should stop you finishing a blocked task. lonelyasacloud suggested apps rarely do this because nobody has found a good interface for it, especially on small screens. [HN 34470488](https://news.ycombinator.com/item?id=34470488)
- "modeling task dependencies in 1 dimension just doesn't work." (jkscx, building a graph task manager) [HN 30205699](https://news.ycombinator.com/item?id=30205699)
- "We had big difficulties to sell, because nobody understood the concept. Or saw the advantages." (manx, on his own graph-of-everything tool) [HN 30205699](https://news.ycombinator.com/item?id=30205699)

**Arrows that are only drawings feel like double work**

- A Reddit user quoted in a Memry issue left Obsidian Canvas because "you have to manually pull everything into it and then manually link them together - so you're kind of doing it twice". [memry #2482](https://github.com/memrynote/memry/issues/2482)
- "Sometimes the arrows between cards look confusing and it's hard to tell which labels belong to an arrow." (Obsidian forum) [obsidian forum 52297](https://forum.obsidian.md/t/canvas-modify-arrows-and-label-text-like-lucidchart/52297)

**Too many lines become spaghetti**

- "Miro is worst-in-class for connectors among the tools I have used" and "I spend probably a quarter of my time in a given diagram trying to coax the connectors into a coherent organization." (Ben Dean) [Miro community](https://community.miro.com/ideas/autorouting-of-connectors-9758)
- "TBH the routing of edges is currently a mess and makes working with lines really cumbersome." and "auto-routed arrow jumps erratically" (Christoph Möbius) [Miro community](https://community.miro.com/ideas/autorouting-of-connectors-9758)
- Search snippets from Figma and Miro forum threads describe overlapping prototype lines as looking "like a someone spilled spaghetti all over your designs", and mind map connectors that cross until the diagram is "messy and unreadable". I only saw these in search results, not on the opened pages, so they aren't listed under Sources.

**How paper boards cope**

- Physical kanban advice marks blocked cards with a "Blocked" column, or with coloured stickers and icons on the card. Arrows are drawn only on planning walls ("order them chronologically and draw arrows to show relationships"). I saw this in search summaries (Wellingtone, LinkedIn) and didn't open the pages, so it isn't cited as a source. The pattern matches Screenful's Trello marker below.

## How other apps do it

- **FigJam.** Connector tool (`X` or `Shift L` for bent, `L` for straight), then drag between objects. "Lines snap onto existing shapes and stickies", so "a shape brings its lines along with it if it's moved around the board." Defaults: grey, solid, no text. Styles: solid or dashed, thin or thick, five endpoint shapes per end, and labels on the line. Quick-create adds a connector automatically when you make a new shape from an existing one. [Figma help](https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam)
- **Miro.** Select a sticky and blue dots appear on its sides. *Click* a dot to make a new connected sticky; *drag* a dot onto another object to connect the two. Lines stay attached when objects move. Attaching to the centre dot gives centre-to-centre lines that don't cross the objects. (Miro help, via search. The help page returned 403 to me. The click and drag steps are confirmed in a [Guideflow tutorial](https://www.guideflow.com/tutorial/how-to-create-connection-lines-between-objects-on-miro).)
- **Apple Freeform.** Connectors are hidden until View › Show Connectors. Then you drag the arrow on a selected item's side to another item, and "the lines follow items as they move." [MacMost](https://macmost.com/apples-freeform-21-tips-and-tricks.html)
- **Milanote.** Select a card, hover "the small circle in the top right corner of the card", and drag the arrowhead onto another card. Lines can curve and carry labels. [Milanote help](https://help.milanote.com/en/articles/111391-lines)
- **Obsidian Canvas.** Lines between cards, with optional labels. They are drawing only: no backlink, nothing in the graph. That is the source of the "doing it twice" complaint. [memry #2482](https://github.com/memrynote/memry/issues/2482)
- **Heptabase.** A Connect tool draws arrows, and per a third-party comparison the connection is remembered by both cards and listed in each card's info panel. The same comparison notes that an arrow "indicates connection, but not logic". [FluxLinks](https://www.fluxlinks.com/blog/obsidian-canvas-vs-heptabase)
- **Trello + Card Dependencies (Screenful).** No lines at all. A card is set as "blocking" another, "Blocked cards have the red blocked symbol shown on them", and a block clears when you tick it or archive the blocking card, after which it shows struck through. [Screenful](https://screenful.com/card-dependencies-for-trello)
- **tldraw.** An arrow end binds to a shape when dragged near it and follows the shape. Deleting a shape removes its bindings. Ctrl while dragging skips binding. [tldraw bindings docs](https://tldraw.dev/sdk-features/bindings)
- **Google Keep.** No note-to-note links. In 2017 the workaround was pasting a note's URL into another note. A "note links" feature with backlinks was found in an October 2025 Android build. [Google forum](https://productforums.google.com/forum/?_escaped_fragment_=topic%2Fdocs%2FStE-7BKfXAQ), [Jetstream](https://jetstream.blog/en/google-keep-to-get-note-links-soon/)

What the whiteboards share: the connection comes **out of the selected note** (a side dot or handle), the line **follows the notes**, and deleting a note deletes its lines. Task tools (Trello) skip the line and put a **marker on the blocked card**.

## What HCI says

- **People avoid explicit typed structure.** Shipman & Marshall's NoteCards experience: "Typed links -- the strongest formalization mechanism provided -- were rarely used", and when they were used, link direction and meaning confused people. "Formalisms are difficult for people to use often because of the many extra steps required to specify anything." Users also put off structuring, like papers left in piles instead of filed. [Formality Considered Harmful](https://people.engr.tamu.edu/shipman/formality-paper/harmful.html). For Post-its this argues against asking for a link *type* (blocks, depends, leads to) at creation time. A plain arrow is the low-cost act, and meaning can come later or stay implicit.
- **Links are the one thing a paper wall can't do.** The Designers' Outpost kept Post-its physical but made links digital, because "linking Post-its to each other and to groups of Post-its [is] a feature that is not readily provided by the existing practice of grouping Post-its on a wall." Links are drawn as a stroke from one note to another, they move with the note, and deleting a note deletes its links. [Klemmer et al., Outpost (PDF)](https://hci.stanford.edu/publications/2000/outpost.pdf); journal version [Klemmer, Everitt, Landay 2008](https://hci.stanford.edu/publications/2008/Outpost-HCI-Journal-2008.pdf)
- **Crossings hurt more than anything else.** Purchase (GD '97) tested five layout aesthetics: "reducing the number of edge crosses is by far the most important aesthetic", while bends and symmetry matter less. [Purchase 1997](https://research.monash.edu/en/publications/which-aesthetic-has-the-greatest-effect-on-human-understanding/). Because Post-its users place notes freely, the app can't lay the graph out for them. The shape has to keep lines few and short, and avoid drawing them where they would cross notes.
- **A line groups more strongly than nearness, mostly.** Palmer & Rock (1994) argue connectedness is a grouping principle that can beat proximity. Han, Humphreys & Chen (1999) found strong proximity groups as fast as connectedness. I saw both through search summaries; the Palmer PDF I opened was encrypted, so neither is cited as a source. If both hold, an arrow adds most when the linked notes are *not* close together. Near notes already read as a group.

## What Post-its has today

- **Notes** (`server/src/db.ts`, `client/src/pages/Board.tsx`): fixed 200×160 boxes (`NOTE_W`, `NOTE_H`) placed by `x`, `y`, `z`, inside a `.world` div scaled by CSS transform. They have a colour (6), labels, `visibility` public/private, and `status` todo/doing/done with glyphs ○ ◐ ✓. Done notes are dimmed and struck (`.note.s-done`).
- **Note style** (`client/src/styles.css`): flat paper with 3px radius, a faint inset edge and a soft shadow that lifts while dragging. Footer row with label chips, meta and the status button. No tape, curl or rotation. "Re-styling" starts from here.
- **Gestures already taken:** double-click (add/edit), drag (move), box-select, Shift-click, Space or `H` hand tool, wheel pan, pinch zoom, long-press drag on touch, arrow keys (move or pan), `N`, Enter, Delete, Esc, copy/paste/duplicate. So "drag from the note body" can't start an arrow. It needs a handle, a modifier or a tool.
- **Realtime** (`server/src/realtime.ts`): `note:move`, `note:upsert` and `note:delete` broadcast to viewers, with a per-note drag lock. Arrows would need their own messages, or need to ride on note upserts.
- **Privacy:** private notes are hidden from others (`canSee`). An arrow between a public note and a private one must be hidden from people who can't see both ends, or it gives away that the private note exists and where.
- **Status** gives the "blocked" meaning almost for free. A note is *blocked* when an arrow comes into it from a note that isn't `done`. Trello users pay a Power-Up for that red marker.
- **MCP triage (ADR-0001)** reads notes. Arrows would let an agent answer k1t's "what should I work on next?" (notes with no undone incoming arrow). That is a follow-up, not part of this idea.
- **Limits from `docs/project-context.md`:** anything on a board syncs live and survives a reload; a visitor may only edit or move their own notes, while channel members can edit any note; no new screens; 256 MB, one process, SQLite. Arrows are small rows, so memory is not a concern. Permissions are an open question: may a visitor draw an arrow from their note to the owner's note, or between two of the owner's notes? See the `ask:` line in the report.
- **Position already does most of the work.** Left-to-right, top-to-bottom and clustering already show order and grouping on the board. An arrow is worth adding only for what position can't say: a direction between notes that sit apart, or one note feeding into two others.
- **Taste and rejected:** `docs/taste.md` has no rules yet. Nothing in `docs/rejected.md` overlaps: 3d-homes and job-board are parked, and neither is about links.

## Shapes

### A. Plain arrows that come out of the note

The note gets a small handle on its right edge, visible on hover or selection (Milanote and Miro style). Drag it onto another note to make an arrow from A to B. The arrow is a single grey curve, drawn centre to centre and clipped at the note edges. It follows both notes live while they're dragged, sits under the notes, and is deleted with either note. Select it to delete it. There is no type and no label. "Order", "leads to" and "depends on" all read as "A → B", and the note text says the rest. The re-style is light: a slightly warmer paper, a visible connect nub on the right edge, and an arrowhead tinted with the source note's colour, so arrows look like part of the note and not a separate diagram layer.

- **For:** someone sketching an order or a flow on their own board, and visitors who can see why notes sit where they do.
- **Evidence:** every whiteboard puts the start of the connection on the note and makes it follow ([FigJam](https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam), [Milanote](https://help.milanote.com/en/articles/111391-lines), [MacMost](https://macmost.com/apples-freeform-21-tips-and-tricks.html)). Typed links go unused ([Shipman & Marshall](https://people.engr.tamu.edu/shipman/formality-paper/harmful.html)). Linking is what digital adds to a Post-it wall ([Outpost](https://hci.stanford.edu/publications/2000/outpost.pdf)).
- **Cost:** medium. An `arrows` table (board, from, to, created_by), REST plus realtime create/delete, an SVG layer inside `.world`, the handle gesture (mouse and touch), privacy filtering, and cascade on note delete. Copy/paste of a selection should carry arrows between copied notes. Roughly one builder round.
- **Note board or drift?** Stays a note board, with a small risk. There is one arrow kind with no labels, styles, routing or arrow tool, and it lives on the note (a nub) instead of in a toolbar. The diagram-tool line is crossed only if labels, colours, elbows or free-floating arrows get added later, so the brief for this shape should list those as off limits.
- **Riskiest assumption:** that one meaningless arrow is enough. People may want "blocks" to *mean* something, and these arrows show it no differently from "then".

### B. Arrows that know about status ("blocked by")

Everything in A, plus the arrow talks to the status you already have. If the source note isn't `done`, the target note shows a small "blocked" mark next to its status glyph and the arrow is drawn solid. Once the source is `done`, the arrow fades to dashed and the mark goes away. A filter "show what I can start" dims blocked notes. Still a single arrow kind, with no typing at creation: direction carries the meaning "do this first". The re-style folds the status glyph, the blocked mark and the arrow nub into one footer corner, so the note's "state" lives in one place.

- **For:** the owner's own use case, a to-do board where order matters ("I can't do X until Y").
- **Evidence:** HN users want blocked-by and "what should I work on next?" ([HN 34470488](https://news.ycombinator.com/item?id=34470488)). Trello users get a red marker and strikethrough when resolved, via a Power-Up ([Screenful](https://screenful.com/card-dependencies-for-trello)). It builds on note status, which already exists.
- **Cost:** A plus about a third more. A derived `blocked` flag computed in the client from arrows plus statuses, two arrow states, the mark, and one filter. No extra schema beyond A.
- **Note board or drift?** Drifts towards a project manager. "Blocked" states and a "what I can start" filter are Trello and Jira vocabulary, and the brief names a project manager as a different product. The blocked *mark* alone is a light step, since it only reuses status. The filter is the part that drifts, so it should be dropped from any spike.
- **Riskiest assumption:** that every arrow is a dependency. If the owner also uses arrows for "related to" or "then", notes will show as "blocked" when they aren't. This needs a spike to see whether it annoys people.

### C. No lines by default: marks on notes, lines on demand

Notes link to each other (same handle gesture as A), but the board doesn't draw lines all the time. Each note shows a small count or nub ("← 2", "→ 1") in its re-styled footer. Lines show only for the note you hover or select, or for all notes while a key is held (for example `L`, or a toolbar toggle). This keeps the board calm and avoids the crossing problem as boards grow, much as Freeform hides connectors until "Show Connectors".

- **For:** busy boards and channels with many people's notes, where permanent lines would become spaghetti.
- **Evidence:** spaghetti complaints ([Miro community](https://community.miro.com/ideas/autorouting-of-connectors-9758)). Crossings are the worst readability factor ([Purchase 1997](https://research.monash.edu/en/publications/which-aesthetic-has-the-greatest-effect-on-human-understanding/)). darkteflon "doesn't need a visual graph" ([HN 34470488](https://news.ycombinator.com/item?id=34470488)). Freeform's hidden-by-default connectors ([MacMost](https://macmost.com/apples-freeform-21-tips-and-tricks.html)).
- **Cost:** about the same as A. Showing on hover is cheap, and the counts in the footer are small.
- **Note board or drift?** Drifts least. At rest the board is still just notes in positions, so the thesis is untouched and nothing looks like a diagram. The price is that arrows are barely visible, so visitors (the co-presence half of the thesis) won't see the order unless they hover.
- **Riskiest assumption:** that hidden order is still useful. The seed says "so the board shows the order". If lines only appear on demand, the board at rest no longer shows it, which may defeat the point.

## Recommendation

Spike **A**: plain untyped arrows dragged from a nub on the note, which follow the notes, with the light re-style. It answers the seed and stays a note board. As an optional toggle in the same spike, show B's *blocked mark* only (no filter), so the owner can judge with /taste whether "blocks" needs its own look. Keep C's show-on-hover as the fallback if lines clutter. No arrow types, labels or styles in v1 ([Shipman & Marshall](https://people.engr.tamu.edu/shipman/formality-paper/harmful.html), and the brief's "not a diagram tool").

## Sources

https://news.ycombinator.com/item?id=34470488
https://news.ycombinator.com/item?id=30205699
https://github.com/memrynote/memry/issues/2482
https://forum.obsidian.md/t/canvas-modify-arrows-and-label-text-like-lucidchart/52297
https://community.miro.com/ideas/autorouting-of-connectors-9758
https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam
https://www.guideflow.com/tutorial/how-to-create-connection-lines-between-objects-on-miro
https://macmost.com/apples-freeform-21-tips-and-tricks.html
https://help.milanote.com/en/articles/111391-lines
https://www.fluxlinks.com/blog/obsidian-canvas-vs-heptabase
https://screenful.com/card-dependencies-for-trello
https://tldraw.dev/sdk-features/bindings
https://productforums.google.com/forum/?_escaped_fragment_=topic%2Fdocs%2FStE-7BKfXAQ
https://jetstream.blog/en/google-keep-to-get-note-links-soon/
https://people.engr.tamu.edu/shipman/formality-paper/harmful.html
https://hci.stanford.edu/publications/2000/outpost.pdf
https://research.monash.edu/en/publications/which-aesthetic-has-the-greatest-effect-on-human-understanding/
