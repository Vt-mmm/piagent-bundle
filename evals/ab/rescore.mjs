#!/usr/bin/env node
// Recomputes the event-derived fields of every run from its events.jsonl (the pass/fail judgement is kept) and
// writes <out>/results.final.jsonl, so an analyzer fix applies to runs made before it.
//   node evals/ab/rescore.mjs <out>
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from './run.mjs';

const out = process.argv[2];
const lines = [];
for (const name of fs.readdirSync(path.join(out, 'work')).sort()) {
  const dir = path.join(out, 'work', name);
  if (!fs.existsSync(path.join(dir, 'result.json'))) continue;
  const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
  const events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean);
  const stats = analyze(events, c => />|tee |sed -i|rm |mv |cp /.test(c.replace(/\d?>&\d|[0-9&]?>\s*\/dev\/null/g, '')));
  lines.push(JSON.stringify({ ...result, ...stats }));
}
fs.writeFileSync(path.join(out, 'results.final.jsonl'), `${lines.join('\n')}\n`);
console.log(`${lines.length} runs`);
