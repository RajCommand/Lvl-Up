#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "src-tauri", "levelup.png");
const OUT_DIR = join(ROOT, "src-tauri", "icons");

if (!existsSync(SOURCE)) {
  console.error("Missing icon source at:", SOURCE);
  console.error("Expected file: projectv1/src-tauri/levelup.png");
  process.exit(1);
}

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "pwa-asset-generator",
  SOURCE,
  OUT_DIR,
  "--opaque",
  "--favicon",
  "--type",
  "png",
  "--override",
  "--no-manifest",
];

const before = new Set(readdirSync(OUT_DIR));
const result = spawnSync(cmd, args, { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const after = readdirSync(OUT_DIR);
const created = after.filter((name) => !before.has(name)).length;

console.log(`Generated ${created} files in ${OUT_DIR}`);
