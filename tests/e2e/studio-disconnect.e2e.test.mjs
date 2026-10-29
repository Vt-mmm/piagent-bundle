// Studio goes away in the middle of a turn and comes back: the provider waits (studio-link) instead of failing, the
// turn goes on by itself, the wait is written to the local log and reported to Studio. Real wall-clock time, so it is
// opt-in: E2E_LONG=1 (E2E_OUTAGE_MS sets the outage, default 125000 ms = just over two minutes). Offline; Studio,
// broker and model are the simulated ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startRig } from './helpers/rig.mjs';

const OUTAGE_MS = Number(process.env.E2E_OUTAGE_MS ?? 125_000);
const FIXED = 'export const add = (a, b) => a + b;\n';

test('Studio down for over two minutes mid-turn: the turn waits, resumes and finishes; the wait is logged and reported', { skip: !process.env.E2E_LONG, timeout: OUTAGE_MS + 240_000 }, async t => {
  let studio = null, downAt = 0, upAt = 0;
  const script = [
    { tools: [{ name: 'bash', input: { command: 'npm test' } }] },
    // Studio drops right after it answers with the fix: the next request (the model seeing the write) has nobody to talk to.
    () => { downAt = Date.now(); studio.outage = true; setTimeout(() => { studio.outage = false; upAt = Date.now(); }, OUTAGE_MS); return { tools: [{ name: 'write', input: { path: 'src/add.js', content: FIXED } }] }; },
    { tools: [{ name: 'bash', input: { command: 'npm test' } }] },
    { text: 'Xong: npm test đã pass.' },
  ];
  const rig = await startRig(t, { scripts: { main: script } });
  studio = rig.studio;
  const result = await rig.run('Sửa test đang đỏ', { timeout: OUTAGE_MS + 200_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(downAt && upAt, 'the outage happened');
  assert.equal(fs.readFileSync(path.join(rig.project, 'src/add.js'), 'utf8'), FIXED, 'the work was not lost');
  assert.equal(rig.studio.inferenceOf('main').length >= 4, true, 'the model script ran to its last step after Studio came back');

  const logFile = path.join(rig.agentDir, 'logs', 'studio-link.jsonl');
  const records = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const disconnects = records.filter(r => r.kind === 'studio_disconnect');
  const waits = records.filter(r => r.kind === 'studio_wait');
  assert.ok(waits.length >= 1 && disconnects.length >= 1, JSON.stringify(records).slice(0, 1500));
  assert.deepEqual([...new Set(disconnects.map(r => r.outcome))], ['resumed'], 'every wait ended resumed, none stopped');
  const longest = Math.max(...disconnects.map(r => r.waited_ms));
  assert.ok(longest >= OUTAGE_MS - 15_000, `the wait covered the outage (longest ${longest} ms, outage ${OUTAGE_MS} ms)`);
  // The same events reach Studio once it is back (POST /studio/v1/managed/disconnects).
  const reported = rig.studio.requests.filter(r => r.path === '/studio/v1/managed/disconnects').flatMap(r => { try { return JSON.parse(r.raw).events ?? []; } catch { return []; } });
  assert.ok(reported.length >= 1, 'Studio was told about the disconnect');
  t.diagnostic(JSON.stringify({ outageMs: upAt - downAt, refusedRequests: rig.studio.refused, disconnects: disconnects.map(({ cause, outcome, attempts, waited_ms, codes }) => ({ cause, outcome, attempts, waited_ms, codes })), reportedToStudio: reported.length, modelRequests: rig.studio.inferenceOf('main').length }));
});
