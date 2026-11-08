---
title: Asset maker
order: 10
tagline: Draws the illustrations for the README and these docs.
model: Codex
where: idea worktree, assets only
avatar: avatars/asset-maker.webp
---

# Asset maker

A Codex session in its own Herdr tab, given a short brief file. It generates the post-it illustrations and these role avatars in one shared style, and writes only into `docs/readme-assets/`.

## What it does

- Read the brief (`.claude/codex-*-brief.md`).
- Generate images in the shared style: post-it colours, paper texture, cute faces, no text.
- Convert them to WebP (`cwebp -q 80`, 1200px wide; avatars 320px) so the docs stay small.
- List the files with their sizes when done.

## What it never does

- Write app code.
- Fake an image with code.

## What it leaves behind

`docs/readme-assets/`
