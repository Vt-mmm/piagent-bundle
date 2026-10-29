// The Studio rules the end-to-end test checks the reports against: they must reject what Studio rejects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processProblems, settleProblems } from './e2e/helpers/contract.mjs';

const v3 = { version: 3, policy: { plan: 'off', verify: 'require', review: 'require' }, changed: true, plan_steps: 0, plan_done: 0, checks: 2, checks_failed: 1, verified: true, reviews: 1,
  reviewed: true, blocking: 0, blocking_open: 0, fix_loops: 1, outcome: 'clean', plan_skipped: false, unknown_tools: 0, objections: 0, objections_answered: 0, disputes: 0 };

test('process report: a v3 report passes; v1 and v2 are the same without the later keys', () => {
  assert.deepEqual(processProblems(v3), []);
  const { objections, objections_answered, disputes, ...v2 } = { ...v3, version: 2 };
  assert.deepEqual(processProblems(v2), []);
  const { plan_skipped, unknown_tools, ...v1 } = v2; v1.version = 1;
  assert.deepEqual(processProblems(v1), []);
});

test('process report: extra and missing keys, bad ranges and impossible combinations are rejected', () => {
  assert.deepEqual(processProblems({ ...v3, version: 2 }), ['extra:objections', 'extra:objections_answered', 'extra:disputes']);
  const { disputes, ...short } = v3;
  assert.deepEqual(processProblems(short), ['missing:disputes']);
  assert.ok(processProblems({ ...v3, checks_failed: 3 }).includes('checks_failed>checks'));
  assert.ok(processProblems({ ...v3, fix_loops: 4 }).includes('fix_loops>3'));
  assert.ok(processProblems({ ...v3, changed: false, outcome: 'clean' }).includes('unchanged-outcome'));
  assert.ok(processProblems({ ...v3, outcome: 'disputed' }).includes('disputed-without-disputes'));
  assert.ok(processProblems({ ...v3, verified: 1 }).includes('bool:verified'));
  assert.ok(processProblems({ ...v3, checks: 1001 }).includes('int:checks'));
  assert.ok(processProblems({ ...v3, policy: { plan: 'off', verify: 'sometimes', review: 'off' } }).includes('policy'));
});

test('settle body: outcome, summary, evidence and files limits', () => {
  const ok = { outcome: 'succeeded', summary: 'ok', evidence: [], files: [] };
  assert.deepEqual(settleProblems(ok), []);
  assert.deepEqual(settleProblems({ ...ok, spec: { target: 'x' } }), []);
  assert.ok(settleProblems({ ...ok, outcome: 'done' }).includes('outcome'));
  assert.ok(settleProblems({ ...ok, summary: '' }).includes('summary'));
  assert.ok(settleProblems({ ...ok, evidence: new Array(9).fill('x') }).includes('evidence'));
  assert.ok(settleProblems({ ...ok, spec: { other: 'x' } }).includes('spec:other'));
  assert.ok(settleProblems({ ...ok, token: 'x' }).includes('extra:token'));
});
