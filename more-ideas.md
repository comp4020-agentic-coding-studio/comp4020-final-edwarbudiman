# More ideas

A brainstorm on where Post-its goes after the minimal board. The world is
**separate spaces** (your home, each channel's hall) joined by **travel**,
and the simple board is a real mode that frees the 3D part from memory. The
file has three parts: **what's decided**, **the polished version of each
idea** (with what could go wrong), and **more ideas kept for later**.

## The shape, in one paragraph

Every user has a **home** and every channel has a **hall**, each a small 3D
space with an **announcement board** on the wall. Walk up to a board and
focus, and the camera glides into it until it *becomes* the flat canvas we
already built. Switch to the simple board and the 3D part is unloaded, so it
stops using memory. You travel between spaces through a **portal** ("where do
you want to go?") or by clicking the owner of a post-it to go to their home.
Channels are where people hang out, and each channel's board doubles as a
**job board** anyone there can take work from. Finishing work earns
**coins**, one currency: what you've earned in total sets your public
**level** (each level gives a stat point), and what you spend buys furniture
and clothes. The decided parts are written up in `fixed-idea.md`.

## How we'll grow it

- **Little by little against the server.** One 256 MB Fly machine. Every
  step adds load, so each step gets measured before the next. See section 9.
- **Make sure people enjoy it.** Each step gets tried by real people (the pod
  first) before we build on top of it.

---

## Decided so far

| Topic | Decision |
|---|---|
| Simple board | Always available. Switching to it **unloads** the 3D world to save memory and processing, **after one minute** on the board. |
| World layout | **No open neighbourhood.** One 3D space per user (home) and per channel (hall). |
| Travel | Through a **portal** that asks where to go, or by **clicking a post-it's owner** to go to their home. The URL changes and there's a travel animation. |
| Channels | Spaces where people hang out, each with a board you can post to. |
| Job board | **Yes**, in channels: post a job there and anyone in the channel can take it. |
| Rewards | **One currency (coins) for now.** Finished jobs do **not** turn into furniture. A split into two currencies may come back later. |
| Levels | **Public.** |
| Pair wear-out | Resets **daily**, with a **daily limit** on jobs from the same person (exact number decided later). |
| Dust | **Yes.** Old untouched notes gather dust; deleting one gives a small reward. |
| History | Archive and bin. Finished notes leave the board **only when someone clears them**. Approved jobs are public; the rest is private. |
| Visiting | **Open homes:** anyone can travel to anyone's home, like visiting boards today. |
| Stats | **A free stat point per level.** Coins are for home and clothes only. |
| Channel jobs | **Open jobs expire:** 1 day at the start, longer the higher the poster's level. **Taken jobs never expire**; they end when the poster approves or unvalidates them. |
| Toggle key | **`M`** for board ↔ 3D. |
| Demo accounts | **Seeded demo accounts** that already show history, dust, jobs and levels (section 12). |
| From my ideas | **Day and night** and **photo mode** first; the rest kept for later. |
| Next step | Transition from the board into the 3D world. |

---

## 1. Simple board vs 3D: actually freeing memory

**The idea.** The simple board isn't just "3D hidden". Switching to it should
give the memory and processing back.

**What could go wrong.**
- **Pausing isn't freeing.** A paused three.js scene still holds its
  textures, models and the WebGL context in memory. Only *disposing* it gives
  memory back.
- **Disposing means reloading.** If we throw everything away, switching back
  to 3D takes a moment to load again. Toggle quickly back and forth and it'll
  feel slow.
- **Browsers limit WebGL contexts.** Creating a new one on every toggle can
  hit that limit and lose the context.

**The polished version.**
- **Two levels of "off":**
  1. *Just switched to the board:* the 3D scene is paused (render loop
     stopped, no CPU or GPU work), so toggling straight back is instant.
  2. *After one minute on the board:* the scene is **disposed**:
     geometries, textures, materials and the renderer are released and the
     3D code's memory can be garbage-collected.
- **Reloading stays fast.** Models and textures come back from the browser's
  HTTP cache, so a reload after dispose is quick. A loading moment hides
  behind the travel animation.
- **One renderer, reused.** While 3D is alive, travelling between spaces
  swaps the scene, not the renderer, so we never stack up WebGL contexts.
- **A "simple mode" setting.** A preference to always open on the simple
  board, for slow laptops and phones. On phones it's the only mode.
- **Measure it.** Note the tab's memory (Chrome's task manager) in four
  states: board only, 3D running, 3D paused, 3D disposed. If disposing
  doesn't clearly drop memory, we've got a leak to fix.

---

## 2. Spaces and travel (portals, owner links, URLs)

**The idea.** Each user has a home and each channel a hall. You travel
between them rather than running through a shared world.

**What could go wrong.**
- **Speed loses its purpose.** Without a big world, faster walking matters
  less. (See section 3 for how stats change.)
- **The portal could become a boring menu.** If travel is just a dropdown, the
  3D adds nothing.
- **The URL and the animation can fight.** Pressing the browser's back
  button mid-animation, or opening a link straight into 3D, needs to work.
- **Small spaces can feel empty.** A home with one person in it is quiet.

**The polished version.**
- **URLs** (each one is both the board and the space; the view is a mode):

| URL | Board view | 3D view |
|---|---|---|
| `/` | your board | your home |
| `/<username>` | their board | their home |
| `/c/<channel>` | channel board | channel hall |

  The 3D/board mode is remembered per person (and can be set with
  `?view=3d` for sharing a link). Travelling pushes a new URL, so the back
  button travels back.
- **Ways to travel:**
  - **The portal.** A doorway in every space. Walk into it and a picker
    opens: your home, channels you're in, people you've been with recently,
    with who's online shown live. Pick one and you go through.
  - **Click a post-it's owner.** Every note shows who wrote it; click their
    name or avatar to travel to their home. Works from the board too: it
    changes the URL and plays the travel animation if you're in 3D, or just
    switches boards if you're on the simple board.
  - **Follow a person.** Clicking someone's live cursor to follow them
    already exists; if they travel, you go with them.
- **The travel animation:** a short one (under a second): you step into the
  portal, a paper-fold wipe, and you're standing at the other space's portal.
  The next space's data loads during the wipe.
- **Load is naturally split.** Each space is its own WebSocket room, so you
  only get presence for people in the same space. This is lighter on the
  server than the open neighbourhood would have been.

---

## 3. Rewards: one currency

**The idea.** Keep it simple for now: everything pays **coins**, and coins
buy everything.

**What could go wrong.**
- **Spending would lower your level.** If your public level is your coin
  balance, buying a sofa makes you look less accomplished, so nobody spends.
- **Furniture and upgrades compete.** Every coin on a lamp is a coin not on
  Speed. That can be a good choice to make, or a frustrating one.

**The polished version.**
- **Two numbers from one currency:**
  - **Earned (lifetime)** → your public **level**. Spending never lowers it.
  - **Balance** → what you can spend right now.
- **Coins mean home, level means avatar:**
  - **Coins buy** home and look: furniture, wallpaper, floors, board frames,
    extra rooms, a nicer portal, avatar clothes.
  - **Each level-up gives a free stat point** to spend on the stats below.
    Stats are never bought with coins, so decorating never costs you speed.
- **Some purchases need a level** (e.g. a bigger room needs level 5), so the
  public level still means something in the shop.
- **Room to split later.** Because scores are calculated from the events
  table (section 8), we can introduce a second currency later (e.g. XP for
  jobs) and recalculate everyone's history without losing anything.

**Stats, adjusted for separate spaces.** Since there's no big world, stats
should matter *inside* spaces and in travel:

| Stat | What it changes |
|---|---|
| **Speed** | Walk and run faster inside spaces; channel halls get big as they grow, so it matters there |
| **Jump** | Reach high shelves, rooftops and hidden spots in halls |
| **Glide** | Glide down from high places; later, a short flight |
| **Warp** | Faster travel animation, and later travel straight from anywhere without walking to the portal |
| **Reach** | Pin notes on a board from further away |

**Abilities at milestone levels:** Animate spell (make a note wiggle or
glow for visitors), Lantern (your `doing` notes glow in the channel hall next
to your name), Summon (invite someone to your home with a portal that opens
next to them).

**A caution:** with separate spaces, stats are the weakest part of the
design. Speed and Jump only matter if halls are big and interesting. If they
stay small, abilities (Animate, Lantern, Summon) are where levels actually
feel good, and stats should be mostly for fun.

---

## 4. Visiting: open homes

**Decided:** anyone can travel to anyone's home, the same way anyone can
visit a board today. Board access rules (public / key / list) already exist
and apply to the home too: if you can't see someone's board, you can't enter
their home.

**Kept for later:**
- **Doorbell.** Visitors arrive at your doorstep and knock; your board is
  view-only until you let them in. More private, more like a real visit.
- **Visit rewards.** The first visit each day to a *different* home pays
  both of you a coin. Worth adding if travel feels pointless in testing;
  tiny and per different home per day, so it can't be farmed much.

---

## 5. Channels and the job board

**The idea.** Channels are hangout spaces with a board; jobs can be posted
there for anyone in the channel.

**What could go wrong.**
- **Who's allowed in?** Public channels can attract spam; private ones need
  invites.
- **Spam jobs.** If posting a job is free, someone fills the board with
  junk.
- **The poster vanishes.** Normally the poster approves a channel job, but
  they might never come back.
- **Fake curves.** A job from a channel still comes from one person, so it
  shouldn't bypass the daily limit.

**The polished version.**
- **Channels use what's already in the schema:** boards already have a
  `channel` kind, visibility (public / key / list) and access rules. A
  channel is a board plus a hall.
- **One default public channel, the Town Square**, so a new user has
  somewhere with people from minute one.
- **Posting a job in a channel:** mark the note as an open job. It shows a
  "take it" button. Whoever takes it gets their name on it and the note
  becomes a job on their side too. The poster approves it as normal.
- **Limits:** each person can have a few open jobs per channel at once
  (3 to start).
- **Jobs expire, and level buys time.** A channel job stays up for a number
  of days that grows with the poster's level: **1 day at the start**, longer
  as you level up (e.g. level 5 → 3 days, level 10 → 7 days). This keeps the
  channel board fresh, stops low-level spam from piling up, and gives levels
  a useful perk beyond the avatar.
- **The countdown is visible.** A job shows how long it has left, and
  starts gathering dust as it nears the end, so expiry never surprises
  anyone.
- **Only open jobs expire.** Once someone takes a job, it never expires.
  It stays until the poster approves it, or the poster unvalidates it
  (rejects it), which ends it without pay.
- **Expired jobs** go to the poster's history, marked expired.
- **Scoring:** channel jobs count under the poster's curve, same daily
  limit. The channel is just where the job was posted.
- **Hanging out:** the hall shows everyone who's in the channel live, with
  their level and what they're `doing` right now. The board is the shared
  space; no separate chat box needed for now.

---

## 6. History, reorganised

**The idea.** Finished and deleted post-its need a proper home, not just a
timeline on each note.

**What could go wrong.**
- **Finished notes clutter the board.** If `done` notes stay forever, the
  board fills up again, which is the problem the app exists to fix.
- **Deleted means gone.** Right now deleting removes the note. With history
  we need it kept, but out of the way.
- **Privacy.** Levels are public, but your deleted notes shouldn't be.

**The polished version.**
- **Three places a note can be:**
  1. **On the board:** `todo`, `doing`, or `done` and not yet cleared.
  2. **In the archive:** finished (`done` or `approved`) notes that someone
     has cleared off the board. Nothing leaves the board on its own: your
     finished notes stay where you put them until you clear them, so the
     board never rearranges itself behind your back.
  3. **In the bin:** deleted notes, kept for 30 days, then gone for good.
- **Clearing is quick.** Select notes and clear them, or a "clear finished"
  button that archives every finished note on the board in one go. Notes fly
  off into the scrapbook (in 3D) or fade out (on the board).
- **The history view** (a panel, `T` key, or in 3D a **scrapbook** on a
  shelf you can open):
  - Grouped by day and week: "This week: 12 finished, 3 approved jobs, 2
    deleted".
  - Filter: finished / approved / deleted / dusty-then-deleted.
  - Each entry shows the note, when it was made and finished, who gave and
    approved it, and how much it paid.
  - **Restore:** put an archived or deleted note back on the board, at its
    old position if that spot is free.
  - Search by text.
- **Who can see what:**
  - **Everyone** can see your approved jobs (that's what backs your public
    level, so it's the honest flex).
  - **Only you** see your own finished notes, deletions and the bin.
- **Per-note timeline stays** (open it from the note's corner), and the
  **board replay** slider still shows the board over time, including notes
  that were later archived or deleted.

---

## 7. Dust on neglected notes

- **Stages, by days untouched:** 7 days → light dust; 14 → cobwebs; 30 →
  faded and curling. In 3D, your home gets a little dimmer the dustier your
  board is. Touching a note cleans it.
- **Deleting a dusty note pays a few coins**, capped per day, only for notes
  at least 7 days old. Farming takes a week for pocket change.
- **Finishing a dusty note pays more than deleting it** (a "comeback"
  bonus), so *finish > delete > ignore*.
- Deleted dusty notes go to the bin like any other (section 6).

---

## 8. Scoring that's hard to fake

1. **Your own notes plateau each day:** 10, 7, 5, 3, 2, 1, 1... coins.
2. **Each giver gets a fresh curve each day:** first approved job from a
   person pays most, then less.
3. **Daily limit per person:** after a few approved jobs from the same person
   in a day (exact number decided later; 3 is a starting point), more still
   work as jobs but pay nothing that day.
4. **A new person starts a new curve.**
5. **Everything resets daily.**

Quiet extras:
- **Pay grows with how long a job was open**, up to a few hours, so instant
  give-and-approve pays almost nothing.
- **New accounts' jobs pay less** until the account is a few days old with
  its own notes.
- **No formula on screen**; a bright coin burst for a fresh curve, a duller
  one as you plateau, "B's jobs are done for today" at the limit.

Schema: a `note_events` table (note, who, kind, before, after, time) powers
history, replay, the archive and scoring. Scores are calculated from events,
so rules can change without migrating data.

---

## 9. Pushing the server, little by little

| Step | New load | Risk on 256 MB |
|---|---|---|
| Canvas work features, history | Events table, a few columns | Low |
| Scoring | Reads over today's events | Low (index by user and time) |
| 3D home, solo | Nothing on the server (all in the browser) | None |
| Travel and visits | Avatar positions per space, ~10 updates/sec | Grows with people in one space |
| Channel halls | Many avatars in one hall | The real test |

- **One WebSocket room per space**, so presence only goes to people in the
  same space.
- **Send less:** ~10 updates/sec, smoothed on the client, nothing while
  standing still.
- **Measure before each step:** a script with fake clients walking around one
  hall, watching memory and CPU on Fly. Write down the numbers and set a cap
  per hall (e.g. "up to N people in one hall") before going further.

---

## 10. Keys that don't conflict

The canvas already uses: arrows, Space, Enter, Delete/Backspace, Esc, `N`,
`H`, `V`/`1`, `L`, `+`/`-`/`0`, `!`, `?`, and Cmd/Ctrl + `A` `C` `X` `V`
`D` `=` `-` `0`. Shortcuts are ignored while typing.

| Key | Where | Does |
|---|---|---|
| **`M`** | both | **Toggle board ↔ 3D** |
| `P` | 3D | Open the portal picker from anywhere (once Warp is unlocked) |
| `E` | 3D | Focus the board you're at / interact |
| `W` `A` `S` `D` | 3D | Walk (arrows too) |
| Shift / Space | 3D | Sprint / jump |
| `I` / `K` | 3D | Inventory and decorating / stats and skills |
| `S`, Shift + `S` | board | Status forward / back |
| `J` | board | Mark as a job (on someone's board or in a channel) |
| `A` | board | Approve the selected job |
| `F` | board | Focus mode |
| `R` | board | Board replay |
| `T` | board | History / timeline |

Avoided: `Tab` (keyboard accessibility), backtick (dead key on many
keyboards), Cmd/Ctrl + `E`/`B`/`M` (taken by browsers). There's always a
visible button too.

---

## 11. More ideas

**Chosen first: day and night (5) and photo mode (8).** The rest are kept for
later.

1. **Paper planes.** When someone gives you a job, a paper plane flies in
   through your home's window and pins itself to your board. *Why:* giving a
   job feels like sending something. *Risk:* none, an animation.
2. **A mailbox by your portal** with a flag up when you have new jobs.
   *Why:* visible the moment you arrive home. *Risk:* none.
3. **Claps.** Visitors can clap a finished note (no points, a small counter
   and sound). *Why:* recognition that isn't a grind. *Risk:* none.
4. **Co-op jobs.** One channel job taken by two people; both get a bonus
   when both finish. *Why:* gets people meeting in halls. *Risk:* more rules;
   later.
5. **Day and night follow real time** in every space, and the portal picker
   shows homes with their lights on when their owner is online. *Why:* see
   who's around at a glance. *Risk:* low.
6. **Ghosts in the replay.** In 3D, the replay shows faint ghosts of who
   visited your home and when. *Why:* "you weren't alone this week". *Risk:*
   storage; keep only visits, not every step.
7. **Channel leaderboard by people helped**, not by coins: "most different
   people helped this week" on the hall wall. *Why:* rewards being useful to
   many. *Risk:* same names every week in small channels.
8. **Photo mode.** Snapshot your home to share outside the app. *Why:*
   flexing that reaches new people. *Risk:* low.
9. **Home as a portal preview.** The portal picker shows a tiny live
   thumbnail of each home, so decorating is visible before anyone even
   visits. *Why:* gives coins and furniture a reason to exist even if visits
   are rare. *Risk:* rendering thumbnails; could be a saved snapshot instead.
10. **A town crier (uses our API budget).** An NPC in the Town Square that
    reads out new open jobs and today's notable finishes, written by Claude
    from the events. *Why:* the hall feels alive with few people online.
    *Risk:* cost and moderation; strictly later and optional.

**A caution for testing:** public levels, dust and daily limits together are
a lot of pressure for a notes app. The first test with the pod should ask
directly: *does this make you want to use it, or does it make you feel
watched?*

---

## 12. Demo accounts

**The idea.** Crit testers get a few minutes. Dust takes 7+ days, levels take
weeks, history needs a past. So the demo accounts arrive with all of that
already there.

**What could go wrong.**
- **Testers change things.** Ten people logging into `demo1` will clear,
  delete and move everything, and the next tester sees a mess.
- **Fake history looks fake.** If every note was "created" at the same
  second, the replay and the dust stages look wrong.
- **Demo accounts mustn't skew the real game.** They shouldn't top a
  leaderboard or give real users easy fresh curves.
- **The markers' login has to keep working.** `demo1` / `demo2` with the
  shared password are how markers get in, so those names stay.

**The polished version.**
- **Built on what exists.** `seedDemo` (`server/src/auth.ts:274`) already
  creates `demo1` and `demo2` on every start. It grows into a full demo seed:
  users, notes, backdated events, a channel and a decorated home.
- **The cast** (all `is_demo`, same shared password):

| Account | Who they are | What a tester sees |
|---|---|---|
| `demo1` | The main showcase, mid-level (~level 6) | A busy board: `todo`, `doing` and `done` notes; notes at every dust stage (7, 14, 30 days); a job from `demo2` waiting for approval; a furnished home; a full history with a replay that covers 3 weeks |
| `demo2` | A friend, lower level (~level 2) | A smaller board, a finished job from `demo1` waiting for *them* to approve (so a tester can do an approval in seconds), a mostly empty home |
| `demo3` | A long-time user, high level (~level 12) | A fully decorated home to visit (the flex), long-lived channel jobs (shows level buying time) |
| `demo4` | Brand new (level 1) | The starter experience: starter home, tutorial jobs, a channel job about to expire in hours |

- **A demo channel:** the Town Square with a few open jobs from different
  demo users, each with a different time left, and one that has just
  expired (shows in history).
- **Believable history.** The seed writes `note_events` spread over the past
  three weeks with realistic gaps (mornings and evenings, quiet weekends), so
  the replay plays like a real board and dust stages land correctly.
  Timestamps are relative to *now*, so the dust is always right whenever the
  seed runs.
- **Reset, so every tester gets the same start:**
  - The demo world is re-seeded **on every deploy** and **every night**.
  - A small **"reset demo"** button, only visible on demo accounts, puts the
    account back to its seeded state, so you can reset between testers at the
    crit.
- **Kept out of the real game.** Demo accounts don't appear on leaderboards,
  and jobs between demo and real accounts pay nothing (so nobody farms the
  demos).
- **Day and night:** the seeded homes look best at different times, so photo
  mode on `demo3`'s home is a ready-made screenshot for the README.

---

## Suggested order (each step ships on its own)

1. **The transition** (sections 1–2): your home with your board on the wall,
   `M` toggle, pause-then-dispose, URLs. Next step, as decided.
2. **Travel:** clicking a note's owner to go to their home, then the portal
   picker.
3. **Canvas work features and history** (section 6): status, jobs, approval,
   archive, bin, restore, keys.
4. **Rewards and scoring** (sections 3, 8): events, coins, public levels.
5. **Channels and the job board** (section 5), with the Town Square.
6. **Dust** (section 7) and **decorating**.
7. **Day and night, photo mode** (section 11).
8. **Server measurements, then busier halls** (section 9).
9. **More ideas** from section 11 that survive the pod.

Steps 3–5 don't depend on 3D, so they can move earlier if the transition
takes longer than expected.

**Demo seed grows with every step** (section 12): each step adds its part
to the demo accounts in the same change (e.g. step 3 seeds history, step 6
seeds dust), so the demos always show everything that exists, and never
something that doesn't yet.
