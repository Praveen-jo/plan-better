import type { Provider } from '../types';

export interface ProviderPreset {
  id: Provider;
  label: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  keyHint: string;
  keyUrl?: string;
}

/** Endpoints and models checked against the providers' official docs (Oct 2026). Models stay editable in Settings. */
export const PROVIDERS: ProviderPreset[] = [
  { id: 'gemini', label: 'Google Gemini (free tier)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true, keyHint: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq (free tier)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true, keyHint: 'gsk_...', keyUrl: 'https://console.groq.com/keys' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false, keyHint: '' },
  { id: 'anthropic', label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', needsKey: true, keyHint: 'sk-ant-...' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '', needsKey: true, keyHint: 'API key' },
];

export const presetFor = (id: Provider) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
