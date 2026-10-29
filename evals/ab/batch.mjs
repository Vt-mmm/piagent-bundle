#!/usr/bin/env node
// Runs every task x rep for both arms, one run at a time, alternating arm order per rep so drift hits both.
//   BUNDLE=<dir> TS_DIR=<typescript dir> node evals/ab/batch.mjs --out <dir> [--reps 3] [--tasks t1-logic,t2-ts-type]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (i % 2 ? acc : [...acc, [v.replace(/^--/, ''), all[i + 1]]]), []));
const reps = Number(a.reps ?? 3);
const tasks = (a.tasks ?? fs.readdirSync(path.join(here, 'tasks')).sort().join(',')).split(',');
fs.mkdirSync(a.out, { recursive: true });
const file = path.join(a.out, 'results.jsonl');
const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { const r = JSON.parse(l); return `${r.arm}-${r.task}-${r.rep}`; }) : []);
for (let rep = 1; rep <= reps; rep += 1) {
  for (const task of tasks) {
    for (const arm of (rep + tasks.indexOf(task)) % 2 ? ['A', 'B'] : ['B', 'A']) {
      if (done.has(`${arm}-${task}-${rep}`)) continue;
      const r = spawnSync(process.execPath, [path.join(here, 'run.mjs'), '--arm', arm, '--task', task, '--rep', String(rep), '--out', a.out], { encoding: 'utf8' });
      const line = r.stdout.trim().split('\n').pop();
      try { JSON.parse(line); fs.appendFileSync(file, `${line}\n`); } catch { fs.appendFileSync(path.join(a.out, 'errors.log'), `${arm} ${task} ${rep}: ${r.stderr.slice(-500)}\n`); }
      console.log(`${arm} ${task} ${rep}: ${line.slice(0, 160)}`);
    }
  }
}
