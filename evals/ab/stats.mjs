#!/usr/bin/env node
// Paired comparison of arm A and arm B from results.jsonl. A pair is the same task and repetition on both arms.
// Per metric: mean A, mean B, mean paired difference (B - A), 95% percentile-bootstrap CI of that mean over
// pairs (10000 resamples, seeded), and an exact two-sided Wilcoxon signed-rank p (zero differences dropped).
//   node evals/ab/stats.mjs <results.jsonl> [--md]
import fs from 'node:fs';

const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const key = r => `${r.task}#${r.rep}`;
const byArm = arm => new Map(rows.filter(r => r.arm === arm).map(r => [key(r), r]));
const A = byArm('A'), B = byArm('B');
const pairs = [...A.keys()].filter(k => B.has(k)).sort().map(k => [A.get(k), B.get(k)]);

let seed = 20261029;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const mean = xs => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

function bootstrap(diffs) {
  const means = Array.from({ length: 10000 }, () => mean(diffs.map(() => diffs[Math.floor(rand() * diffs.length)]))).sort((x, y) => x - y);
  return [means[Math.floor(0.025 * means.length)], means[Math.floor(0.975 * means.length)]];
}

// Exact: with n non-zero differences, W+ is the sum of the ranks of positive ones; enumerate sign patterns by DP.
function wilcoxon(diffs) {
  const d = diffs.filter(x => x !== 0);
  const n = d.length;
  if (!n) return 1;
  const order = d.map((x, i) => [Math.abs(x), i]).sort((p, q) => p[0] - q[0]);
  const ranks = new Array(n);
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && order[j + 1][0] === order[i][0]) j += 1; const rank = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) ranks[order[k][1]] = rank; i = j + 1; }
  const scale = 2; // ranks are multiples of 0.5
  const total = Math.round(ranks.reduce((s, r) => s + r, 0) * scale);
  let ways = new Map([[0, 1]]);
  for (const r of ranks) { const w = Math.round(r * scale), next = new Map(); for (const [s, c] of ways) { next.set(s, (next.get(s) ?? 0) + c); next.set(s + w, (next.get(s + w) ?? 0) + c); } ways = next; }
  const observed = Math.round(d.reduce((s, x, i) => s + (x > 0 ? ranks[i] : 0), 0) * scale);
  const extreme = Math.min(observed, total - observed);
  let tail = 0; for (const [s, c] of ways) if (s <= extreme) tail += c;
  return Math.min(1, (2 * tail) / 2 ** n);
}

const metrics = [
  ['pass', r => (r.pass ? 1 : 0)],
  ['verified (system report)', r => (r.verified ? 1 : 0)],
  ['model calls', r => r.modelCalls],
  ['harness rounds', r => r.harnessRounds ?? 0],
  ['tool calls', r => r.toolCalls],
  ['seconds', r => r.seconds],
  ['cost USD', r => r.cost],
  ['approvals asked', r => r.approvals],
];
const fmt = x => (Number.isInteger(x) ? String(x) : x.toFixed(2));
const out = [];
out.push(`pairs: ${pairs.length}  (tasks: ${[...new Set(pairs.map(p => p[0].task))].length})`);
out.push('| metric | A mean | B mean | B - A | 95% CI (bootstrap) | Wilcoxon p |', '|---|---|---|---|---|---|');
for (const [name, get] of metrics) {
  const d = pairs.map(([a, b]) => get(b) - get(a));
  const [lo, hi] = bootstrap(d);
  out.push(`| ${name} | ${fmt(mean(pairs.map(([a]) => get(a))))} | ${fmt(mean(pairs.map(([, b]) => get(b))))} | ${fmt(mean(d))} | [${fmt(lo)}, ${fmt(hi)}] | ${wilcoxon(d).toFixed(3)} |`);
}
out.push('', '| task | A pass | B pass | A calls | B calls | A s | B s | A cost | B cost |', '|---|---|---|---|---|---|---|---|---|');
for (const task of [...new Set(pairs.map(p => p[0].task))]) {
  const ps = pairs.filter(p => p[0].task === task);
  const sum = (arm, f) => fmt(mean(ps.map(p => f(p[arm]))));
  out.push(`| ${task} | ${ps.filter(p => p[0].pass).length}/${ps.length} | ${ps.filter(p => p[1].pass).length}/${ps.length} | ${sum(0, r => r.modelCalls)} | ${sum(1, r => r.modelCalls)} | ${sum(0, r => r.seconds)} | ${sum(1, r => r.seconds)} | ${sum(0, r => r.cost)} | ${sum(1, r => r.cost)} |`);
}
console.log(out.join('\n'));
