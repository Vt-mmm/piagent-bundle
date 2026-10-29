import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { makePortable } from '../scripts/build-bundle.mjs';
import { npmCommand } from '../bin/piagent-pi-bundle.mjs';
import { hashDir } from '../src/manifest.mjs';

test('makePortable removes what npm pack would drop and normalises modes, so the hash is the installed one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-'));
  fs.mkdirSync(path.join(dir, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules/tool.js'), 'x', { mode: 0o664 });
  fs.writeFileSync(path.join(dir, 'node_modules/run.sh'), 'x', { mode: 0o775 });
  fs.writeFileSync(path.join(dir, 'node_modules/.npmignore'), 'x');
  fs.symlinkSync('../tool.js', path.join(dir, 'node_modules/.bin/tool'));
  makePortable(dir);
  assert.equal(fs.existsSync(path.join(dir, 'node_modules/.bin')), false);
  assert.equal(fs.existsSync(path.join(dir, 'node_modules/.npmignore')), false);
  assert.equal(fs.statSync(path.join(dir, 'node_modules/tool.js')).mode & 0o777, 0o644);
  assert.equal(fs.statSync(path.join(dir, 'node_modules/run.sh')).mode & 0o777, 0o755);
  assert.match(hashDir(dir), /^[0-9a-f]{64}$/);
  fs.symlinkSync('x', path.join(dir, 'node_modules/other-link'));
  assert.throws(() => makePortable(dir), /unexpected link/);
});

test('install, update and repair are plain npm global installs of the one package, no install scripts', () => {
  assert.deepEqual(npmCommand('install', {}), ['npm', ['install', '--global', '--ignore-scripts', '@piagent/pi-bundle@latest']]);
  assert.deepEqual(npmCommand('update', { prefix: '/p' }), ['npm', ['install', '--global', '--ignore-scripts', '--prefix', '/p', '@piagent/pi-bundle@latest']]);
  assert.deepEqual(npmCommand('repair', { version: '0.1.1' }), ['npm', ['install', '--global', '--ignore-scripts', '--force', '@piagent/pi-bundle@0.1.1']]);
});
