import { useStore } from '../store';
import type { ApiBlock } from '../store';
import { TOOLS, executeTool } from './tools';
import { buildSystemPrompt } from './prompt';
import { claudeAdapter } from './claude';
import { openaiCompatAdapter, FriendlyError } from './openaiCompat';
import { mockAdapter, resetMock } from './mock';
import { speak } from '../voice/tts';

let abort: AbortController | null = null;
const uid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function resetConversation() {
  abort?.abort();
  resetMock();
  useStore.getState().newChat();
}

export function stopGenerating() {
  abort?.abort();
}

/** One user turn: stream the model, run tools, feed results back, repeat until the model stops calling tools. */
export async function sendUserMessage(text: string, opts: { voice?: boolean } = {}): Promise<string> {
  const store = useStore.getState();
  const clean = text.trim();
  if (!clean || store.busy) return '';

  store.clearHighlights();
  store.addMessage({ id: uid(), role: 'user', text: clean, voice: opts.voice });
  store.pushApi({ role: 'user', content: clean });
  store.setBusy(true, 'Understanding your request');
  abort = new AbortController();

  const ctx = { repairAttempts: 0, onStage: (s: string) => useStore.getState().setStage(s) };
  let spokenText = '';
  let currentId: string | null = null;
  let toolCallsThisTurn = 0;
  let failed = false;

  try {
    for (let iter = 0; iter < 6; iter++) {
      const s = useStore.getState();
      const adapter = s.settings.aiMode !== 'claude' ? mockAdapter : s.settings.provider === 'anthropic' ? claudeAdapter : openaiCompatAdapter;
      const system = buildSystemPrompt(s.settings, s.trip, s.itinerary);
      const content: ApiBlock[] = [];
      const toolUses: { id: string; name: string; input: any }[] = [];
      let textAcc = '';
      currentId = null;

      for await (const ev of adapter.stream({ system, messages: s.apiMessages, tools: TOOLS, settings: s.settings, signal: abort.signal })) {
        if (ev.type === 'text') {
          if (!ev.text) continue;
          textAcc += ev.text;
          const st = useStore.getState();
          if (!currentId) {
            const existing = [...st.messages].reverse().find((m) => m.role === 'assistant' && !m.text && m.chips);
            if (existing) {
              currentId = existing.id;
              st.patchMessage(existing.id, { text: ev.text });
            } else {
              currentId = uid();
              st.addMessage({ id: currentId, role: 'assistant', text: ev.text });
            }
            st.setStage('');
          } else {
            const cur = st.messages.find((m) => m.id === currentId);
            st.patchMessage(currentId, { text: (cur?.text ?? '') + ev.text });
          }
        } else if (ev.type === 'tool_use') {
          toolUses.push({ id: ev.id, name: ev.name, input: ev.input });
          useStore.getState().setStage(ev.name === 'set_itinerary' ? 'Planning your days' : ev.name === 'update_trip' ? 'Updating trip details' : 'Working on it');
        }
      }

      if (textAcc) {
        content.push({ type: 'text', text: textAcc });
        spokenText += (spokenText ? ' ' : '') + textAcc.trim();
      }
      for (const t of toolUses) content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
      if (content.length) useStore.getState().pushApi({ role: 'assistant', content });

      toolCallsThisTurn += toolUses.length;
      if (!toolUses.length) break;

      const results: ApiBlock[] = toolUses.map((t) => {
        const r = executeTool(t.name, t.input, ctx);
        return { type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.isError };
      });
      useStore.getState().pushApi({ role: 'user', content: results });
      useStore.getState().setStage('Writing the reply');
    }
  } catch (e: any) {
    failed = true;
    if (e?.name !== 'AbortError') {
      const message = String(e?.message ?? e);
      useStore.getState().addMessage({
        id: uid(),
        role: 'assistant',
        error: true,
        text: `${message}\n\nTip: you can switch to Demo mode in Settings to keep going offline.`,
      });
    }
    // keep the API history valid after a failure: drop a dangling tool_use turn
    const msgs = useStore.getState().apiMessages;
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && Array.isArray(last.content) && last.content.some((c) => c.type === 'tool_use')) {
      useStore.setState({ apiMessages: msgs.slice(0, -1) });
    }
  } finally {
    useStore.getState().setBusy(false);
    abort = null;
  }

  // small free models sometimes answer in prose instead of calling the planning tools
  const fin = useStore.getState();
  if (fin.settings.aiMode === 'claude' && fin.settings.provider !== 'anthropic' && !toolCallsThisTurn && !failed && spokenText && !spokenText.includes('?')) {
    fin.addMessage({
      id: uid(),
      role: 'assistant',
      error: true,
      text: 'The model replied without updating your trip, so nothing changed. Small free models can be weak at tool calling. Try again, pick a different model in Settings > AI, or switch to Demo mode.',
    });
  }

  if (spokenText && useStore.getState().settings.speakReplies) await speak(spokenText);
  return spokenText;
}
