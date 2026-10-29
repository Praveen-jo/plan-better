import type { Adapter, StreamArgs, StreamEvent } from './adapter';
import type { ApiMessage } from '../store';
import { presetFor } from './providers';

/** Anthropic-style history -> OpenAI chat messages. */
export function toOpenAIMessages(system: string, messages: ApiMessage[]): any[] {
  const out: any[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
      const calls = m.content
        .filter((b) => b.type === 'tool_use')
        .map((b: any) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const msg: any = { role: 'assistant', content: text || null };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
    } else {
      // tool results must directly follow the assistant tool_calls, then any plain text
      for (const b of m.content) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content });
      }
      const text = m.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

export class FriendlyError extends Error {}

function httpMessage(status: number, detail: string): string {
  if (status === 401 || status === 403) return 'The API key was rejected (bad or missing key). Open Settings > AI and check it, or switch to Demo mode.';
  if (status === 429) return 'The free tier rate limit was hit. Wait about a minute and try again, or switch to Demo mode in Settings.';
  if (status === 404) return `The provider did not recognise the model or URL${detail ? ' (' + detail + ')' : ''}. Check the base URL and model in Settings > AI.`;
  if (status === 502 || status === 503) return 'The model is overloaded right now. Try again in a moment, pick another model in Settings, or use Demo mode.';
  return `AI error ${status}${detail ? ': ' + detail : ''}`;
}

export const openaiCompatAdapter: Adapter = {
  async *stream({ system, messages, tools, settings, signal }: StreamArgs): AsyncGenerator<StreamEvent> {
    const preset = presetFor(settings.provider);
    const baseUrl = (settings.baseUrl || preset.baseUrl).replace(/\/+$/, '');
    if (!baseUrl) throw new FriendlyError('Enter a base URL in Settings > AI, or switch to Demo mode.');
    if (preset.needsKey && !settings.apiKey) {
      throw new FriendlyError(`No API key yet. Open Settings > AI and paste your key, or switch to Demo mode.`);
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify({
          model: settings.model,
          stream: true,
          messages: toOpenAIMessages(system, messages),
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
          tool_choice: 'auto',
        }),
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      const hint = settings.provider === 'ollama' ? ' Is Ollama running? You may need OLLAMA_ORIGINS=* set.' : '';
      throw new FriendlyError(`Could not reach the AI service (network or CORS problem).${hint} Switch to Demo mode to keep going.`);
    }

    if (!res.ok || !res.body) {
      let detail = '';
      try {
        const raw = await res.text();
        try {
          const j = JSON.parse(raw);
          detail = (Array.isArray(j) ? j[0] : j)?.error?.message ?? raw;
        } catch {
          detail = raw;
        }
      } catch {
        /* ignore */
      }
      throw new FriendlyError(httpMessage(res.status, detail.slice(0, 200)));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const calls = new Map<number, { id?: string; name: string; args: string }>();
    let n = 0;

    function* handle(line: string): Generator<StreamEvent, boolean> {
      line = line.trim();
      if (!line.startsWith('data:')) return false;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return true;
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        return false;
      }
      if (ev.error) throw new FriendlyError(httpMessage(Number(ev.error.code) || 500, ev.error.message ?? ''));
      const delta = ev.choices?.[0]?.delta;
      if (!delta) return false;
      if (typeof delta.content === 'string' && delta.content) yield { type: 'text', text: delta.content };
      for (const tc of delta.tool_calls ?? []) {
        const idx = typeof tc.index === 'number' ? tc.index : calls.size;
        let slot = calls.get(idx);
        if (!slot) {
          slot = { id: tc.id, name: '', args: '' };
          calls.set(idx, slot);
        }
        if (tc.id && !slot.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
      }
      return false;
    }

    let done = false;
    while (!done) {
      const r = await reader.read();
      if (r.done) break;
      buffer += decoder.decode(r.value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if ((yield* handle(line)) === true) {
          done = true;
          break;
        }
      }
    }
    if (!done && buffer) yield* handle(buffer);

    for (const [, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
      if (!c.name) continue;
      let input: any = {};
      try {
        input = c.args ? JSON.parse(c.args) : {};
      } catch {
        input = {};
      }
      yield { type: 'tool_use', id: c.id || `call_${Date.now().toString(36)}_${n++}`, name: c.name, input };
    }
  },
};
