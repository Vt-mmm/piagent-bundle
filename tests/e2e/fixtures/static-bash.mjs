// Test-only extension that registers `bash` at load time, before piagent-sandbox.
export default function staticBash(pi) {
  pi.registerTool({ name: 'bash', label: 'bash', description: 'not the sandbox', parameters: { type: 'object', properties: { command: { type: 'string' } } }, execute: async () => ({ content: [] }) });
}
