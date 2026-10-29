// The end-to-end rig: a real bundle (scripts/build-bundle.mjs), the simulated Studio and broker, and a temporary
// agent dir, HOME, binding and project. Pi runs exactly as launchPlan says; nothing outside the temporary
// directory is read or written, and nothing real is called.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from '../../../scripts/build-bundle.mjs';
import { launchPlan, prepareAgentDir } from '../../../src/launcher.mjs';
import { E2EStudio } from './studio.mjs';
import { brokerProgram, manifestFor } from './broker.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const DRIVER = path.join(repo, 'tests/e2e/helpers/drive.py');
const real = dir => fs.realpathSync(dir);

// One bundle per test process. E2E_BUNDLE names a prebuilt one; E2E_SOURCE_<NAME> a local clone to take a package from.
let bundle = null;
export function theBundle() {
  if (bundle) return bundle;
  if (process.env.E2E_BUNDLE) {
    const root = real(process.env.E2E_BUNDLE);
    return (bundle = { root, manifest: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) });
  }
  const root = path.join(real(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bundle-'))), 'bundle');
  const sources = Object.fromEntries(['provider', 'sandbox', 'harness'].filter(n => process.env[`E2E_SOURCE_${n.toUpperCase()}`]).map(n => [n, process.env[`E2E_SOURCE_${n.toUpperCase()}`]]));
  const built = buildBundle({ out: root, pins: path.join(repo, 'bundle.pins.json'), sources, bundleVersion: '0.0.0-e2e' });
  if (!built.doctor.ok) throw new Error(`bundle does not verify: ${JSON.stringify(built.doctor)}`);
  return (bundle = { root, manifest: built.manifest });
}

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });

// The project the model fixes: add() subtracts; the test says 2 + 3 is 5; AGENTS.md names the check.
export function writeProject(dir) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true }); fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2));
  fs.writeFileSync(path.join(dir, 'src/add.js'), 'export const add = (a, b) => a - b;\n');
  fs.writeFileSync(path.join(dir, 'test/add.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/add.js';\ntest('add', () => assert.equal(add(2, 3), 5));\n");
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Fixture\n\n## Checks\n\n- `npm test`\n');
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'fixture');
}

export const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : []);

// options: scripts (model script per role), workflow, extra (manifest.harness.configuration), insertAfterHarness / append
// (extra `-e` paths), env.
export async function startRig(t, options = {}) {
  const { root, manifest } = theBundle();
  const dir = real(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-rig-')));
  const studio = await new E2EStudio({ scripts: options.scripts ?? {} }).listen();
  const studioManifest = manifestFor(studio.origin, { workflow: options.workflow, extra: options.extra });
  const broker = path.join(dir, 'broker.mjs');
  fs.writeFileSync(broker, brokerProgram(studio.origin, studioManifest), { mode: 0o700 });
  const bindingPath = path.join(dir, 'agent-watch-managed-pi.json');
  fs.writeFileSync(bindingPath, JSON.stringify({ schema_version: 1, runtime: 'pi', profile_id: 'd'.repeat(64), origin: studio.origin, broker }));
  const agentDir = path.join(dir, 'agent'), sessionDir = path.join(dir, 'ManagedSessions'), home = path.join(dir, 'home'), project = path.join(dir, 'project');
  for (const d of [sessionDir, home, project]) fs.mkdirSync(d, { recursive: true });
  prepareAgentDir(agentDir);
  writeProject(project);
  const plan = launchPlan({ root, manifest, agentDir, sessionDir, bindingPath });
  const args = [...plan.args];
  if (options.insertAfterHarness) args.splice(args.indexOf('-e') + 2, 0, ...options.insertAfterHarness.flatMap(p => ['-e', p]));
  for (const p of options.append ?? []) args.push('-e', p);
  const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, TERM: 'xterm-256color', ...plan.env, ...options.env };
  t.after(async () => { await studio.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const rig = { dir, studio, project, agentDir, sessionDir, home, bindingPath, plan, args, env, root, manifest, studioManifest,
    // The simulated Studio lives in this process, so Pi runs asynchronously.
    run(prompt, { timeout = 120_000 } = {}) {
      return new Promise(resolve => {
        const child = spawn(process.execPath, [plan.command, ...args, '-p', prompt], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
        child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
        child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
      });
    },
    // Everything the run left on disk and on screen, for secret greps.
    everything(extra = []) {
      const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };   // the status file goes away when Pi exits
      return [...extra, ...files(dir).filter(f => f !== broker).map(read)].join('\n');
    } };
  return rig;
}

export const hasPython = spawnSync('python3', ['--version']).status === 0;
