# Brief: <feature>

<!-- Copy to .claude/orch/<feature>/brief.md and fill every section.
     A section you cannot fill means the feature is not ready to spawn. -->

## Goal

<!-- One paragraph: what the user can do after this ships, and why it matters
     for Post-its (README.md's "what good means"). -->

## Read first

<!-- Files the worker must read before planning: ADRs, the backlog
     checkpoint, specs, the modules it will change. -->

## Scope

- In: <!-- files and folders this feature may change -->
- Off limits: <!-- files other running features own, or that must not change -->

## Contract

<!-- Every route, request and response shape, WebSocket message, table and
     column this feature adds or changes, exactly as the code must name them.
     Write "none" if it changes no contract. Other features read this to see
     overlaps before they start. -->

## Acceptance

<!-- Checkable lines. Each one is a test, a command with expected output, or a
     step in the app with an expected result. -->

- [ ]
- [ ]

## Verification

<!-- The verify-postits feature file to drive (existing or one the builder
     adds), and any extra evidence the reviewer must capture. -->

## Out of scope

<!-- What the worker must not do even though it is nearby. -->
