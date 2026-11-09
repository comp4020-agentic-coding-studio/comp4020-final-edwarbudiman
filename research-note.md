# A retrospective is not enough: harness changes need tests

## Position

The harness around a coding agent now decides more than the model does. The
field answers this with retrospectives: after each session, the agent proposes
changes to its own harness. I argue that a retrospective is necessary but not
sufficient. Good practice keeps a harness change only when a later session
shows that it helps.

## The harness decides

Böckeler (2026) divides a harness into two parts. *Guides* steer the agent
before it acts, for example `CLAUDE.md` and skills. *Sensors* show the agent
the result of its work, for example tests and review agents. Her main claim is
that teams put too much work into guides and too little into sensors.

DeepSeek Harness is a good test of this claim. Its design rule is "everything
is a plugin" (DeepSeek, 2026). Winder.ai (2026) calls this openness an
advantage, but also says that no part of it is stable yet. freeCodeCamp
(2026) explains why stability matters: the harness, not the model, decides if
an agent recovers from a failed tool call or repeats it. Thus an open harness
is useful only when its parts are stable.

## Guides pile up

Practitioners now share guides as skills, for example Pocock's `grill-me`
(2026) and Tan's pstack (2026). One command installs a skill, so a local
harness fills with guides that nobody tests. A guide cannot tell you when it
stops working. Böckeler names the gap: no tool measures the coverage of a
harness.

My own project shows the same problem. I installed many skills after I read
about them on X. They stayed on my computer, and almost none of them got to a
pull request. More reading did not sort them. A process with sensors did: a
spike, my judgement, a review, and then a merge. Parallel agent sessions make
this more necessary, because one person cannot watch every session.

## A retrospective is a sensor on the harness

Pocock's `/retro` skill (AI Hero, 2026) is a direct attempt to close this
gap. It does not examine the code. It examines the environment. Could the
agent find the correct files? Could a check find its mistake? Which lines in
`CLAUDE.md` changed nothing?

Treude and Baltes (2026) give the first empirical data on `/retro`. After 30
SWE-bench Verified sessions, it made 125 proposals, and most came from real
events in the session. Thus a retrospective finds real faults. But the
results of the changes were weak. Of seven changes that the authors could
evaluate, two stopped the repeated action, one decreased it and four had no
effect. One change added work on a different issue. Only 9 of 38 proposed
checks could fail as written.

## The counter-case

A practitioner can say that a weak change costs little, so it is better to
keep every proposal. The data does not support this. Bundled instructions
sometimes made sessions longer, and a change from one issue added work on
another. Each guide that you keep costs tokens and attention in every later
session. The authors conclude that self-evolution "needs ways to establish
whether a change helps".

## Good practice

The changes that worked were facts about the repository, for example the name
of the test runner. The changes that failed were lists from one session. This
gives a clear rule. Run a retrospective after each session. Keep a change
only when it applies to the full repository and a check can test it. Then
test it again on a later session, and remove it when it does not help. The
open question is how to measure a harness well enough to make that decision
automatically.

## References

- AI Hero (2026). *The /retro Skill.* https://www.aihero.dev/skills-retro
- Böckeler, B. (2026). *Harness Engineering for Coding Agent Users.*
  martinfowler.com. https://martinfowler.com/articles/harness-engineering.html
- DeepSeek (2026, 13 August). *DeepSeek Harness v0.1 Developer Preview.*
  https://x.com/deepseek_ai/status/2087887408440164663
- freeCodeCamp (2026). *What Is an Agent Harness?*
  https://www.freecodecamp.org/news/what-is-an-agent-harness/
- Pocock, M. (2026). *Skills for Real Engineers.*
  https://github.com/mattpocock/skills
- Tan, L. (2026). *pstack.* Claude Code port:
  https://github.com/michael-denyer/pstack-claude
- Treude, C., & Baltes, S. (2026). *How Do Coding-Agent Harnesses Self-Evolve?
  An Empirical Study of Retrospective Adaptation.* arXiv:2610.34938.
  https://arxiv.org/abs/2610.34938
- Winder.ai (2026). *A Comparison of AI Agent Harnesses in 2026.*
  https://winder.ai/ai-agent-harness-comparison/
