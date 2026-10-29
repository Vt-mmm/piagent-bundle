// Spike I1/I4: block built-in slash commands by wrapping the editor's onSubmit,
import fs from 'node:fs';
// and keep the thinking level inside what the (simulated) Harness allows.
import { CustomEditor } from '@earendil-works/pi-coding-agent';
const BLOCKED = /^\/(login|logout|model|scoped-models|share|bug)(\s|$)/;
const ALLOWED_THINKING = new Set(['medium', 'high']);
export default function (pi) {
  pi.registerProvider('fake', { name: 'Fake', api: 'openai-completions', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'x',
    models: [{ id: 'fake-1', name: 'Auto (công ty)', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 8000 }] });
  pi.on('session_start', (_e, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new CustomEditor(tui, theme, keybindings);
      let inner;
      Object.defineProperty(editor, 'onSubmit', {
        get: () => inner && (text => {
          if (BLOCKED.test(text.trim())) {
            editor.setText('');
            ctx.ui.notify(`Lệnh ${text.trim().split(/\s/)[0]} bị chặn trong chế độ công ty.`, 'warning');
            return;
          }
          return inner(text);
        }),
        set: fn => { inner = fn; },
      });
      return editor;
    });
    pi.setModel(ctx.modelRegistry.find('fake', 'fake-1')).then(() => pi.setThinkingLevel('medium'));
  });
  let guard = false;
  pi.on('thinking_level_select', e => {
    if (guard || ALLOWED_THINKING.has(e.level)) return;
    guard = true;
    pi.setThinkingLevel(ALLOWED_THINKING.has(e.previousLevel) ? e.previousLevel : 'medium');
    guard = false;
    if (process.env.SPIKE_LOG) fs.appendFileSync(process.env.SPIKE_LOG, `reverted ${e.level} -> now ${pi.getThinkingLevel()}\n`);
  });
}
