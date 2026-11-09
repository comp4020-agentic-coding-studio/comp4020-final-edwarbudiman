# Taste

The owner's design taste for Post-its, built up with `/taste` after trying spikes and features. Every researcher, spiker, builder and reviewer reads it. Only the owner's own words go in here; agents never add lines on their own.

Each line ends with the idea it came from and the date.

## Rules

<!-- Things to enforce every time. A reviewer treats a clear break as a blocker. -->

## Likes

- The arrow nub on all four sides, "up down left right": "use mouse position relating to the center of the note for showing the nub." (note-arrows, 2026-11-05)
- Spike-2's nub on four sides, two lines for A↔B, and arrows saved in the DB: "it already done so far." (note-arrows, 2026-11-05)
- An arrow with "some kind of magnet like feels that will stick to the nearest post-it": "fluid, but magnetic enough, so it can land to any line on the post it." (note-arrows, 2026-11-05; built and liked, 2026-11-09)
- A ✓ in place of the symbol when proof is ticked: "i like the idea of changing the symbol into checkmark when it's being ticked" (note-sidebar, 2026-11-09)
- An open button that's "part of the post-it, blend and like a window, but on the corner has button." (note-sidebar, 2026-11-09)
- Animated motion for the sidebar and button: "add some animating the motion, so it will have fluid more" (note-sidebar, 2026-11-09)
- Status as only three states: "none (not showing anything), on progress, or done" (note-sidebar, 2026-11-09)
- Only the comments scroll, with the comment input "on the very bottom", going "from bottom to up for the newest to old, like youtube live comment. the design should accommodate that." (note-sidebar, 2026-11-09)
- Notes with three sections and a border: "i like the thre section, and border" (note-sidebar, 2026-11-09)
- Zones as a replacement for labels (background areas that don't carry notes, a section filter, no label chips): "i think we can ship it" (label-sections, 2026-11-09)

## Dislikes

- A→B plus B→A "creating one line with two arrows". Want a "distinct line between those, so it will create two line with two arrow, with slight gap for it." (note-arrows, 2026-11-05)
- An arrow that points "kinda auto" and is "static": "if the arrow already connect, the pointing arrow cannot be moved at all." (note-arrows, 2026-11-05)
- An open button that's hard to see. Rejected both ?v=a (edge tab) and ?v=b (hover corner icon): "i prefer something that clearly can be seen." (note-sidebar, 2026-11-09)
- The tick "not automatically change to my other tab (i checked it using two tab)" (note-sidebar, 2026-11-09)
- The sidebar breaking when there are many comments: "if comments section long enough then it starts to break." (note-sidebar, 2026-11-09)
- The corner button not lining up with the three sections and border: "it still not align well with the corner button" (note-sidebar, 2026-11-09)
- The author name in the header strip: "it also shows whose post-it it is, but it's not explaining enough for me to see it as the creator of post-it" (note-sidebar, 2026-11-09)
- A warning that's easy to miss: "error popup that saying section can't overlap not visible enough" (label-sections, 2026-11-09)

## Log

<!-- Newest first: date, idea, what was tried, the owner's reaction in their words. -->

- 2026-11-09, agent-mcp, spike-1 (hand-rolled /mcp with read_board / set_status / add_notes into a section, token + setup message in Settings, ?v=a glow + "via X's agent" tag vs ?v=b ghost cursor): "all good, continue on. be aware that our link url would be https://comp4020-final-edwarbudiman.fly.dev/, not localhost." Picked "Glow + tag (?v=a)" when asked. → build.

- 2026-11-09, label-sections, spike-1 (client-only zones, G tool, snap-back on overlap, section filter, label UI removed): "so error popup that saying section can't overlap not visible enough, fix that, and i think we can ship it" → build, then PR.
- 2026-11-09, note-sidebar, build (reviewer-2 approved, last check on the real build): "looks fine to me, then we can go PR" → PR.
- 2026-11-09, note-sidebar, spike-2 (window-corner open button, animated sidebar, comments-only scroll, live proof; tweaks: more top padding for the text, then a three-section note with header strip, text and status footer): "i ask spiker-2 to redesign the post a little bit, now it has 3 section, and border as well. i like the thre section, and border, but it still not align well with the corner button, on top, it also shows whose post-it it is, but it's not explaining enough for me to see it as the creator of post-it"
- 2026-11-09, note-sidebar, spike-1 (?v=a edge tab, ?v=b hover corner icon, client-only fakes): "1. i think we need to add some animating the motion, so it will have fluid more 2. not v=a or v=b, i prefer something that clearly can be seen. But my taste here is i believe we can make some button like, like it's part of the post-it, blend and like a window, but on the corner has button. 3. i like the idea of changing the symbol into checkmark when it's being ticked, but it's not automatically change to my other tab ( i checked it using two tab ) 4. status would be only, none (not showing anything), on progress, or done". Then, with a screenshot of the sidebar overflowing: "if comments section long enough then it starts to break. i want the scroll section would be for the comments, and for comment input should be placed on the very bottom, and it will go from bottom to up for the newest to old, like youtube live comment. the design should accommodate that." → re-spike.
- 2026-11-09, note-arrows, build (reviewer-1 approved, PR #2): "i already liked everything" → merged.
- 2026-11-05, note-arrows, spike-2: "alright, so it already done so far. for /taste, i believe i also has feedback, where the arrow pointing kinda auto, i want it to have some kind of magnet like feels that will stick to the nearest post-it, but not as static as now, because if the arrow already connect, the pointing arrow cannot be moved at all, i rather want it to be fluid, but magnetic enough, so it can land to any line on the post it." → re-spike.
- 2026-11-05, note-arrows, spike-1: "the nub could be on 4 direction, up down left right, for now the nub only appears on the right side, use mouse position relating to the center of the note for showing the nub. i also tried note a arrowing note b, then note b arrowing note a, where it creating one line with two arrows, i want it to have distinct line between those, so it will create two line with two arrow, with slight gap for it. And for the arrow, i also want it to be saved on DB, so dont just rely on localStorage" → re-spike.
