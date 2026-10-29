// Test-only extension, loaded last: records what the packages put on the bus and what Pi knows about the tools.
import fs from 'node:fs';

export default function probe(pi) {
  const file = process.env.E2E_PROBE, record = { attest: [], blocked: [], runState: [], permission: [], childTools: [], childClose: [], thinking: [], tools: null };
  const save = () => fs.writeFileSync(file, JSON.stringify(record));
  const strip = ({ reply, stream, ...rest }) => rest;
  pi.events.on('piagent:tools.attest', d => record.attest.push(strip(d)));
  pi.events.on('piagent:tools.blocked', d => record.blocked.push(strip(d)));
  pi.events.on('piagent:run.state', d => { record.runState.push(strip(d)); save(); });
  pi.events.on('piagent:tools.child', d => record.childTools.push(strip(d)));
  pi.events.on('piagent:tools.child.close', d => record.childClose.push(strip(d)));
  pi.events.on('piagent:permission.mode', d => record.permission.push(strip(d)));
  pi.on('session_start', () => { record.tools = pi.getAllTools().map(t => ({ name: t.name, sourceInfo: t.sourceInfo })); save(); });
  // Every level Pi announces, and the one it holds a moment later (the provider puts a forbidden pick back).
  pi.on('thinking_level_select', event => setTimeout(() => { record.thinking.push({ asked: event.level, previous: event.previousLevel, after: pi.getThinkingLevel() }); save(); }, 300));
  pi.on('agent_settled', save);
  pi.on('session_shutdown', save);
}
