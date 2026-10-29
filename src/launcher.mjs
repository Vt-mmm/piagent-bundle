import path from 'node:path';

// Argv and env for the company runtime. Only the bundle's own Pi and the three
// bundle packages load (`--no-extensions` keeps just the `-e` paths). Nothing
// the project itself carries may add code or prompts: no project approval
// (a trusted project would start the MCP servers its config names, outside the
// sandbox), no skills, no prompt templates; and Pi makes no network call of
// its own (remote catalog, version check, telemetry).
export function launchPlan({ root, manifest, agentDir, sessionDir }) {
  const part = name => path.join(root, manifest.parts[name].path);
  return {
    command: path.join(part('pi'), 'bin', 'pi'),
    args: ['--no-extensions', '--no-approve', '--no-skills', '--no-prompt-templates', '--offline', '-e', part('harness'), '-e', part('sandbox'), '-e', part('provider'), '-e', 'builtin:mcp'],
    env: { PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir, PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' },
  };
}
