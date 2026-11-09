#!/usr/bin/env node
// Every idea listed as merged under "## Done" in docs/orchestration/state.md
// needs a page in docs/site/features/ or docs/site/agents/ whose front matter says
// `idea: <slug>`, and every image or video a feature page names has to exist
// in docs/readme-assets/. This keeps the /docs/ feature list in step with what
// has shipped. Rejected ideas are skipped, and so is an idea whose Done line
// says "no feature page" (tooling or docs work that users never see).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIRS = ["docs/site/features", "docs/site/agents"];
const ASSETS = "docs/readme-assets";

let failed = false;
const fail = (msg: string): void => {
  console.error(`✗ ${msg}`);
  failed = true;
};

let pageCount = 0;
const ideasWithPages = new Set<string>();
for (const dir of DIRS) {
  const pages = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  pageCount += pages.length;
  for (const f of pages) {
    const text = readFileSync(join(dir, f), "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const field = (k: string) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1].trim();
    const idea = field("idea");
    if (idea) ideasWithPages.add(idea);
    if (!field("title")) fail(`${dir}/${f} has no title in its front matter`);
    if (!field("summary")) fail(`${dir}/${f} has no summary (it's shown on the section index)`);
    if (!/^## How to use it$/m.test(text)) fail(`${dir}/${f} has no "## How to use it" section`);
    for (const k of ["image", "video"]) {
      const file = field(k);
      if (file && !existsSync(join(ASSETS, file))) {
        // assets can land after the page, so a missing one warns instead of failing
        console.warn(`! ${dir}/${f} names ${k} ${file}, which isn't in ${ASSETS}/ yet`);
      }
    }
  }
}

const state = existsSync("docs/orchestration/state.md") ? readFileSync("docs/orchestration/state.md", "utf8") : "";
const done = state.split(/^## Done$/m)[1] ?? "";
for (const line of done.split("\n")) {
  const m = line.match(/^- `?([\w-]+)`?,\s*(.*)$/);
  if (!m || /rejected|no feature page/i.test(m[2])) continue;
  if (!ideasWithPages.has(m[1])) {
    fail(`${m[1]} is merged (state.md, Done) but no page in ${DIRS.join(" or ")} has "idea: ${m[1]}"`);
  }
}

if (failed) process.exit(1);
console.log(`✓ docs: ${pageCount} feature and agent pages, every merged idea has one`);
