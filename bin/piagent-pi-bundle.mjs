#!/usr/bin/env node
// piagent-pi-bundle: the command of the global npm package @piagent/pi-bundle.
//   doctor [--expect <sha256>]      verify the installed bundle against its manifest (exit 0 only when ok)
//   path                            print the bundle directory Agent Watch opens
//   install | update | repair       run the npm command that installs, updates or reinstalls this package globally
//   (install/update/repair take --prefix <dir> and --dry-run, which prints the command and runs nothing)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctor } from '../src/doctor.mjs';
import { manifestDigest } from '../src/manifest.mjs';

export const PACKAGE = '@piagent/pi-bundle';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'bundle');

export function npmCommand(action, { version, prefix } = {}) {
  const spec = action === 'repair' ? `${PACKAGE}@${version}` : action === 'update' ? `${PACKAGE}@latest` : `${PACKAGE}@${version ?? 'latest'}`;
  return ['npm', ['install', '--global', '--ignore-scripts', ...(action === 'repair' ? ['--force'] : []), ...(prefix ? ['--prefix', prefix] : []), spec]];
}

function main(argv) {
  const [command = 'doctor', ...rest] = argv;
  const flag = name => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : undefined; };
  if (command === 'path') { console.log(bundle); return 0; }
  if (command === 'doctor') {
    const result = doctor(bundle, { expect: flag('--expect') });
    console.log(JSON.stringify({ ...result, bundle, manifestSha256: fs.existsSync(path.join(bundle, 'manifest.json')) ? manifestDigest(path.join(bundle, 'manifest.json')) : null }, null, 2));
    return result.ok ? 0 : 1;
  }
  if (['install', 'update', 'repair'].includes(command)) {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    const [program, args] = npmCommand(command, { version: flag('--version') ?? (command === 'repair' ? version : undefined), prefix: flag('--prefix') });
    if (rest.includes('--dry-run')) { console.log([program, ...args].join(' ')); return 0; }
    return spawnSync(program, args, { stdio: 'inherit' }).status ?? 1;
  }
  console.error('usage: piagent-pi-bundle doctor|path|install|update|repair');
  return 64;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
