#!/usr/bin/env node
// Rewrites bundle.pins.json to the head of each package's local clone:
//   node scripts/pin-heads.mjs provider=<clone> sandbox=<clone> harness=<clone>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bundle.pins.json');
const pins = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { pi: '1.3.0', packages: {} };
for (const arg of process.argv.slice(2)) {
  const [name, dir] = arg.split('=');
  const head = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error(`no commit in ${dir}`);
  pins.packages[name] = { repository: `https://github.com/Vt-mmm/piagent-${name}.git`, commit: head };
}
fs.writeFileSync(file, `${JSON.stringify(pins, null, 2)}\n`);
console.log(JSON.stringify(pins.packages, null, 2));
