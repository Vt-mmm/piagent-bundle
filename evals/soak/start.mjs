#!/usr/bin/env node
// Starts the long-task soak lane (piagent repo, evals/long-task-soak-v1) on one arm, in the background-friendly foreground.
//
//   LANE=<copy of evals/long-task-soak-v1's parent> BUNDLE=<built bundle> \
//     node evals/soak/start.mjs --arm A|B --work <dir> [--scenario long-node-inventory-platform]
//
// LANE is a copy of the lane (`evals/long-task-soak-v1` with its `node_modules/ws` reachable) patched with
// lane-cmd-arm.patch so it can drive any command over Pi's RPC protocol. Both arms get a private agent dir and a copy of
// the Agent Watch binding; nothing is written to ~/.pi/agent or ~/.piagent/agent.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (i % 2 ? acc : [...acc, [v.replace(/^--/, ''), all[i + 1]]]), []));
if (!a.arm || !a.work || !process.env.LANE) { console.error('usage: LANE=<dir> [BUNDLE=<dir>] start.mjs --arm A|B --work <dir> [--scenario id]'); process.exit(2); }
const NODE = process.env.EVAL_NODE_BIN ?? '/opt/homebrew/Cellar/node@22/22.23.3/bin';
const agentDir = path.join(a.work, 'agent'), sessionDir = path.join(a.work, 'sessions');
fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
const source = process.env.BINDING ?? path.join(os.homedir(), '.pi', 'agent', 'agent-watch-managed.json');
const base = { PATH: `${NODE}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin`, HOME: os.homedir(), LANG: 'en_US.UTF-8', PI_CODING_AGENT_DIR: agentDir };
let arm;
if (a.arm === 'A') {
  fs.copyFileSync(source, path.join(agentDir, 'agent-watch-managed.json'));
  fs.chmodSync(path.join(agentDir, 'agent-watch-managed.json'), 0o600);
  arm = { argv: [path.join(NODE, 'node'), '/opt/homebrew/bin/piagent', 'studio', '--rpc', '--project', '{project}'], env: base };
} else {
  const bundle = process.env.BUNDLE;
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.copyFileSync(source, path.join(agentDir, 'binding.json'));
  fs.chmodSync(path.join(agentDir, 'binding.json'), 0o600);
  const { prepareAgentDir } = await import('../../src/launcher.mjs');
  prepareAgentDir(agentDir);
  const pkg = n => path.join(bundle, 'pi', 'packages', `piagent-${n}`);
  arm = {
    argv: [path.join(NODE, 'node'), path.join(bundle, 'pi', 'bin', 'pi'), '--no-extensions', '--no-approve', '--no-skills', '--no-prompt-templates', '--offline',
      '-e', pkg('harness'), '-e', pkg('sandbox'), '-e', pkg('provider'), '--mode', 'rpc'],
    env: { ...base, PI_CODING_AGENT_SESSION_DIR: sessionDir, AGENT_WATCH_MANAGED_BINDING: path.join(agentDir, 'binding.json'), PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' },
  };
}
const child = spawn(path.join(NODE, 'node'), [path.join(process.env.LANE, 'long-task-soak-v1', 'runner.mjs'), '--surface', 'terminal', '--scenario', a.scenario ?? 'long-node-inventory-platform', '--work-root', path.join(a.work, 'soak')],
  { env: { ...process.env, SOAK_ARM_JSON: JSON.stringify(arm) }, stdio: 'inherit' });
child.on('close', code => process.exit(code ?? 1));
