# The retro steers the next session

## What I took from the reading

Two things from my reading matched what happened in this project. First, a
retrospective matters because it steers where the next session goes. Second,
a pile of other people's skills does not help much until you make them your
own.

## A retro is a message to the next session

Treude and Baltes (2026) study Matt Pocock's `/retro` skill. At the end of a
session, the agent looks back at its environment and proposes changes to its
own harness, such as a line in `CLAUDE.md`. They ran it on 30 SWE-bench
Verified issues and got 125 proposals. Most of them (101) came from something
that really happened in the session.

The part I care about is what happened next. Later sessions loaded the
changes every time, so a retro really does steer the next session. When the
change matched the problem, it worked: a two-line `CLAUDE.md` note naming the
right test command took wasted test attempts from 5 of 5 sessions to 0 of 5.
When the change did not match, it did nothing or even added work. The
authors' point is that a change has to be checked on later tasks and removed
if it does not help.

Shinn et al. (2023) show the same idea earlier, in Reflexion. After a failed
try, the agent writes a short reflection in plain words and keeps it in
memory, and the next try reads it. That written note, not new training, is
what made the next attempt better.

This is why my reflect stage now runs `/retro` first. It is the last thing an
idea does, and its output is the first thing the next idea reads. I also try
to keep only the changes that a later idea shows are useful.

## Skills only help when they are yours

A post by Addy Osmani (2026), "You're probably overprompting Claude", said
what I felt. His point is that newer models need less instruction than most
of us still give them. He suggests an experiment: remove some of your
instructions, then add back only the ones the model misses. He also says to
"audit how you work" every few months, so you are not building for how older
models used to work.

That matched my experience. There are already so many skills out there, and
I installed and read a lot of them, but none of them were personal, and
almost none of them got into a pull request. Piling them up was the
overprompting he describes. What worked was to sit down, try them, and keep
only what I actually needed in my own pipeline. Once I wrote my own roles
and scripts, the work started moving.

He also warns that parallel sessions "only pay off once a single session can
finish without you". This is a fair check on my pipeline, which runs several
roles side by side. It only works because each role has a clear goal and a
check it can run on its own, and because I step in only at the taste gates.

Wang et al. (2023) show a similar thing with Voyager, an agent that plays
Minecraft. It does not start with a fixed set of skills. It writes its own
skills as code, tests them, keeps the ones that work, and builds new skills
on top of old ones. Its skill library grows from its own experience, so it
fits the problems it actually meets.

My pipeline grew the same way. Each skill and role came from a problem I hit:
`mise exec` after agents could not find Node, session resume after a Herdr
restart, and `/retro` after reflection kept looking at the code instead of
the setup.

## What I take from this

A setup works best when it is personal and when it learns from each session.
Borrowed skills are a good place to start, but they need to become your own.
A retro is how the setup keeps learning, as long as I check that its changes
really help.

## References

- Osmani, A. (2026). *You're probably overprompting Claude.* Post on X.
  https://x.com/addyosmani/status/2115688494865465370
- Pocock, M. (2026). *Skills for Real Engineers.*
  https://github.com/mattpocock/skills
- Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., & Yao, S.
  (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning.*
  arXiv:2303.11366. https://arxiv.org/abs/2303.11366
- Treude, C., & Baltes, S. (2026). *How Do Coding-Agent Harnesses Self-Evolve?
  An Empirical Study of Retrospective Adaptation.* arXiv:2610.34938.
  https://arxiv.org/abs/2610.34938
- Wang, G., Xie, Y., Jiang, Y., Mandlekar, A., Xiao, C., Zhu, Y., Fan, L., &
  Anandkumar, A. (2023). *Voyager: An Open-Ended Embodied Agent with Large
  Language Models.* arXiv:2305.16291. https://arxiv.org/abs/2305.16291
