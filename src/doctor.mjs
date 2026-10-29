import fs from 'node:fs';
import path from 'node:path';
import { verifyManifest, PI_VERSION } from './manifest.mjs';

export function doctor(root) {
  const file = path.join(root, 'manifest.json');
  if (!fs.existsSync(file)) return { ok: false, problems: ['manifest-missing'], hint: 'Cài lại bộ (Sửa cài đặt).' };
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = verifyManifest(root, manifest);
  if (manifest.piVersion !== PI_VERSION) problems.push(`pi-version:${manifest.piVersion}`);
  return { ok: !problems.length, problems, bundleVersion: manifest.bundleVersion, hint: problems.length ? 'Bộ không khớp hash: dùng Sửa cài đặt trong Agent Watch để cài lại.' : undefined };
}
