---
title: Roles
order: 3
---

# Roles

Each role is a Claude Code session with its own instruction file in `.claude/skills/orchestrate-postits/roles/`. The reviewer runs on a different model from the builder and never saw the build, so it judges only from the brief, the diff, the running app and my taste.

| Role | Model | Works in | Does | Never does |
|---|---|---|---|---|
| Main orchestrator | Opus | root, on `main` | starts ideas, watches across them, keeps `state.md`, runs reflection | edit app code |
| Lead | Opus | first tab of the idea's workspace | runs one idea's stages, spawns its workers, hosts decide and `/taste` | edit app code |
| Researcher | Opus | idea worktree, documents only | finds evidence and proposes 2–3 shapes | write code, cite a page it didn't open |
| Decider | Opus (usually the lead) | idea worktree, documents only | grills my pick until it holds | pick for me |
| Spiker | Sonnet | spike worktree | builds the fastest clickable version | write tests or polish, merge |
| Builder | Sonnet | idea worktree | implements the brief with tests, commits | merge, push, rebase, leave the brief |
| Reviewer | Opus | idea worktree, new tab | checks the branch, drives the app, drafts the feature's docs page | edit app code |
| Asset maker | Codex | idea worktree | generates illustrations for the docs and README | write app code |

## How agents hand over

Each worker writes one report file that starts with a token unique to that round, so a late report from an earlier round is never mistaken for the current one:

```
token: 3f9a1c0b2e7d
status: done            (a reviewer writes verdict: approve | changes | blocked)
head: <commit SHA>
summary: one to three lines
ask: a question, or none
```
