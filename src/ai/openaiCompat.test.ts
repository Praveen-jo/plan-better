// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openaiCompatAdapter, toOpenAIMessages } from './openaiCompat';
import { TOOLS } from './tools';
import { defaultSettings } from '../store';
import type { ApiMessage } from '../store';
import type { StreamEvent } from './adapter';

const settings = { ...defaultSettings, aiMode: 'claude' as const, provider: 'gemini' as const, apiKey: 'test-key' };

/** Fake streaming response, deliberately chopped at awkward byte boundaries. */
function sse(lines: string[], chunk = 7): Response {
  const bytes = new TextEncoder().encode(lines.map((l) => `data: ${l}\n\n`).join(''));
  const body = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(messages: ApiMessage[] = [{ role: 'user', content: 'hi' }]) {
  const out: StreamEvent[] = [];
  for await (const ev of openaiCompatAdapter.stream({ system: 'SYS', messages, tools: TOOLS, settings })) out.push(ev);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe('toOpenAIMessages', () => {
  it('converts system, tool_use and tool_result', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'plan jaipur' },
      { role: 'assistant', content: [{ type: 'text', text: 'On it' }, { type: 'tool_use', id: 't1', name: 'update_trip', input: { days: 3 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'OK' }] },
    ];
    const out = toOpenAIMessages('SYS', msgs);
    expect(out[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(out[1]).toEqual({ role: 'user', content: 'plan jaipur' });
    expect(out[2]).toEqual({ role: 'assistant', content: 'On it', tool_calls: [{ id: 't1', type: 'function', function: { name: 'update_trip', arguments: '{"days":3}' } }] });
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'OK' });
  });
});

describe('openaiCompatAdapter stream', () => {
  it('sends tools in OpenAI format and Bearer auth', async () => {
    const f = vi.fn().mockResolvedValue(sse(['[DONE]']));
    vi.stubGlobal('fetch', f);
    await collect();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(init.headers.authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(true);
    expect(body.tools[0]).toEqual({ type: 'function', function: { name: TOOLS[0].name, description: TOOLS[0].description, parameters: TOOLS[0].input_schema } });
  });

  it('streams text deltas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }), JSON.stringify({ choices: [{ delta: { content: 'lo!' } }] }), '[DONE]'])));
    const evs = await collect();
    expect(evs.filter((e) => e.type === 'text').map((e: any) => e.text).join('')).toBe('Hello!');
  });

  it('assembles fragmented tool calls, generates a missing id, keeps order', async () => {
    const d = (tool_calls: any[]) => JSON.stringify({ choices: [{ delta: { tool_calls } }] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sse([
          d([{ index: 0, id: 'call_a', function: { name: 'update_trip', arguments: '' } }]),
          d([{ index: 0, function: { arguments: '{"days":' } }]),
          d([{ index: 1, function: { name: 'suggest_followups', arguments: '{"chips"' } }]), // no id from provider
          d([{ index: 0, function: { arguments: '3}' } }]),
          d([{ index: 1, function: { arguments: ':["a"]}' } }]),
          '[DONE]',
        ]),
      ),
    );
    const evs = (await collect()).filter((e) => e.type === 'tool_use') as Extract<StreamEvent, { type: 'tool_use' }>[];
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ id: 'call_a', name: 'update_trip', input: { days: 3 } });
    expect(evs[1].name).toBe('suggest_followups');
    expect(evs[1].id).toMatch(/^call_/);
    expect(evs[1].input).toEqual({ chips: ['a'] });
  });

  it.each([
    [401, /key was rejected/],
    [429, /rate limit.*Demo mode/i],
  ])('maps HTTP %i to a friendly message', async (status, re) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'x' } }), { status })));
    await expect(collect()).rejects.toThrow(re);
  });

  it('maps a network/CORS failure to a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(collect()).rejects.toThrow(/network or CORS.*Demo mode/s);
  });

  it('asks for a key when one is needed', async () => {
    const run = async () => {
      for await (const _ of openaiCompatAdapter.stream({ system: '', messages: [], tools: [], settings: { ...settings, apiKey: '' } })) void _;
    };
    await expect(run()).rejects.toThrow(/No API key/);
  });

  it('does not need a key for Ollama', async () => {
    const f = vi.fn().mockResolvedValue(sse(['[DONE]']));
    vi.stubGlobal('fetch', f);
    for await (const _ of openaiCompatAdapter.stream({ system: '', messages: [], tools: [], settings: { ...settings, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '' } })) void _;
    expect(f.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
    expect(f.mock.calls[0][1].headers.authorization).toBeUndefined();
  });
});

// Real round trip, only when a key is supplied: GEMINI_API_KEY=... npm test
describe.skipIf(!process.env.GEMINI_API_KEY)('live Gemini round trip', () => {
  it('returns text or a tool call from the free tier', async () => {
    const evs: StreamEvent[] = [];
    for await (const ev of openaiCompatAdapter.stream({
      system: 'You plan trips. Always call update_trip when the user names a destination.',
      messages: [{ role: 'user', content: 'Plan 2 days in Jaipur' }],
      tools: TOOLS,
      settings: { ...settings, apiKey: process.env.GEMINI_API_KEY! },
    }))
      evs.push(ev);
    console.log(JSON.stringify(evs).slice(0, 400));
    expect(evs.length).toBeGreaterThan(0);
  }, 60000);
});
