# The harness, not the model: good agentic practice needs sensors on itself

## Position

In agentic software development, the harness around the model now decides
more than the model does. Most of the value of a harness is in its sensors,
not in its guides. The field now moves to put sensors on the harness itself.
The tool for this is a retrospective after each session. But the current
evidence shows that a retrospective helps only when you test its changes. Thus
the next problem for practitioners is to evaluate their retrospectives.

## The harness is more important than the model

Böckeler (2026) gives the words for this argument. A harness is all the parts
around the model. *Guides* steer the model before it acts. Examples are system
prompts, `CLAUDE.md` and skills. *Sensors* let the model see the result of its
work. Examples are tests, linters and review agents. Her main claim is that
teams put too much work into guides and too little into sensors. Osmani makes
a related point: the best coding agents use the same harness patterns, but
they use different models. Thus the competition is now in the harness, not in
the model.

DeepSeek Harness, released in August 2026, is a good test of this claim. Its
design rule is "everything is a plugin". You can replace the model, the tools,
the loop and the interface (DeepSeek, 2026). By Böckeler's account, this
openness is an advantage. Winder.ai (2026) agrees. But the same comparison
says that no part of it is stable yet. The repository also warns of
"compatibility-breaking changes". freeCodeCamp (2026) states the problem
clearly. The harness, not the model, decides if an agent recovers from a
failed tool call or repeats it. You can use an open design only when its parts
are stable. A closed harness such as Claude Code limits what you can change.
That cost is real. But for a practitioner, stability must come first and
openness second.

## Packaged practice is a guide

Practitioners now steer agents with packaged workflows. Pocock (2026) supplies
a `grill-me` skill. It asks hard questions about a plan before the agent
writes code. Tan (2026) supplies pstack. It has playbooks, principle skills
and a model budget for each role. These are good guides, but all guides have
one limit. A guide cannot tell you when it stops working.

Practitioner channels make this limit worse. New skills come each week from
posts on X and from skill registries. One command installs a skill. Thus the
local harness fills with guides that nobody shows to be useful. In my project,
most of these tests never got to a pull request. More reading did not sort
them. A workflow with sensors did: a spike that we discard, a judgement by the
owner, a review, and then a merge. Parallel agent sessions, for example in
Herdr, make sensors more necessary. One person cannot read every pane.

## A retrospective is a sensor on the harness

The `/retro` skill from Pocock (AI Hero, 2026) is a direct attempt to close
this gap. It does not examine the code. It examines the environment. It asks
these questions: Could the agent find the correct files? Could an automatic
check find its mistake? Which lines in `CLAUDE.md` changed nothing? Thus it is
a sensor whose object is the harness. Böckeler says that this is an open
problem: no tool measures the coverage of a harness.

Treude and Baltes (2026) give the first empirical data on `/retro`. They ran
it after 30 SWE-bench Verified sessions. It made 125 proposals. Most of them
came from real events in the session. Executable checks were the most common
type. This result supports the practice, because a retrospective finds real
faults. But the evaluation does not give strong support. The authors could
evaluate seven changes. Two changes stopped the repeated action. One change
decreased it. Four changes had no effect. One change added work on a
different issue. Only 9 of 38 proposed checks could fail as written. The
changes that worked were facts about the repository, for example the name of
the test runner. The changes that failed were lists from one session. The
authors conclude that self-evolution "needs ways to establish whether a
change helps".

## What good practice is

These sources together show a discipline, not a tool. Use a stable harness
until an open harness becomes stable. Think of skills and `CLAUDE.md` as
guides that become old. Do a retrospective after each session, because it
finds real faults. Then do a step that most practitioners do not do yet. Keep
only the changes that apply to the full repository and that a check can
test. Test them again on later work. Böckeler, Treude and Baltes do not
answer one question: how can we measure a harness? Without that measurement,
we cannot know when to remove a guide.

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
