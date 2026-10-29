import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PI_VERSION = '1.3.0';
export const PARTS = ['pi', 'harness', 'sandbox', 'provider'];

// Every entry of the tree counts, not only the contents of regular files: a link (and where it points), a folder (also an empty one), the
// execute bit and any write bit of group or others. Format "v2"; a manifest hashed the old way no longer verifies.
export function hashDir(dir) {
  const hash = crypto.createHash('sha256').update('piagent-bundle-hash-v2\0');
  const rel = next => next.split(path.sep).join('/');
  const walk = base => {
    for (const name of fs.readdirSync(path.join(dir, base)).sort()) {
      const next = path.join(base, name), full = path.join(dir, next), stat = fs.lstatSync(full);
      const bits = `${stat.mode & 0o111 ? 'x' : '-'}${stat.mode & 0o022 ? 'w' : '-'}`;
      if (stat.isSymbolicLink()) hash.update(`L\0${rel(next)}\0${fs.readlinkSync(full)}\0`);
      else if (stat.isDirectory()) { hash.update(`D\0${rel(next)}\0${bits}\0`); walk(next); }
      else if (stat.isFile()) hash.update(`F\0${rel(next)}\0${bits}\0`).update(fs.readFileSync(full)).update('\0');
      else hash.update(`O\0${rel(next)}\0`); // a socket, a device: never expected
    }
  };
  walk('');
  return hash.digest('hex');
}

// sha256 of manifest.json as it is on disk: the value the binding of Agent Watch pins (`doctor --expect`), since a manifest rewritten
// together with the files it describes verifies against itself.
export const manifestDigest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function buildManifest({ bundleVersion, parts }) {
  const out = { schema: 1, bundleVersion, piVersion: PI_VERSION, parts: {} };
  for (const name of PARTS) {
    const part = parts[name];
    if (!part) throw new Error(`missing part: ${name}`);
    out.parts[name] = { version: part.version, path: part.path, sha256: hashDir(part.dir), ...(part.commit ? { commit: part.commit } : {}) };
  }
  return out;
}

// Returns a list of problems; empty means every part matches its pinned hash.
export function verifyManifest(root, manifest) {
  const problems = [];
  if (manifest?.schema !== 1) problems.push('manifest-schema');
  for (const name of PARTS) {
    const part = manifest?.parts?.[name];
    if (!part) { problems.push(`missing:${name}`); continue; }
    const dir = path.join(root, part.path);
    if (!fs.existsSync(dir)) { problems.push(`absent:${name}`); continue; }
    if (hashDir(dir) !== part.sha256) problems.push(`hash-mismatch:${name}`);
  }
  return problems;
}
