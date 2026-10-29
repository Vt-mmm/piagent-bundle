// A simulated Agent Studio for the end-to-end tests: heartbeat, capabilities, the Claude Messages wire with a
// scripted model, and the managed endpoints the harness uses. Nothing here is real; every id and token is synthetic.
// The model is a script per role: each inference request of a role takes that role's next step.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// A step: { text?, tools?: [{ name, input }] } or a function (request) => step.
const block = (index, content) => content.tool
  ? [['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_${randomUUID().replaceAll('-', '').slice(0, 20)}`, name: content.tool, input: {} } }],
    ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(content.input ?? {}) } }],
    ['content_block_stop', { type: 'content_block_stop', index }]]
  : [['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: content.text } }],
    ['content_block_stop', { type: 'content_block_stop', index }]];

export function messagesStream(step) {
  const contents = [...(step.text ? [{ text: step.text }] : []), ...(step.tools ?? []).map(t => ({ tool: t.name, input: t.input }))];
  return [['message_start', { type: 'message_start', message: { id: `msg_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null,
    usage: { input_tokens: 40, output_tokens: 1 } } }],
  ...contents.flatMap((c, i) => block(i, c)),
  ['message_delta', { type: 'message_delta', delta: { stop_reason: step.tools?.length ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }],
  ['message_stop', { type: 'message_stop' }]];
}

export class E2EStudio {
  // scripts: { main: [...steps], review: [...steps] }
  constructor({ scripts = {}, capabilities = ['capabilities.v1', 'requests.cancel.v1', 'managed.settle.v1'] } = {}) {
    Object.assign(this, { scripts, capabilities, grants: new Map(), requests: [], inference: [], managed: [], events: [], sockets: new Set(), boot: randomUUID(), version: '0.40.0' });
  }
  async listen() {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    this.server.on('connection', s => { this.sockets.add(s); s.on('close', () => this.sockets.delete(s)); });
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.origin = `http://127.0.0.1:${this.server.address().port}`;
    return this;
  }
  async close() { for (const s of this.sockets) s.destroy(); await new Promise(resolve => this.server.close(resolve)); }
  roleOf(token) { return this.grants.get(token) ?? null; }
  // The role-scoped request log, in order.
  inferenceOf(role) { return this.inference.filter(r => r.role === role); }
  closeEvents() { return this.events.filter(e => e.action === 'close'); }

  async handle(req, res) {
    const url = new URL(req.url, this.origin), chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8'), token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? req.headers['x-api-key'];
    res.setHeader('x-studio-boot', this.boot); res.setHeader('x-studio-version', this.version); res.setHeader('x-request-id', randomUUID());
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/__test/grant') { const g = JSON.parse(raw); this.grants.set(g.token, g.role_key); this.events.push({ action: 'grant', role: g.role_key }); return json(200, {}); }
    if (url.pathname === '/__test/event') { this.events.push(JSON.parse(raw)); return json(200, {}); }
    if (url.pathname === '/v1/heartbeat') return json(200, { status: 'ready', boot_id: this.boot, version: this.version, started_at: new Date().toISOString() });
    const role = this.roleOf(token);
    this.requests.push({ method: req.method, path: url.pathname, role, raw });
    if (url.pathname === '/v1/capabilities') return json(200, { capabilities: this.capabilities, studio: this.version });
    if (url.pathname === '/studio/v1/managed/disconnects') { res.writeHead(204); return res.end(); }
    if (url.pathname.endsWith('/cancel')) { res.writeHead(202); return res.end(); }
    if (url.pathname.startsWith('/studio/v1/managed/') || url.pathname.startsWith('/v1/managed/')) {
      this.managed.push({ method: req.method, path: url.pathname, role, body: raw ? JSON.parse(raw) : null });
      return role ? json(200, { ok: true, settlement: { outcome: 'recorded' } }) : json(401, { error: { code: 'invalid_run_grant' } });
    }
    if (url.pathname !== '/claude/v1/messages') return json(404, { error: { code: 'not_found' } });
    if (!role) return json(401, { error: { type: 'authentication_error', code: 'invalid_run_grant', message: 'grant lapsed' } });
    const body = JSON.parse(raw), queue = this.scripts[role.split('#')[0]] ?? [];
    const entry = { role, body, index: this.inferenceOf(role).length };
    this.inference.push(entry);
    let step = queue.shift() ?? { text: `(script for ${role} is empty)` };
    if (typeof step === 'function') step = step(entry);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    for (const [name, data] of messagesStream(step)) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  }
}

// Text of every user/tool_result message of a request (what the model was shown last).
export function lastUserText(body) {
  const message = [...(body.messages ?? [])].reverse().find(m => m.role === 'user');
  const content = typeof message?.content === 'string' ? [{ type: 'text', text: message.content }] : message?.content ?? [];
  return content.map(c => c.type === 'text' ? c.text : c.type === 'tool_result' ? (typeof c.content === 'string' ? c.content : (c.content ?? []).map(x => x.text ?? '').join('')) : '').join('\n');
}
export const allText = body => JSON.stringify(body.messages ?? []);
