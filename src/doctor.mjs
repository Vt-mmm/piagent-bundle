import fs from 'node:fs';
import path from 'node:path';
import { verifyManifest, manifestDigest, PI_VERSION } from './manifest.mjs';

// `expect`: the sha256 of manifest.json pinned elsewhere (the binding); without it only the bundle's own consistency is checked.
export function doctor(root, { expect } = {}) {
  const file = path.join(root, 'manifest.json');
  if (!fs.existsSync(file)) return { ok: false, problems: ['manifest-missing'], hint: 'Cài lại bộ (Sửa cài đặt).' };
  const problems0 = expect && manifestDigest(file) !== String(expect).toLowerCase() ? ['manifest-digest-mismatch'] : [];
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [...problems0, ...verifyManifest(root, manifest)];
  if (manifest.piVersion !== PI_VERSION) problems.push(`pi-version:${manifest.piVersion}`);
  return { ok: !problems.length, problems, bundleVersion: manifest.bundleVersion, hint: problems.length ? 'Bộ không khớp hash: dùng Sửa cài đặt trong Agent Watch để cài lại.' : undefined };
}
