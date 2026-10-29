#!/usr/bin/env node
// Builds the global npm package @piagent/pi-bundle: the portable bundle (Pi 1.4.0 plus the three packages at the commits of
// bundle.pins.json, manifest.json with a sha256 per part) under bundle/, the piagent-pi-bundle command, and a tarball from `npm pack`.
//
//   node scripts/build-npm-package.mjs --out <dir> [--bundle-version 0.1.1] [--source provider=<git clone>] ...
//
// Nothing is published: the tarball lands in <dir>/ and `npm publish` is the owner's tag-driven workflow (docs/npm-package.md).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from './build-bundle.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), sources = {};
let out, bundleVersion = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version, pins = path.join(repo, 'bundle.pins.json');
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = path.resolve(args[++i]);
  else if (args[i] === '--bundle-version') bundleVersion = args[++i];
  else if (args[i] === '--pins') pins = path.resolve(args[++i]);
  else if (args[i] === '--source') { const [name, dir] = args[++i].split('='); sources[name] = path.resolve(dir); }
  else throw new Error(`unknown argument ${args[i]}`);
}
if (!out) throw new Error('--out <dir> is required');
const pkg = path.join(out, 'package');
if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`${out} is not empty`);
fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
fs.mkdirSync(path.join(pkg, 'src'));
const built = buildBundle({ out: path.join(pkg, 'bundle'), pins, sources, bundleVersion, portable: true });
if (!built.doctor.ok) throw new Error(`bundle not ok: ${built.doctor.problems.join(', ')}`);
for (const file of ['doctor.mjs', 'manifest.mjs']) fs.copyFileSync(path.join(repo, 'src', file), path.join(pkg, 'src', file));
fs.copyFileSync(path.join(repo, 'bin/piagent-pi-bundle.mjs'), path.join(pkg, 'bin/piagent-pi-bundle.mjs'));
fs.chmodSync(path.join(pkg, 'bin/piagent-pi-bundle.mjs'), 0o755);
for (const file of ['LICENSE', 'SECURITY.md']) fs.copyFileSync(path.join(repo, file), path.join(pkg, file));
fs.writeFileSync(path.join(pkg, 'README.md'), `# @piagent/pi-bundle\n\nPi 1.4.0 plus the Piagent harness, sandbox and provider packages, pinned by sha256 in bundle/manifest.json. Used by Agent Watch for \`runtime = pi\`.\n\n    npm install --global @piagent/pi-bundle\n    piagent-pi-bundle doctor\n    piagent-pi-bundle update | repair\n\nNo install scripts. Agent Watch finds it under any npm prefix and pins the manifest digest.\n`);
fs.writeFileSync(path.join(pkg, 'package.json'), `${JSON.stringify({
  name: '@piagent/pi-bundle', version: bundleVersion, description: 'Pi 1.4.0 with the Piagent company-mode packages, pinned by hash (Agent Watch runtime = pi)',
  type: 'module', license: 'MIT', bin: { 'piagent-pi-bundle': 'bin/piagent-pi-bundle.mjs' }, engines: { node: '>=22.19' },
  files: ['bin', 'src', 'bundle', 'LICENSE', 'SECURITY.md', 'README.md'], publishConfig: { access: 'public', provenance: true },
  repository: { type: 'git', url: 'git+https://github.com/Vt-mmm/piagent-bundle.git' },
}, null, 2)}\n`);
const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', out, '--ignore-scripts'], { cwd: pkg, encoding: 'utf8', maxBuffer: 64 << 20 });
if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr.slice(-500)}`);
const info = JSON.parse(packed.stdout)[0];
console.log(JSON.stringify({ tarball: path.join(out, info.filename), size: info.size, files: info.entryCount, manifest: built.manifest }, null, 2));
