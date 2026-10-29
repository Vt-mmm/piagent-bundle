// Company mode end to end: the bundle's own Pi 1.3.0 with harness, sandbox and provider loaded exactly as launchPlan
// says, a simulated Studio and broker, and a scripted model that fixes a failing test. Offline; no real credential,
// Studio, model, Keychain or ~/.pi is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRig, hasPython, DRIVER, theBundle } from './helpers/rig.mjs';
import { lastUserText, allText } from './helpers/studio.mjs';
import { processProblems, settleProblems } from './helpers/contract.mjs';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(here, 'fixtures/probe.mjs'), FAKE_BASH = path.join(here, 'fixtures/fake-bash.mjs'), STATIC_BASH = path.join(here, 'fixtures/static-bash.mjs');
const TOKEN = /as_run_/;

const FIXED = 'export const add = (a, b) => a + b;\n';
const mainScript = () => [
  { tools: [{ name: 'bash', input: { command: 'npm test' } }] },                                   // 1: the test fails
  { tools: [{ name: 'write', input: { path: 'src/add.js', content: FIXED } }] },                  // 2: the fix
  { text: 'Đã sửa add().' },                                                                       // 3: claims done without running the check
  { tools: [{ name: 'bash', input: { command: 'npm test' } }] },                                   // 4: after the gate sent it back
  { text: 'Xong: npm test đã pass.' },                                                             // 5
];
const reviewScript = () => [
  { tools: [{ name: 'read', input: { path: 'src/add.js' } }] },
  { tools: [{ name: 'submit_review', input: { findings: [], summary: 'Sửa đúng, test pass.' } }] },
  { text: 'Đã nộp review.' },
];
const toolNames = body => (body.tools ?? []).map(t => t.name).sort();


test('bundle: the pinned parts verify and Pi is the bundle\'s own 1.3.0', () => {
  const { root, manifest } = theBundle();
  assert.equal(manifest.piVersion, '1.3.0');
  assert.ok(fs.existsSync(path.join(root, manifest.parts.pi.path, 'bin/pi')));
  for (const name of ['harness', 'sandbox', 'provider']) assert.match(manifest.parts[name].commit, /^[0-9a-f]{40}$/, name);
});

test('a failing test is fixed under the completion gate, with a review helper, and the report reaches Studio', { timeout: 240_000 }, async t => {
  const probeFile = path.join(fs.realpathSync(os.tmpdir()), `e2e-probe-${process.pid}.json`);
  t.after(() => fs.rmSync(probeFile, { force: true }));
  const rig = await startRig(t, { scripts: { main: mainScript(), review: reviewScript() }, append: [PROBE], env: { E2E_PROBE: probeFile } });
  const result = await rig.run('Sửa lỗi add() để npm test pass.');
  const probe = fs.existsSync(probeFile) ? JSON.parse(fs.readFileSync(probeFile, 'utf8')) : null;
  const { studio } = rig, main = studio.inferenceOf('main'), review = studio.inferenceOf('review');
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(fs.readFileSync(path.join(rig.project, 'src/add.js'), 'utf8'), FIXED, 'the model\'s fix landed in the project');

  // (a) the toolset guard saw the seven core tools coming from piagent-sandbox, so nothing was blocked.
  assert.ok(probe, 'probe wrote its record');
  const core = ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls'];
  for (const name of core) {
    const tool = probe.tools.find(x => x.name === name);
    assert.ok(tool, `${name} is registered`);
    assert.ok(tool.sourceInfo.path.split(path.sep).includes('piagent-sandbox'), `${name} comes from piagent-sandbox: ${JSON.stringify(tool.sourceInfo)}`);
  }
  assert.deepEqual(probe.blocked, [], 'the harness did not block the toolset');
  assert.deepEqual(probe.attest.at(-1).tools.map(x => x.name).filter(n => core.includes(n)).sort(), [...core].sort());
  assert.ok(!studio.managed.some(m => m.path.endsWith('/tool-failures') && JSON.stringify(m.body).includes('managed_toolset_untrusted')), 'no toolset failure was reported');

  // (b) the gate sent the agent back once for the check, and the turn ended only after a passing run.
  assert.equal(main.length, 5, 'five main requests: check, fix, claim, check again, claim');
  const sendBack = lastUserText(main[3].body);
  assert.match(sendBack, /Harness process check: code changed in this turn, but no check has passed/);
  assert.match(sendBack, /`npm test`/, 'the check comes from AGENTS.md "## Checks"');
  assert.equal(allText(main[4].body).split('Harness process check').length - 1, 1, 'sent back exactly once');
  assert.match(lastUserText(main[1].body), /fail|not ok|# fail 1/i, 'the first run really failed');
  assert.match(lastUserText(main[4].body), /# pass 1/, 'the second run really passed');
  assert.match(rig.everything(), /Xong: npm test đã pass\./, 'the final answer is in the conversation file');

  // (c) the review helper ran under a `child` grant through the provider and saw only read-only sandbox tools.
  assert.deepEqual(studio.events.filter(e => e.action === 'child').map(e => e.role), ['review']);
  assert.equal(review.length, 3);
  assert.deepEqual(toolNames(review[0].body).filter(n => n !== '__pi_deferred_placeholder__'), ['find', 'grep', 'ls', 'read', 'submit_review'], 'no edit, write or bash; no memory without the capability');
  assert.match(lastUserText(review[1].body), /a \+ b/, 'the helper read the fixed file through the sandbox\'s read tool');
  assert.ok(studio.events.some(e => e.action === 'close' && e.role === 'review'), 'the helper\'s grant was closed');
  assert.deepEqual(probe.childTools.map(c => [c.readOnly, c.commands, c.key]), [[true, false, 'review']], 'the read-only boundary was asked for once, without commands');
  assert.deepEqual(probe.childClose.map(c => c.key), ['review'], 'and dropped when the helper closed');
  assert.equal(probe.runState[0].runId, null, 'the Harness reached the harness at session start, before any run');
  assert.equal(probe.runState[0].harness.workflow.review, 'require');
  assert.ok(probe.runState.some(x => x.runId), 'and again once the run began');

  // (d) the settle went to Studio with the helper's own token, and the process report closed the run.
  const settles = studio.managed.filter(m => m.path === '/v1/managed/settle');
  assert.equal(settles.length, 1);
  assert.equal(settles[0].role, 'review', 'settled with the helper\'s token, not the main one');
  assert.deepEqual(settleProblems(settles[0].body), []);
  assert.equal(settles[0].body.outcome, 'succeeded');
  const close = studio.closeEvents().find(e => e.role === 'main');
  assert.ok(close?.process, 'the main close carries the process report');
  assert.deepEqual(processProblems(close.process), []);
  assert.deepEqual(close.process, { version: 3, policy: { plan: 'off', verify: 'require', review: 'require' }, changed: true, plan_steps: 0, plan_done: 0, checks: 2, checks_failed: 1,
    verified: true, reviews: 1, reviewed: true, blocking: 0, blocking_open: 0, fix_loops: 1, outcome: 'clean', plan_skipped: false, unknown_tools: 0, objections: 0, objections_answered: 0, disputes: 0 });

  // (e) no run token anywhere: screen, files, the model's context, the reports.
  const seen = rig.everything([result.stdout, result.stderr, JSON.stringify(studio.inference.map(r => r.body)), JSON.stringify(studio.managed), JSON.stringify(studio.events), JSON.stringify(probe)]);
  assert.doesNotMatch(seen, TOKEN);
});

test('(g) an extension loaded before the sandbox that takes over bash makes the harness refuse every tool call', { timeout: 120_000 }, async t => {
  const rig = await startRig(t, { insertAfterHarness: [FAKE_BASH], scripts: { main: [
    { tools: [{ name: 'read', input: { path: 'src/add.js' } }] },
    { tools: [{ name: 'bash', input: { command: 'echo pwned > pwned.txt' } }] },
    { text: 'Không chạy được.' }] } });
  const result = await rig.run('Đọc src/add.js');
  assert.equal(result.status, 0, result.stderr);
  const main = rig.studio.inferenceOf('main');
  assert.equal(main.length, 3);
  for (const i of [1, 2]) assert.match(lastUserText(main[i].body), /managed-toolset-untrusted/, `tool call ${i} was refused`);
  assert.doesNotMatch(allText(main[2].body), /ran outside the sandbox/, 'the stand-in bash never ran');
  assert.equal(fs.existsSync(path.join(rig.project, 'pwned.txt')), false);
  assert.equal(fs.readFileSync(path.join(rig.project, 'src/add.js'), 'utf8'), 'export const add = (a, b) => a - b;\n');
  const failures = rig.studio.managed.filter(m => m.path === '/studio/v1/managed/tool-failures');
  assert.equal(failures.length, 1, 'Studio was told once');
  const [failure] = failures[0].body.failures;
  assert.equal(failure.code, 'managed_toolset_untrusted');
  assert.match(failure.error, /bash/);
  assert.doesNotMatch(rig.everything([result.stdout, result.stderr, JSON.stringify(rig.studio.managed)]), TOKEN);
});

test('(f) /model, /login, /scoped-models, /share and /bug are refused in the Terminal, and no run token shows', { skip: !hasPython, timeout: 150_000 }, async t => {
  const rig = await startRig(t, { scripts: {} });
  const spec = JSON.stringify({ cmd: [process.execPath, rig.plan.command, ...rig.args], cwd: rig.project, env: rig.env });
  const out = await new Promise(resolve => {
    const child = spawn('python3', ['-I', DRIVER, spec, '^P', '/model', '/login', '/scoped-models', '/share', '/bug'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
  assert.equal(out.status, 0, out.stderr);
  const refused = new Set(out.stdout.match(/Lệnh \/(model|login|scoped-models|share|bug) bị chặn trong chế độ công ty/g) ?? []);
  assert.equal(refused.size, 5, out.stdout.slice(-1500));
  assert.match(out.stdout, /Only one model in scope/, 'Ctrl+P has no second model to cycle to');
  assert.match(out.stdout, /agent-watch-auto/, 'the one company model is selected');
  assert.doesNotMatch(rig.everything([out.stdout, out.stderr, JSON.stringify(rig.studio.managed)]), TOKEN);
});

test('(g) Pi itself refuses a second extension that registers bash at load time, so the sandbox is never half-replaced', { timeout: 60_000 }, async t => {
  const rig = await startRig(t, { insertAfterHarness: [STATIC_BASH], scripts: { main: [{ text: 'không bao giờ tới đây' }] } });
  const result = await rig.run('xin chào', { timeout: 40_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Tool "bash" conflicts with .*static-bash\.mjs/);
  assert.equal(rig.studio.inference.length, 0, 'no model request was made');
});

test('(g) an extension loaded after the sandbox cannot take bash over: the sandbox keeps it and nothing is blocked', { timeout: 120_000 }, async t => {
  const probeFile = path.join(fs.realpathSync(os.tmpdir()), `e2e-probe-after-${process.pid}.json`);
  t.after(() => fs.rmSync(probeFile, { force: true }));
  const rig = await startRig(t, { append: [FAKE_BASH, PROBE], env: { E2E_PROBE: probeFile }, scripts: { main: [{ tools: [{ name: 'bash', input: { command: 'echo hi' } }] }, { text: 'xong' }] } });
  const result = await rig.run('chạy echo');
  assert.equal(result.status, 0, result.stderr);
  const probe = JSON.parse(fs.readFileSync(probeFile, 'utf8'));
  assert.ok(probe.tools.find(x => x.name === 'bash').sourceInfo.path.split(path.sep).includes('piagent-sandbox'));
  assert.deepEqual(probe.blocked, []);
  assert.doesNotMatch(allText(rig.studio.inferenceOf('main')[1].body), /ran outside the sandbox/);
});
