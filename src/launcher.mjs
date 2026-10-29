import fs from 'node:fs';
import path from 'node:path';
import { doctor } from './doctor.mjs';

export const BINDING_ENV = 'AGENT_WATCH_MANAGED_BINDING';
// Pi's own network use (install telemetry, the pi.dev version check, model catalog refresh) stays off:
// the only server a company session talks to is Studio, through the provider.
export const QUIET_ENV = Object.freeze({ PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' });

// Argv and env for the company runtime. Only the bundle's own Pi and the three
// bundle packages load (`--no-extensions` keeps just the `-e` paths). Nothing
// the project itself carries may add code or prompts: no project approval
// (a trusted project would start the MCP servers its config names, outside the
// sandbox), no skills, no prompt templates; and Pi makes no network call of
// its own (remote catalog, version check, telemetry). `command` is a Node script
// (`#!/usr/bin/env node`); the caller runs it with the Node it pinned. The
// environment is the whole environment: the caller adds PATH and TERM, nothing else.
export function launchPlan({ root, manifest, agentDir, sessionDir, bindingPath }) {
  const part = name => path.join(root, manifest.parts[name].path);
  return {
    command: path.join(part('pi'), 'bin', 'pi'),
    args: ['--no-extensions', '--no-approve', '--no-skills', '--no-prompt-templates', '--offline', '-e', part('harness'), '-e', part('sandbox'), '-e', part('provider'), '-e', 'builtin:mcp'],
    env: { PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir, ...QUIET_ENV, ...(bindingPath ? { [BINDING_ENV]: bindingPath } : {}) },
  };
}

// The company agent dir: private, and scoped to the one company model. Existing
// settings are kept; only the keys below are set.
export function prepareAgentDir(agentDir, { maxRetries = 3 } = {}) {
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const file = path.join(agentDir, 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new dir */ }
  settings.enabledModels = ['studio/agent-watch-auto'];
  settings.retry = { ...settings.retry, enabled: true, maxRetries };
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  return file;
}

// The check and the launch together: the bundle is verified (and the manifest against the digest the binding pins) immediately before the plan
// is handed out, so the caller spawns the command it returns in the same breath. Throws with the problems named.
export function prepareLaunch({ root, agentDir, sessionDir, expect }) {
  const result = doctor(root, { expect });
  if (!result.ok) throw new Error(`managed-bundle-untrusted: ${result.problems.join(', ')}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  return launchPlan({ root, manifest, agentDir, sessionDir });
}
