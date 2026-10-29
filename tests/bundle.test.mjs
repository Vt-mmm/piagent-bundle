import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, verifyManifest, launchPlan, doctor, PARTS } from '../src/index.mjs';

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
  assert.deepEqual(plan.args.slice(0, 2), ['--no-extensions', '-e']);
  assert.equal(plan.args.at(-1), 'builtin:mcp');
  assert.equal(plan.args.filter(a => a === '-e').length, 4);
  assert.deepEqual(plan.env, { PI_CODING_AGENT_DIR: '/a/agent', PI_CODING_AGENT_SESSION_DIR: '/a/ManagedSessions', PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' });
  assert.ok(!JSON.stringify(plan).includes('as_run_'));
});
