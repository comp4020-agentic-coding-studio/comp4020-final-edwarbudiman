# The harness, not the model: why good agentic practice needs sensors on itself

## Position

Good agentic software development is now decided less by which model you run
than by the harness around it, and most of a harness's value lies in its
sensors rather than its guides. The practice the field is moving towards puts
sensors on the harness itself: a retrospective after each session that asks
what in the environment failed. But the current evidence says such
retrospectives only help when their changes are themselves tested, so
retrospection without evaluation is the next thing practitioners will have to
fix.

## Harness over model

Böckeler (2026) gives the vocabulary. A harness is everything around the model:
*guides* that steer it before it acts (system prompts, `CLAUDE.md`, skills) and
*sensors* that let it observe the result (tests, linters, review agents). Her
central claim is that teams over-invest in guides and under-invest in sensors.
Osmani's observation that leading coding agents converge on the same harness
patterns despite different models points the same way: the competitive surface
has moved off the model.

The launch of DeepSeek Harness in August 2026 is a useful test of this claim.
Its design is "everything is a plugin": models, tools, loops and UI are all
swappable (DeepSeek, 2026). By the guides-and-sensors account that openness
should be an advantage, and Winder.ai's (2026) comparison grants it that. Yet
the same comparison, and the repository's own warning of
"compatibility-breaking changes", describe a system where nothing is stable
yet. A harness is an engineering artefact, and freeCodeCamp's explainer makes
the point plainly: whether an agent recovers from a failed tool call or loops on
it is a harness decision, not a model one. Composability is a property you can
only use once the composed parts hold still. The counter-case is real: a closed,
stable harness like Claude Code limits what you can change. But for a
practitioner the order matters: stability first, openness second.

## Packaged practice as guides

The practitioner literature's answer to "how do I steer the agent well" is
increasingly packaged workflows. Matt Pocock's skills (2026) ship a `grill-me`
skill that interrogates a plan before any code is written; Lauren Tan's pstack
(2026) ships playbooks, principle skills and per-role model budgets. These are
guides in Böckeler's sense, and good ones, but they share a limit: a guide
cannot tell you when it has stopped working. Running several agent sessions in
parallel, as terminal multiplexers like Herdr encourage, sharpens this. A
person cannot read every pane, so whatever is not caught by a sensor is simply
not caught.

## Retrospection as a sensor on the harness

Pocock's `/retro` skill (AI Hero, 2026) is the clearest practitioner attempt to
close that gap. Rather than reviewing the code, it reviews the environment:
could the agent find the right files, would an automated check have caught its
mistake, which `CLAUDE.md` lines changed nothing. It is a sensor whose object
is the harness. Böckeler names exactly this as an open problem: we have no
equivalent of code coverage for a harness.

Treude and Baltes (2026) give the first empirical look at it. Running `/retro`
after 30 SWE-bench Verified sessions produced 125 proposals, most of them
traceable to real events in the session, with executable checks the most common
kind. That supports the practice: retrospection does find real environmental
faults. But the evaluation is sobering. Of seven changes that could be
evaluated, two eliminated the targeted repeated action, one reduced it, and four
had no effect; one change added work on an unrelated issue, and only 9 of 38
proposed checks could actually fail as written. Successful changes were
repository-scoped facts, such as naming the test runner; failures were lists
tied to one session. Their conclusion is that self-evolution "needs ways to
establish whether a change helps".

## Where this leaves good practice

Read together, these sources argue for a specific discipline rather than a tool.
Prefer a stable harness over an open one until the open one stabilises. Treat
skills and `CLAUDE.md` as guides that decay. Run a retrospective after every
session, because the evidence says it surfaces real faults. Then do what
neither Pocock nor most practitioner writing yet asks for: keep only the
changes that are repository-scoped and checkable, and re-test them on later
work. The open question, which Böckeler and Treude and Baltes both leave
unanswered, is how to measure a harness well enough to know when to delete
from it.

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
