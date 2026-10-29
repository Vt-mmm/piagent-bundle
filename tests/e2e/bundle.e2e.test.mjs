// The built bundle: what scripts/build-bundle.mjs produced, checked the way Agent Watch's launcher will use it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { theBundle } from './helpers/rig.mjs';
import { doctor } from '../../src/doctor.mjs';
import { launchPlan } from '../../src/launcher.mjs';
import { PARTS } from '../../src/manifest.mjs';

test('doctor says ok on the fresh bundle and every part is pinned with its commit', () => {
  const { root, manifest } = theBundle();
  const result = doctor(root);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(Object.keys(manifest.parts).sort(), [...PARTS].sort());
  for (const name of PARTS) assert.match(manifest.parts[name].sha256, /^[0-9a-f]{64}$/, name);
  assert.deepEqual(Object.values(manifest.parts).filter(p => p.commit).map(p => p.path).sort(), ['pi/packages/piagent-harness', 'pi/packages/piagent-provider', 'pi/packages/piagent-sandbox']);
});

test('bin/pi is the file launchPlan runs, it is the bundle\'s own Pi, and it needs no global Pi', () => {
  const { root, manifest } = theBundle();
  const plan = launchPlan({ root, manifest, agentDir: '/a/agent', sessionDir: '/a/sessions' });
  assert.equal(plan.command, path.join(root, 'pi', 'bin', 'pi'));
  assert.ok(fs.statSync(plan.command).mode & 0o100, 'executable');
  const home = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'bundle-pi-'));
  try {
    const out = spawnSync(process.execPath, [plan.command, '--version'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home, PI_CODING_AGENT_DIR: path.join(home, 'agent'), ...plan.env } });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.trim(), '1.4.0');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
  for (const arg of plan.args.filter(a => a.startsWith('/'))) assert.ok(arg.startsWith(root + path.sep), `${arg} is inside the bundle`);
});

test('no package of the bundle has an install script or its own dependencies, and the lock pins every Pi dependency by hash', () => {
  const { root, manifest } = theBundle();
  for (const name of ['harness', 'sandbox', 'provider']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, manifest.parts[name].path, 'package.json'), 'utf8'));
    for (const key of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(pkg.scripts?.[key], undefined, `${name} ${key}`);
    assert.deepEqual(pkg.dependencies ?? {}, {}, name);
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'pi/package-lock.json'), 'utf8'));
  const unpinned = Object.entries(lock.packages).filter(([key, v]) => key && !v.link && !v.integrity);
  assert.deepEqual(unpinned.map(([key]) => key), []);
});

test('one changed byte in a package: doctor reports hash-mismatch for it (and for the Pi part that holds it), and a restored byte verifies again', () => {
  const { root } = theBundle();
  const file = path.join(root, 'pi/packages/piagent-sandbox/src/index.mjs');
  const original = fs.readFileSync(file);
  const changed = Buffer.from(original); changed[changed.length - 1] ^= 1;
  try {
    fs.writeFileSync(file, changed);
    const result = doctor(root);
    assert.equal(result.ok, false);
    assert.ok(result.problems.includes('hash-mismatch:sandbox'), JSON.stringify(result));
    assert.ok(result.problems.includes('hash-mismatch:pi'), 'the Pi part holds the packages, so it changes too');
    assert.ok(!result.problems.includes('hash-mismatch:provider') && !result.problems.includes('hash-mismatch:harness'));
  } finally { fs.writeFileSync(file, original); }
  assert.equal(doctor(root).ok, true);
});

test('a changed byte in bin/pi is reported', () => {
  const { root } = theBundle();
  const file = path.join(root, 'pi/bin/pi');
  const original = fs.readFileSync(file);
  try {
    fs.writeFileSync(file, `${original}// x\n`);
    assert.deepEqual(doctor(root).problems, ['hash-mismatch:pi']);
  } finally { fs.writeFileSync(file, original); }
  assert.equal(doctor(root).ok, true);
});
