import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PI_VERSION = '1.3.0';
export const PARTS = ['pi', 'harness', 'sandbox', 'provider'];

export function hashDir(dir) {
  const hash = crypto.createHash('sha256');
  const walk = rel => {
    const abs = path.join(dir, rel);
    for (const name of fs.readdirSync(abs).sort()) {
      const next = path.join(rel, name);
      const stat = fs.lstatSync(path.join(dir, next));
      if (stat.isDirectory()) walk(next);
      else if (stat.isFile()) hash.update(`${next.split(path.sep).join('/')}\0`).update(fs.readFileSync(path.join(dir, next))).update('\0');
    }
  };
  walk('');
  return hash.digest('hex');
}

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
