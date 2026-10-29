#!/usr/bin/env node
// One A/B run: copy a task fixture into a fresh work dir, give the prompt to one arm, then judge the result
// with the project's own `## Checks` (independent of the agent's claims).
//
//   node evals/ab/run.mjs --arm A|B --task t1-logic --rep 1 --out <dir>
//
// Arm A: `piagent studio --prompt <text> --json` (installed Piagent), arm B: the bundle's Pi with the three
// packages (`BUNDLE=<dir>` from scripts/build-bundle.mjs). Both run with a private agent dir, a copy of the
// Agent Watch binding (read only), and no other environment. Needs TS_DIR (a `typescript` package dir) for t2.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NODE22 = process.env.EVAL_NODE_BIN ?? '/opt/homebrew/Cellar/node@22/22.23.3/bin';
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS ?? 15 * 60_000);

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  for (const k of ['arm', 'task', 'rep', 'out']) if (!out[k]) throw new Error(`--${k} is required`);
  return out;
}

function walk(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else files.push(path.relative(base, full));
  }
  return files.sort();
}

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const PROTECTED = /^(tests\/|scripts\/|AGENTS\.md$|package\.json$|tsconfig\.json$)/;
const snapshot = dir => Object.fromEntries(walk(dir).map(f => [f, sha(path.join(dir, f))]));

// Commands of the `## Checks` section, as the harness reads them.
export function checksOf(agentsMd) {
  const section = agentsMd.split(/^## Checks\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  return [...section.matchAll(/^\s*[-*]\s+`([^`]+)`/gm)].map(m => m[1]);
}

function cleanEnv(extra = {}) {
  const env = { HOME: os.homedir(), PATH: `${NODE22}:/usr/bin:/bin`, ...extra };
  return env;
}

function runChecks(project) {
  const commands = checksOf(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8'));
  const results = commands.map(command => {
    const r = spawnSync('/bin/sh', ['-c', command], { cwd: project, env: cleanEnv(), encoding: 'utf8', timeout: 120_000 });
    return { command, status: r.status };
  });
  return { commands, ok: results.length > 0 && results.every(r => r.status === 0), results };
}

function armCommand(arm, { project, prompt, agentDir, sessionDir, binding }) {
  if (arm === 'A') {
    return { cmd: path.join(NODE22, 'node'), argv: ['/opt/homebrew/bin/piagent', 'studio', '--project', project, '--prompt', prompt, '--json'], env: cleanEnv({ PI_CODING_AGENT_DIR: agentDir }) };
  }
  const bundle = process.env.BUNDLE;
  if (!bundle) throw new Error('BUNDLE=<built bundle dir> is required for arm B');
  const pkg = name => path.join(bundle, 'pi', 'packages', `piagent-${name}`);
  return {
    cmd: path.join(NODE22, 'node'),
    argv: [path.join(bundle, 'pi', 'bin', 'pi'), '--no-extensions', '--no-approve', '--no-skills', '--no-prompt-templates', '--offline',
      '-e', pkg('harness'), '-e', pkg('sandbox'), '-e', pkg('provider'), '-p', prompt, '--mode', 'json'],
    env: cleanEnv({ PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir, AGENT_WATCH_MANAGED_BINDING: binding, PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' }),
  };
}

// Turn the JSONL event stream into the numbers the table needs. The same code reads both arms.
export function analyze(lines, mutated = () => false) {
  const events = [];
  for (const line of lines) { try { events.push(JSON.parse(line)); } catch { /* partial line */ } }
  let report = null, modelCalls = 0, cost = 0, lastMutation = -1, lastGoodCheck = -1, toolCalls = 0, approvals = 0, harnessRounds = null, toolErrors = 0;
  const calls = new Map();
  const models = new Set();
  let order = 0;
  for (const e of events) {
    if (e.type === 'message_end' && e.message?.role === 'custom' && e.message.customType === 'agent-watch-process') report = e.message.details ?? null;
    else if (e.type === 'message_end' && e.message?.role === 'assistant') {
      modelCalls += 1;
      cost += e.message.usage?.cost?.total ?? 0;
      if (e.message.model) models.add(e.message.model);
      for (const block of e.message.content ?? []) {
        if (block.type !== 'toolCall') continue;
        toolCalls += 1;
        calls.set(block.id, { name: block.name, input: block.arguments ?? {}, order: order += 1 });
        if (['edit', 'write'].includes(block.name) || (block.name === 'bash' && mutated(block.arguments?.command ?? ''))) lastMutation = order;
      }
    } else if (e.type === 'message_end' && e.message?.role === 'toolResult') {
      const call = calls.get(e.message.toolCallId);
      const text = JSON.stringify(e.message.content ?? '');
      if (e.message.isError) toolErrors += 1;
      if (/approval|approve|asks? first|needs? your (ok|permission)/i.test(text) && e.message.isError) approvals += 1;
      if (call?.name === 'bash' && !e.message.isError && /test|tsc|verify|check|lint/.test(call.input.command ?? '')) lastGoodCheck = Math.max(lastGoodCheck, call.order);
    } else if (/approval|permission_request|confirm/i.test(e.type ?? '') && !/entry_appended/.test(e.type)) approvals += 1;
    else if (e.type === 'managed_turn_end') harnessRounds = e.end?.rounds ?? null;
    else if (e.type === 'entry_appended' && e.entry?.customType === 'agent-watch-process') report = e.entry.details ?? null;
    else if (e.type === 'managed_process' || e.type === 'managed_process_report') report = e.details ?? e.process ?? e;
    else if (e.type === 'entry_appended' && e.entry?.customType === 'agent-watch-turn-end') harnessRounds = e.entry.data?.rounds ?? null;
  }
  return { processReport: report, verified: report?.verified ?? null, modelCalls, toolCalls, toolErrors, approvals, harnessRounds, cost: Number(cost.toFixed(4)), models: [...models], agentVerified: lastGoodCheck > lastMutation && lastGoodCheck > 0 };
}

async function main() {
  const a = args(process.argv.slice(2));
  const taskDir = path.join(here, 'tasks', a.task);
  const work = path.join(a.out, 'work', `${a.arm}-${a.task}-${a.rep}`);
  fs.rmSync(work, { recursive: true, force: true });
  const project = path.join(work, 'project');
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(taskDir, project, { recursive: true });
  const prompt = fs.readFileSync(path.join(project, 'task.md'), 'utf8').trim();
  fs.rmSync(path.join(project, 'task.md'));
  if (a.task === 't2-ts-type') {
    const ts = process.env.TS_DIR;
    if (!ts) throw new Error('TS_DIR is required for t2-ts-type');
    fs.mkdirSync(path.join(project, 'node_modules', 'typescript'), { recursive: true });
    fs.cpSync(ts, path.join(project, 'node_modules', 'typescript'), { recursive: true, filter: s => !/\/lib\/(cs|de|es|fr|it|ja|ko|pl|pt-br|ru|tr|zh-cn|zh-tw)$/.test(s) });
  }
  fs.writeFileSync(path.join(work, 'canary.txt'), 'canary\n');
  spawnSync('git', ['init', '-q'], { cwd: project });
  spawnSync('git', ['add', '-A'], { cwd: project });
  spawnSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', 'commit', '-qm', 'fixture', '--no-verify'], { cwd: project });

  const before = snapshot(project);
  const redBefore = !runChecks(project).ok;
  const agentDir = path.join(work, 'agent'), sessionDir = path.join(work, 'sessions');
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const binding = path.join(agentDir, 'binding.json');
  if (a.arm === 'B') fs.mkdirSync(sessionDir, { recursive: true });
  const source = process.env.BINDING ?? path.join(os.homedir(), '.pi', 'agent', 'agent-watch-managed.json');
  fs.copyFileSync(source, a.arm === 'A' ? path.join(agentDir, 'agent-watch-managed.json') : binding);
  fs.chmodSync(a.arm === 'A' ? path.join(agentDir, 'agent-watch-managed.json') : binding, 0o600);
  if (a.arm === 'B') {
    const { prepareAgentDir } = await import('../../src/launcher.mjs');
    prepareAgentDir(agentDir);
  }

  const { cmd, argv, env } = armCommand(a.arm, { project, prompt, agentDir, sessionDir, binding });
  const log = fs.openSync(path.join(work, 'events.jsonl'), 'w'), err = fs.openSync(path.join(work, 'stderr.txt'), 'w');
  const started = Date.now();
  const child = spawn(cmd, argv, { cwd: project, env, stdio: ['ignore', log, err], detached: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, TIMEOUT_MS);
  const exit = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  const seconds = Number(((Date.now() - started) / 1000).toFixed(1));

  const after = snapshot(project);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(f => before[f] !== after[f]);
  const protectedChanged = changed.filter(f => PROTECTED.test(f));
  const outside = fs.readdirSync(work).filter(n => !['project', 'canary.txt', 'agent', 'sessions', 'events.jsonl', 'stderr.txt', 'result.json'].includes(n));
  const canaryOk = fs.readFileSync(path.join(work, 'canary.txt'), 'utf8') === 'canary\n';
  const checks = runChecks(project);
  const events = fs.readFileSync(path.join(work, 'events.jsonl'), 'utf8').split('\n').filter(Boolean);
  const stats = analyze(events, c => />|tee |sed -i|rm |mv |cp /.test(c.replace(/\d?>&\d|[0-9&]?>\s*\/dev\/null/g, '')));
  const result = {
    arm: a.arm, task: a.task, rep: Number(a.rep), redBefore, pass: redBefore && checks.ok && !protectedChanged.length && !outside.length && canaryOk && !timedOut,
    checksOk: checks.ok, protectedChanged, outside, canaryOk, changed, timedOut, exit, seconds, ...stats,
  };
  fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(2); });
