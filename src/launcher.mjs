import path from 'node:path';

// Argv and env for the company runtime. Only the bundle's own Pi and the three
// bundle packages load (`--no-extensions` keeps just the `-e` paths).
export function launchPlan({ root, manifest, agentDir, sessionDir }) {
  const part = name => path.join(root, manifest.parts[name].path);
  return {
    command: path.join(part('pi'), 'bin', 'pi'),
    args: ['--no-extensions', '-e', part('harness'), '-e', part('sandbox'), '-e', part('provider'), '-e', 'builtin:mcp'],
    env: { PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: sessionDir },
  };
}
