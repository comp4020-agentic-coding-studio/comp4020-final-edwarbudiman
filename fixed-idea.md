# Fixed idea

What we've decided to build, taken from the brainstorm in `more-ideas.md`.
This file only holds decisions; anything still being thought about, or kept
for later, stays in `more-ideas.md`.

## In one paragraph

Post-its is still a board for your notes, where a note's position is how you
prioritise and group it. Now every user also has a **home** and every
channel has a **hall**: small 3D spaces with an **announcement board** on the
wall. Focus the board and the camera glides into it until it becomes the flat
canvas; press `M` and you're back in the room. The simple board is always
there, and switching to it unloads the 3D part so it stops using memory. You
travel between spaces through a **portal** or by clicking a post-it's owner.
Channels are where people hang out, and their boards double as **job
boards**. Finishing work earns **coins**: the total you've earned sets your
public **level** (each level gives a stat point for your avatar), and the
coins you spend decorate your home.

## The two rules we grow by

- **Little by little against the server.** One 256 MB Fly machine. Each step
  is measured before the next one adds load (section 12).
- **People have to enjoy it.** Each step is tried by real people, the pod
  first, before we build on top of it.

---

## 1. Two views: the board and 3D

- **The board** is the flat canvas we already have. It has every work
  feature and works on its own.
- **3D** is your home (or someone's home, or a channel's hall) with the
  board hanging on the wall.
- **`M` toggles between them**, and there's always a visible toggle button.
- **The transition is one continuous move.** Board → 3D: the canvas shrinks
  onto the board on the wall and the camera pulls back into the room. 3D →
  board: the camera dollies into the board until it becomes the canvas. Notes
  keep their positions, so it's clearly the same board.
- **In 3D, `E` at a board** focuses it and opens that board's canvas.
- **Switching to the board frees the 3D part:**
  1. Straight away, 3D is **paused** (no rendering, no CPU or GPU work), so
     switching back quickly is instant.
  2. After **one minute** on the board, 3D is **disposed** (models,
     textures and renderer released) so its memory is freed.
  3. Switching back after that reloads from the browser cache, hidden behind
     the transition.
- **One renderer is reused** while 3D is alive; travelling swaps the scene,
  not the renderer.
- **Simple mode**: a setting to always open on the board. Phones, and
  browsers without WebGL, only get the board.

## 2. Spaces and travel

- **Spaces:** one **home** per user and one **hall** per channel. There's no
  shared open world.
- **URLs** (the same URL is both the board and the space; which view you see
  is a mode):

| URL | Board view | 3D view |
|---|---|---|
| `/` | your board | your home |
| `/<username>` | their board | their home |
| `/c/<channel>` | channel board | channel hall |

  Your last view is remembered, `?view=3d` opens a link straight into 3D, and
  every trip pushes a new URL, so the back button travels back.
- **Ways to travel:**
  - **Portal.** A doorway in every space. Walk into it and a picker asks
    where to go: your home, your channels, people you've been with recently,
    with who's online shown live.
  - **Click a post-it's owner** to go to their home. In 3D this plays the
    travel animation; on the board it just switches boards.
  - **Follow someone** by clicking their live cursor (this exists already);
    if they travel, you go with them.
- **Travel animation:** under a second; you step into the portal, a
  paper-fold wipe, and you're at the other space's portal. The next space
  loads during the wipe.
- **Visiting is open.** Anyone can travel to anyone's home, as with boards
  today. A board's access rules (public / key / list) also decide who can
  enter that home.

## 3. Board features

- **Status**, separate from labels: `todo → doing → done → approved`.
- **The `doing` pin.** A note you're working on carries a small pin with your
  avatar, so visitors can see what you're on right now.
- **Jobs.** A note you leave on someone else's board can be marked as a job
  for them. It looks different (a torn ticket edge) and shows you as the
  giver. When they mark it `done`, only you can **approve** it, or
  **unvalidate** it (reject it, which ends it without pay).
- **Focus mode.** Select notes and press `F`; everything else dims.
- **Per-note timeline.** Every note keeps its history: created, edited,
  status changes, who gave it, who approved it, when it got dusty.
- **Board replay.** A slider that scrubs through time and shows the board
  changing over the week, including notes later archived or deleted.

## 4. Channels and the job board

- **A channel is a board plus a hall.** The schema already has `channel`
  boards with visibility and access rules.
- **The Town Square** is a default public channel, so a new user has
  somewhere with people from the start.
- **Hanging out:** the hall shows everyone in the channel live, with their
  level and what they're `doing`. The board is the shared space; there's no
  separate chat box.
- **Posting a job:** mark a note on the channel board as an open job. It
  shows a "take it" button. Whoever takes it gets their name on it, and the
  job shows on their side too.
- **Up to 3 open jobs** per person per channel at once.
- **Open jobs expire**, and the poster's level decides how long they stay
  up: **1 day at the start**, longer as the poster levels up (e.g. level 5 →
  3 days, level 10 → 7 days). The time left is shown on the job, and it
  starts gathering dust as it nears the end.
- **Taken jobs never expire.** Once someone takes a job, it stays until the
  poster approves it or unvalidates it.
- **Expired jobs** go to the poster's history, marked expired.
- **Scoring:** a channel job counts under the poster's curve (section 6),
  with the same daily limit as any other job from them.

## 5. Coins and levels

- **One currency: coins.**
- **Two numbers from it:**
  - **Earned (lifetime)** sets your **level**. Spending never lowers it.
  - **Balance** is what you can spend.
- **Levels are public**: on your avatar, your cursor and in channel halls.
- **Coins buy** home and look: furniture, wallpaper, floors, board frames,
  extra rooms, a nicer portal, avatar clothes. Some items need a level before
  you can buy them (e.g. a bigger room at level 5).
- **Each level-up gives a free stat point.** Stats are never bought with
  coins, so decorating never costs you speed.

| Stat | What it changes |
|---|---|
| **Speed** | How fast you walk and run inside spaces |
| **Jump** | How high you jump: high shelves, rooftops, hidden spots in halls |
| **Glide** | Glide down from high places; later, a short flight |
| **Warp** | Faster travel; later, open the portal picker from anywhere (`P`) |
| **Reach** | Pin notes on a board from further away |

- **Abilities unlock at milestone levels:** Animate (cast on a note so it
  wiggles or glows for visitors), Lantern (your `doing` notes glow next to
  your name in channel halls), Summon (open a portal next to someone to invite
  them to your home).

## 6. Scoring rules

1. **Your own notes plateau each day:** each one you finish pays less than
   the last (10, 7, 5, 3, 2, 1, 1... coins).
2. **Each giver gets a fresh curve each day.** The first approved job from a
   person pays the most, then less.
3. **Daily limit per giver.** After a few approved jobs from the same person
   in a day (3 to start, to be tuned), their jobs still work but pay nothing
   that day.
4. **A new person starts a new curve.** Work from many different people pays
   best.
5. **Everything resets daily** (midnight, your time zone).
6. **Pay grows with how long a job was open**, up to a few hours, so
   give-and-approve in a minute pays almost nothing.
7. **New accounts' jobs pay less** until the account is a few days old and
   has notes of its own.
8. **No formula on screen.** You feel it instead: a bright coin burst for a
   fresh curve, a duller one as you plateau, and "B's jobs are done for
   today" at the limit.

## 7. Dust on neglected notes

- **Stages by days untouched:** 7 days → light dust; 14 → cobwebs; 30 →
  faded and curling. In 3D, the room dims a little the dustier your board is.
- **Touching a note cleans it** (moving, editing or changing its status).
- **Deleting a dusty note pays a few coins**, capped per day, and only for
  notes at least 7 days old.
- **Finishing a dusty note pays more** than deleting it (a comeback bonus),
  so finishing always beats deleting, and deleting beats ignoring.

## 8. History

- **A note is in one of three places:**
  1. **On the board:** `todo`, `doing`, or `done` and not cleared yet.
  2. **In the archive:** finished notes that someone has cleared off the
     board. **Notes only leave the board when someone clears them**; the
     board never rearranges itself.
  3. **In the bin:** deleted notes, kept for 30 days, then gone.
- **Clearing:** select notes and clear them, or "clear finished" to archive
  every finished note at once. They fade out on the board, or fly into the
  scrapbook in 3D.
- **The history view:** a panel (`T`), or a **scrapbook** on a shelf in 3D.
  - Grouped by day and week ("This week: 12 finished, 3 approved jobs, 2
    deleted").
  - Filters: finished, approved, deleted, expired.
  - Each entry shows the note, when it was made and finished, who gave and
    approved it, and what it paid.
  - **Restore** an archived or deleted note to its old position.
  - Search by text.
- **Who sees what:** everyone can see your **approved jobs** (they back your
  public level). Only you see your finished notes, deletions and the bin.

## 9. Day and night, photo mode

- **Day and night follow real time** in every space. In the portal picker,
  homes whose owner is online have their lights on.
- **Photo mode:** take a snapshot of your home (or a hall) to share outside
  the app.

## 10. Keys

The board already uses: arrows, Space, Enter, Delete/Backspace, Esc, `N`,
`H`, `V`/`1`, `L`, `+`/`-`/`0`, `!`, `?`, and Cmd/Ctrl + `A` `C` `X` `V`
`D` `=` `-` `0`. Shortcuts are ignored while typing in a note.

| Key | Where | Does |
|---|---|---|
| **`M`** | both | Toggle board ↔ 3D |
| `S` / Shift + `S` | board | Status forward / back |
| `J` | board | Mark the selected note as a job |
| `A` | board | Approve the selected job |
| `F` | board | Focus mode |
| `R` | board | Board replay |
| `T` | board | History |
| `W` `A` `S` `D` / arrows | 3D | Walk |
| Shift / Space | 3D | Sprint / jump |
| `E` | 3D | Focus the board you're at / interact |
| `I` | 3D | Inventory and decorating |
| `K` | 3D | Stats and abilities |
| `P` | 3D | Portal picker from anywhere (once Warp unlocks it) |

Not used: `Tab` (keyboard accessibility), backtick (a dead key on many
keyboards), Cmd/Ctrl + `E`/`B`/`M` (taken by browsers).

## 11. Demo accounts

Crit testers get a few minutes, but dust takes days and levels take weeks,
so the demo accounts arrive with a past.

- **Built on `seedDemo`** (`server/src/auth.ts:274`), which already creates
  `demo1` and `demo2` on every start. `demo1` / `demo2` keep their names and
  shared password because that's how markers log in.
- **The cast:**

| Account | Who they are | What a tester sees |
|---|---|---|
| `demo1` | The main showcase, ~level 6 | A busy board with `todo`, `doing` and `done` notes, notes at every dust stage, a job from `demo2` to approve, a furnished home, three weeks of history and replay |
| `demo2` | A friend, ~level 2 | A smaller board, a finished job from `demo1` waiting for *them* to approve, a mostly empty home |
| `demo3` | A long-time user, ~level 12 | A fully decorated home to visit, channel jobs that stay up for days |
| `demo4` | Brand new, level 1 | The starter home, tutorial jobs, a channel job a few hours from expiring |

- **A demo Town Square** with open jobs from different demo users, each with
  a different time left, plus one that just expired.
- **Believable history:** events spread over the past three weeks with real
  gaps (mornings, evenings, quiet weekends), with timestamps counted back from
  *now*, so dust stages are always right whenever the seed runs.
- **Resets:** the demo data is re-seeded on every deploy and every night,
  and a **"reset demo"** button (only on demo accounts) restores an account
  between testers.
- **Kept out of the real game:** demo accounts don't appear on leaderboards,
  and jobs between demo and real accounts pay nothing.
- **The seed grows with each build step**, so the demos always show what
  exists and never what doesn't yet.

## 12. Growing against the server

| Step | New load | Risk on 256 MB |
|---|---|---|
| Board features, history | An events table, a few columns | Low |
| Scoring | Reads over today's events | Low (index by user and time) |
| 3D home, solo | Nothing on the server | None |
| Travel and visits | Avatar positions in a space, ~10 updates/sec | Grows with people in one space |
| Channel halls | Many avatars in one hall | The real test |

- **One WebSocket room per space**, so you only get presence for people in
  the same space.
- **Send less:** ~10 updates/sec, smoothed on the client, nothing sent while
  standing still.
- **Measure before each step:** a script with fake clients walking around a
  hall while we watch memory and CPU on Fly; write the numbers down and set a
  per-hall cap before going further.

## 13. Data, roughly

- **Notes** gain: `status`, job fields (giver, taker, `expires_at` for open
  channel jobs), `archived_at`, `deleted_at`, `touched_at` (for dust).
- **`note_events`** (note, who, kind, before, after, time): one log that
  powers the timeline, replay, history, dust and scoring.
- **Scores are calculated from events**, with level and balance cached on
  the user, so scoring rules can change later without migrating data.
- **Homes:** owned items and where they're placed; stat points spent.

## 14. Build order

Each step ships on its own, with its part of the demo seed.

1. **The transition (next step):** your home with your board on the wall,
   the `M` toggle and animation, pause-then-dispose, the URLs.
2. **Travel:** click a note's owner to go to their home, then the portal.
3. **Board features and history:** status, `doing` pin, jobs, approve and
   unvalidate, focus mode, archive, bin, restore, timeline, replay, keys.
4. **Coins and levels:** events, scoring rules, public levels, stat points.
5. **Channels and the job board**, with the Town Square.
6. **Dust and decorating.**
7. **Day and night, photo mode.**
8. **Server measurements, then busier halls.**

Steps 3–5 don't depend on 3D, so they can move earlier if the transition
takes longer than expected.
