// Shift+Tab in the Pi Terminal asks for another thinking level; the Harness allows only what it granted, so the
// provider puts the level back (thinking.mjs) and writes `thinking_reverted` to the local studio-link log.
// Simulated Studio and broker; needs python3 for the pty driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startRig, hasPython, DRIVER } from './helpers/rig.mjs';

const TOKEN = /as_run_/;
const drive = (rig, keys) => new Promise(resolve => {
  const spec = JSON.stringify({ cmd: [process.execPath, rig.plan.command, ...rig.args], cwd: rig.project, env: rig.env });
  const child = spawn('python3', ['-I', DRIVER, spec, ...keys], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
  child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
  child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});
const linkLog = rig => fs.readFileSync(path.join(rig.agentDir, 'logs', 'studio-link.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

test('Shift+Tab after a turn: a level the Harness did not grant is put back to the granted one', { skip: !hasPython, timeout: 150_000 }, async t => {
  // The Harness grants "low" and allows nothing else.
  const rig = await startRig(t, { thinkingLevels: ['low'], effort: 'low', scripts: { main: [{ text: 'Chào anh.' }] } });
  const out = await drive(rig, ['xin chào', '@S-Tab', '@S-Tab']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(rig.studio.inferenceOf('main').length, 1, 'the turn ran, so the run (and its grant) exists');
  assert.match(out.stdout, /Thinking level: medium/, 'Pi did cycle to the next level on Shift+Tab');
  const reverted = linkLog(rig).filter(r => r.kind === 'thinking_reverted');
  assert.equal(reverted.length, 2, 'both presses were put back');
  for (const r of reverted) assert.deepEqual([r.asked, r.now], ['medium', 'low']);
  assert.doesNotMatch(rig.everything([out.stdout, out.stderr, JSON.stringify(rig.studio.managed)]), TOKEN);
});

test('Shift+Tab before any message: levels outside the allowed set are put back too', { skip: !hasPython, timeout: 150_000 }, async t => {
  const rig = await startRig(t, { thinkingLevels: ['off', 'low', 'medium'], scripts: {} });
  const out = await drive(rig, ['@S-Tab', '@S-Tab']);
  assert.equal(out.status, 0, out.stderr);
  const reverted = linkLog(rig).filter(r => r.kind === 'thinking_reverted');
  assert.equal(reverted.length, 2);
  for (const r of reverted) assert.deepEqual([r.asked, r.now], ['high', 'medium']);
});
