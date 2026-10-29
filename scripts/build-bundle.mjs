#!/usr/bin/env node
// Builds a bundle directory: the bundle's own Pi (npm ci from pi-lock, no install scripts), the three
// packages at the commits bundle.pins.json names, and manifest.json with a sha256 per part.
//
//   node scripts/build-bundle.mjs --out <dir> [--pins bundle.pins.json] [--bundle-version 0.1.0]
//        [--source provider=<git clone>] [--source sandbox=<git clone>] [--source harness=<git clone>]
//
// A package comes from the local clone given with --source (its pinned commit must be there) or, without
// one, from its public repository. Nothing is written outside --out and npm's own cache.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, PI_VERSION } from '../src/manifest.mjs';
import { doctor } from '../src/doctor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..');
const PACKAGES = { harness: 'piagent-harness', sandbox: 'piagent-sandbox', provider: 'piagent-provider' };
// The packages live inside the Pi part: Node finds @earendil-works/* by walking up to pi/node_modules.
export const PI_PART = 'pi';
export const packagePath = name => `${PI_PART}/packages/${PACKAGES[name]}`;
const PI_BIN = `#!/usr/bin/env node\n// The bundle's own Pi (see ../package.json). Nothing else is loaded.\nimport '../node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js';\n`;
const HASH = /^[0-9a-f]{40}$/;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 << 20, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${String(result.stderr || result.error?.message || '').slice(-600)}`);
  return result.stdout;
}

function parseArgs(argv) {
  const out = { sources: {}, pins: path.join(repo, 'bundle.pins.json'), bundleVersion: JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i], value = () => { if (i + 1 >= argv.length) throw new Error(`missing value for ${flag}`); return argv[++i]; };
    if (flag === '--out') out.out = path.resolve(value());
    else if (flag === '--pins') out.pins = path.resolve(value());
    else if (flag === '--bundle-version') out.bundleVersion = value();
    else if (flag === '--source') { const [name, dir] = value().split('='); if (!PACKAGES[name] || !dir) throw new Error('--source <provider|sandbox|harness>=<dir>'); out.sources[name] = path.resolve(dir); }
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!out.out) throw new Error('--out <dir> is required');
  return out;
}

// The tree of `commit` in a local clone, or fetched from the public repository.
function exportCommit({ source, url, commit }, into) {
  fs.mkdirSync(into, { recursive: true });
  let git = source;
  if (!git) {
    git = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-src-'));
    run('git', ['init', '-q', git]);
    run('git', ['-C', git, 'fetch', '-q', '--depth', '1', url, commit]);
  }
  const tar = spawnSync('git', ['-C', git, 'archive', '--format=tar', commit], { maxBuffer: 256 << 20 });
  if (tar.status !== 0) throw new Error(`commit ${commit} is not in ${git}: ${tar.stderr}`);
  run('tar', ['-x', '-C', into], { input: tar.stdout, encoding: 'buffer' });
}

// Only what the package ships: package.json, LICENSE and its "files" (default src).
function copyShipped(from, to) {
  const manifest = JSON.parse(fs.readFileSync(path.join(from, 'package.json'), 'utf8'));
  for (const entry of new Set(['package.json', 'LICENSE', ...(manifest.files ?? ['src'])])) {
    if (path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..')) throw new Error(`unsafe files entry: ${entry}`);
    const source = path.join(from, entry);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(to, entry), { recursive: true, dereference: false });
  }
  return manifest;
}

function checkPackage(name, manifest) {
  const problems = [];
  if (manifest.name !== PACKAGES[name]) problems.push(`name ${manifest.name}`);
  for (const key of ['preinstall', 'install', 'postinstall', 'prepare']) if (manifest.scripts?.[key]) problems.push(`install script ${key}`);
  if (Object.keys(manifest.dependencies ?? {}).length) problems.push('runtime dependencies (a package must rely on the bundle\'s Pi only)');
  const peer = manifest.peerDependencies?.['@earendil-works/pi-coding-agent'];
  if (peer !== PI_VERSION) problems.push(`pi peer ${peer}`);
  if (problems.length) throw new Error(`${PACKAGES[name]}: ${problems.join('; ')}`);
}

export function buildBundle({ out, pins, sources = {}, bundleVersion }) {
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`${out} is not empty`);
  const pinned = JSON.parse(fs.readFileSync(pins, 'utf8'));
  if (pinned.pi !== PI_VERSION) throw new Error(`pins name Pi ${pinned.pi}, the bundle supports ${PI_VERSION}`);
  const pi = path.join(out, PI_PART);
  fs.mkdirSync(path.join(pi, 'bin'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(repo, 'pi-lock', file), path.join(pi, file));
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--no-update-notifier'], { cwd: pi });
  const installed = JSON.parse(fs.readFileSync(path.join(pi, 'node_modules/@earendil-works/pi-coding-agent/package.json'), 'utf8')).version;
  if (installed !== PI_VERSION) throw new Error(`installed Pi ${installed}`);
  fs.writeFileSync(path.join(pi, 'bin', 'pi'), PI_BIN, { mode: 0o755 });
  const parts = { pi: { version: installed, path: PI_PART, dir: pi } };
  for (const name of Object.keys(PACKAGES)) {
    const pin = pinned.packages?.[name];
    if (!pin || !HASH.test(pin.commit ?? '') || typeof pin.repository !== 'string') throw new Error(`bundle.pins.json: no commit for ${name}`);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-export-'));
    try {
      exportCommit({ source: sources[name], url: pin.repository, commit: pin.commit }, scratch);
      const dest = path.join(out, packagePath(name));
      fs.mkdirSync(dest, { recursive: true });
      const manifest = copyShipped(scratch, dest);
      checkPackage(name, manifest);
      parts[name] = { version: manifest.version, path: packagePath(name), dir: dest, commit: pin.commit };
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  }
  const manifest = buildManifest({ bundleVersion, parts });
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, doctor: doctor(out) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const result = buildBundle(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.doctor.ok ? 0 : 1);
  } catch (error) { console.error(`build-bundle: ${error.message}`); process.exit(2); }
}
