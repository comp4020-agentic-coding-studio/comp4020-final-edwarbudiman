---
title: Sections
order: 9
idea: label-sections
summary: Draw a named zone on the board to group notes by where they sit, and filter the board by zone.
image: label-sections.webp
---

# Sections

Where a note sits is how you group it, so I gave the board a way to say so out loud. A section is a soft-tinted, named rectangle behind your notes. A note belongs to the section that holds its centre. Sections replace labels, which are gone from the notes.

## How to use it

1. Click the **Section** tool in the toolbar (the dashed rectangle next to the arrow), or press **G**. Its tooltip reads "Section: drag a rectangle, then name it (G)".
2. Drag a rectangle over empty board (at least 120 by 90). The zone appears behind the notes with its name box already focused.
3. Type a name and press **Enter**. The zone is saved and everyone on the board sees it.
4. Drag the name bar to move the zone, or the grip in its bottom-right corner to resize it. Notes never move with it; the zone is just a place.
5. Double-click the name to rename it. Press **Enter** to save, **Esc** to cancel.
6. Click the **×** on the name bar ("Delete the section (its notes stay)") to remove the zone. The notes stay where they are.
7. Click **Sections** in the toolbar and tick one or more zones ("Show only notes in"). Notes outside them fade and can't be selected. A note you add by double-click, or paste, lands inside the first ticked zone. Untick everything, or press **Show all**, to see the whole board.

## Good to know

- Zones never overlap. If you draw, move or resize one onto another, it snaps back, a red "Sections can't overlap" message shows at the top and the zone flashes red. Touching edges is fine.
- On your own board only you can draw, move, resize, rename or delete sections. In a channel, any member can. Visitors see the zones and can filter by them, but get no Section tool and no controls.
- Filtering only changes your view, and it is remembered for the board in this browser tab.
- Membership is worked out from position and never stored, so moving a note across a zone's edge changes its group.
- Notes no longer show label chips, and there is no Label button or **L** key. Labels that notes already had are kept in the database but aren't shown or converted.

## Checked by

- `spec/sections.test.ts`: create (name trimmed, colour defaulted), bad input is refused with 400, 409 for an overlapping create, move or resize while touching edges pass, rename, move and resize survive a reload, delete keeps the notes, a visitor gets 403 on POST, PATCH and DELETE, any channel member can write but a non-member can't, create, update and delete are relayed live to everyone in the room (not to other boards), boards load with their sections, and notes with old labels still load.
