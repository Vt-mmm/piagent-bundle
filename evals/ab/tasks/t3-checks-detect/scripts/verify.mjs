import { spawnSync } from 'node:child_process';
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
for (const dir of ['tests/unit/*.test.js', 'tests/integration/*.test.js']) {
  const r = spawnSync(process.execPath, ['--test', dir], { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
