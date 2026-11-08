#!/usr/bin/env node
// pnpm docs:version <id> "<label>" "<what changed>"
//
// Freezes the current /docs/ as a named version, the way Docusaurus's
// `docs:version` does. The previous current version is copied into
// docs/site/versions/<its id>/ and the new id becomes the current one at
// /docs/. Run it when a release ships (after a merge into main that changes
// what users can do).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "docs/site";
const FILE = join(SITE, "versions.json");

type Version = { id: string; label: string; date?: string; note?: string };

const [id, label, note] = process.argv.slice(2);
if (!id || !/^[\w.-]+$/.test(id) || !label) {
  console.error('usage: pnpm docs:version <id> "<label>" "<what changed>"   e.g. v1.1 "1.1" "Note sidebar"');
  process.exit(2);
}

const versions: Version[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
if (versions.some((v) => v.id === id)) {
  console.error(`${id} already exists in ${FILE}`);
  process.exit(1);
}

// freeze the outgoing current version: every page folder, not versions/ or assets
const outgoing = versions[0];
if (outgoing) {
  const dest = join(SITE, "versions", outgoing.id);
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(SITE)) {
    if (name === "versions" || name === "versions.json" || name.endsWith(".css")) continue;
    cpSync(join(SITE, name), join(dest, name), { recursive: true });
  }
  outgoing.label = outgoing.label.replace(/\s*\(current\)$/, "");
  console.log(`froze ${outgoing.id} into ${dest}`);
}

versions.unshift({ id, label: `${label} (current)`, date: new Date().toISOString().slice(0, 10), note: note ?? "" });
writeFileSync(FILE, `${JSON.stringify(versions, null, 2)}\n`);
console.log(`${id} is now the current version at /docs/`);
