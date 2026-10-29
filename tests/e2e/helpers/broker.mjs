// A stand-in for the Agent Watch broker: an executable that speaks the managed-broker protocol on stdio
// (one JSON request per line, one JSON reply per line). It makes the grants itself and tells the simulated Studio
// (a test-only route) which token belongs to which role, since the two are separate processes.
// The token prefix is assembled at run time so that no file of the rig contains it literally.
export const brokerProgram = (origin, manifest) => `#!${process.execPath}
import readline from 'node:readline';
import { randomBytes, randomUUID } from 'node:crypto';
const origin = ${JSON.stringify(origin)}, manifest = ${JSON.stringify(manifest)};
const authority = manifest.authority, roles = new Map(), PREFIX = ['as', 'run', ''].join('_');
let run = null;
const post = (path, body) => fetch(origin + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.arrayBuffer());
async function grant(role, slot) {
  const entry = manifest.models[0], key = slot ? role + '#' + slot : role, prior = roles.get(key);
  const role_id = prior?.role_id ?? randomUUID(), token = PREFIX + role_id + '_' + randomBytes(32).toString('base64url');
  const g = { ...authority, run_id: run, role_id, role, model_id: entry.id, provider: entry.owned_by, provider_model_id: entry.provider_model_id, effort: 'medium',
    fence: (prior?.fence ?? 0) + 1, token, expires_at: '2030-01-01T00:00:00Z', profile_id: randomUUID(), ...(slot ? { slot } : {}) };
  roles.set(key, g);
  await post('/__test/grant', { role_key: key, token });
  return g;
}
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async line => {
  const request = JSON.parse(line);
  const reply = body => process.stdout.write(JSON.stringify({ id: request.id, ...body }) + '\\n');
  try {
    if (request.action === 'config') return reply({ result: manifest });
    if (request.action === 'start') { run = randomUUID(); roles.clear(); return reply({ result: await grant('main') }); }
    if (request.action === 'renew' || request.action === 'child') { await post('/__test/event', { action: request.action, role: request.role, slot: request.slot }); return reply({ result: await grant(request.role, request.slot) }); }
    if (request.action === 'close') {
      await post('/__test/event', { action: 'close', role: request.role ?? 'main', slot: request.slot, ...(request.process ? { process: request.process } : {}) });
      if (!request.role || request.role === 'main') run = null;
      return reply({ result: true });
    }
    reply({ error: 'permissionDenied' });
  } catch { reply({ error: 'broker_failed' }); }
});
`;

// The manifest Studio hands the broker for a company key: one model, a review helper, a required workflow.
export function manifestFor(origin, { workflow, extra = {}, features = ['process', 'process-v2', 'process-v3', 'close-retry'] } = {}) {
  const authority = { studio_instance_id: '00000000-0000-4000-8000-000000000001', dataset_epoch: '00000000-0000-4000-8000-000000000002', auth_generation: 1 };
  const model = { id: 'claude-sonnet-5-5', display_name: 'Sonnet', owned_by: 'claude', protocol: 'messages', provider_model_id: 'claude-sonnet-5-5', context_mode: 'provider_default' };
  return { schema_version: 2, credential_mode: 'managed', authority, key_id: '00000000-0000-4000-8000-0000000000a1', user: { id: '00000000-0000-4000-8000-0000000000b1', team_name: 'Team thử' },
    models: [model], thinking_levels: ['off', 'low', 'medium', 'high'], broker_features: features, process_versions: [1, 2, 3], origin,
    harness: { id: 'h', team_id: 't', revision: '1', configuration: { main: { mode: 'auto', model_ids: [model.id] }, review: { mode: 'fixed', model_ids: [model.id] },
      workflow: workflow ?? { plan: 'off', verify: 'require', review: 'require', max_fix_loops: 2, lanes: false, main_web_lookups: 0 }, ...extra } } };
}
