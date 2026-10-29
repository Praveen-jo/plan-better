import type { Adapter, StreamArgs, StreamEvent } from './adapter';

/**
 * Calls the Anthropic Messages API straight from the browser (streaming + tool use).
 * DEMO ONLY: the key lives in the browser. For a shared deployment, put a tiny proxy in front.
 */
export const claudeAdapter: Adapter = {
  async *stream({ system, messages, tools, settings, signal }: StreamArgs): AsyncGenerator<StreamEvent> {
    if (!settings.apiKey) throw new Error('No API key yet. Open Settings and paste your Anthropic API key, or switch to Demo mode.');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: settings.model, max_tokens: 4096, system, messages, tools, stream: true }),
    });

    if (!res.ok || !res.body) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j?.error?.message ?? JSON.stringify(j);
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`Claude API error ${res.status}${detail ? ': ' + detail : ''}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const open = new Map<number, { type: string; id?: string; name?: string; json: string }>();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        let ev: any;
        try {
          ev = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        if (ev.type === 'content_block_start') {
          const cb = ev.content_block;
          open.set(ev.index, { type: cb.type, id: cb.id, name: cb.name, json: '' });
        } else if (ev.type === 'content_block_delta') {
          const slot = open.get(ev.index);
          if (ev.delta?.type === 'text_delta') yield { type: 'text', text: ev.delta.text };
          else if (ev.delta?.type === 'input_json_delta' && slot) slot.json += ev.delta.partial_json ?? '';
        } else if (ev.type === 'content_block_stop') {
          const slot = open.get(ev.index);
          if (slot?.type === 'tool_use') {
            let input: any = {};
            try {
              input = slot.json ? JSON.parse(slot.json) : {};
            } catch {
              input = {};
            }
            yield { type: 'tool_use', id: slot.id!, name: slot.name!, input };
          }
          open.delete(ev.index);
        } else if (ev.type === 'error') {
          throw new Error(ev.error?.message ?? 'Stream error');
        }
      }
    }
  },
};
