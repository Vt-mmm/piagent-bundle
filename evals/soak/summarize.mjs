#!/usr/bin/env node
// Prints one line per finished scenario of a soak work dir (the `--work` given to start.mjs), plus the run in progress.
//   node evals/soak/summarize.mjs <work>
import fs from 'node:fs';
import path from 'node:path';

const work = process.argv[2];
const runs = path.join(work, 'soak', 'runs');
for (const stamp of fs.readdirSync(runs).sort()) {
  for (const name of fs.readdirSync(path.join(runs, stamp)).sort()) {
    const dir = path.join(runs, stamp, name);
    const events = fs.existsSync(path.join(dir, 'events.jsonl')) ? fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    const count = type => events.filter(e => e.type === type).length;
    const last = events.at(-1)?.t ?? 0;
    const result = fs.existsSync(path.join(dir, 'result.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')) : null;
    console.log(JSON.stringify({ run: name, state: result ? result.verdict : 'running', minutes: result?.minutes ?? Number((last / 60000).toFixed(1)), phases: result?.phases ?? null,
      compactions: count('compaction'), memberMessages: count('member_message'), memberActions: events.filter(e => e.type === 'member_action').map(e => e.do), stalls: count('stall'), crashes: count('crash'), stats: result?.stats ?? null, defects: result?.defects ?? null }));
  }
}
