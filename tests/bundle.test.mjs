import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, verifyManifest, launchPlan, prepareLaunch, manifestDigest, hashDir, doctor, PARTS } from '../src/index.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
  const parts = {};
  for (const name of PARTS) {
    fs.mkdirSync(path.join(root, name, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, name, 'bin', 'x.js'), `// ${name}\n`);
    parts[name] = { version: '1.0.0', path: name, dir: path.join(root, name) };
  }
  const manifest = buildManifest({ bundleVersion: '0.1.0', parts });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  return { root, manifest };
}

test('intact bundle verifies', () => {
  const { root, manifest } = fixture();
  assert.deepEqual(verifyManifest(root, manifest), []);
  assert.equal(doctor(root).ok, true);
});

test('a changed part is reported by name and doctor suggests repair', () => {
  const { root } = fixture();
  fs.appendFileSync(path.join(root, 'sandbox', 'bin', 'x.js'), '// tampered\n');
  const result = doctor(root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ['hash-mismatch:sandbox']);
  assert.match(result.hint, /Sửa cài đặt/);
});

test('missing manifest and missing part are reported', () => {
  const { root } = fixture();
  fs.rmSync(path.join(root, 'provider'), { recursive: true });
  assert.deepEqual(doctor(root).problems, ['absent:provider']);
  assert.deepEqual(doctor(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))).problems, ['manifest-missing']);
});

test('launch plan uses only bundle paths and its own agent dirs', () => {
  const { root, manifest } = fixture();
  const plan = launchPlan({ root, manifest, agentDir: '/a/agent', sessionDir: '/a/ManagedSessions' });
  assert.equal(plan.command, path.join(root, 'pi', 'bin', 'pi'));
  // T6: nothing from the project loads or runs on its own, and Pi stays off the network.
  for (const flag of ['--no-extensions', '--no-approve', '--no-skills', '--no-prompt-templates', '--offline']) assert.ok(plan.args.includes(flag), flag);
  assert.ok(plan.args.indexOf('--no-approve') < plan.args.indexOf('-e'), 'switches come before the packages');
  assert.deepEqual(plan.args.filter(a => a === '-e').length, 4);
  assert.equal(plan.args.at(-1), 'builtin:mcp');
  assert.equal(plan.args.filter(a => a === '-e').length, 4);
  assert.deepEqual(plan.env, { PI_CODING_AGENT_DIR: '/a/agent', PI_CODING_AGENT_SESSION_DIR: '/a/ManagedSessions', PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' });
  assert.ok(!JSON.stringify(plan).includes('as_run_'));
});

test('T7: a link, an execute bit, a write bit for others or an empty folder in a part is a hash mismatch', () => {
  const changes = {
    symlink: root => fs.symlinkSync('/etc/hosts', path.join(root, 'harness', 'bin', 'link.js')),
    dirlink: root => fs.symlinkSync('/tmp', path.join(root, 'harness', 'bin', 'dir')),
    exec: root => fs.chmodSync(path.join(root, 'harness', 'bin', 'x.js'), 0o755),
    writable: root => fs.chmodSync(path.join(root, 'harness', 'bin', 'x.js'), 0o666),
    emptyDir: root => fs.mkdirSync(path.join(root, 'harness', 'bin', 'empty')),
  };
  for (const [name, change] of Object.entries(changes)) {
    const { root } = fixture();
    assert.equal(doctor(root).ok, true, name);
    change(root);
    assert.deepEqual(doctor(root).problems, ['hash-mismatch:harness'], name);
  }
});

test('T7: a manifest rewritten together with its files verifies on its own but not against the digest the binding pins', () => {
  const { root } = fixture();
  const pinned = manifestDigest(path.join(root, 'manifest.json'));
  assert.equal(doctor(root, { expect: pinned }).ok, true);
  fs.appendFileSync(path.join(root, 'sandbox', 'bin', 'x.js'), '// evil\n');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  manifest.parts.sandbox.sha256 = hashDir(path.join(root, 'sandbox'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  assert.equal(doctor(root).ok, true, 'the bundle is consistent with itself');
  assert.deepEqual(doctor(root, { expect: pinned }).problems, ['manifest-digest-mismatch']);
  assert.throws(() => prepareLaunch({ root, agentDir: '/a', sessionDir: '/s', expect: pinned }), /managed-bundle-untrusted: manifest-digest-mismatch/);
  assert.ok(prepareLaunch({ root, agentDir: '/a', sessionDir: '/s' }).args.includes('--no-approve'));
});
