import { create } from 'zustand';
import type { ChatMessage, Day, SavedTrip, Settings, TripParams, UserProfile, Violation } from './types';
import { markChanged } from './lib/planner';
import { SHARED_GEMINI_KEY } from './ai/providers';

export type ApiBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ApiBlock[];
}

const SETTINGS_KEY = 'wanderly.settings.v1';
const TRIPS_KEY = 'wanderly.trips.v1';

export const defaultSettings: Settings = {
  theme: 'sunrise',
  mode: 'light',
  density: 'comfortable',
  textSize: 'md',
  view: 'timeline',
  aiMode: SHARED_GEMINI_KEY ? 'claude' : 'mock', // the deployed site ships a shared key, so it starts live
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  keys: {},
  apiKey: '',
  model: 'gemini-2.5-flash',
  speakReplies: false,
  voiceLang: 'en-IN',
  voiceName: '',
  voiceRate: 1,
  handsFree: false,
  profile: 'unspecified',
  safetyAware: false,
  me: {
    name: '',
    email: '',
    homeCity: '',
    avatarTone: 'sun',
    dietary: 'none',
    pace: 'balanced',
    interests: [],
    budgetPerDay: 4000,
    travelers: 2,
    joined: new Date().toISOString(),
  },
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable, ignore */
  }
}

function loadSettings(): Settings {
  const saved = readJSON<Partial<Settings>>(SETTINGS_KEY, {});
  // settings saved before providers existed were Anthropic-only
  if (saved.aiMode === 'claude' && !saved.provider) Object.assign(saved, { provider: 'anthropic', baseUrl: 'https://api.anthropic.com' });
  return { ...defaultSettings, ...saved, me: { ...defaultSettings.me, ...(saved.me ?? {}) } };
}

export function nextSaturday(from = new Date()): string {
  const d = new Date(from);
  const add = ((6 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + add);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** New trips start from the profile's preferences. */
export const emptyTrip = (me: UserProfile = defaultSettings.me): TripParams => ({
  destination: '',
  startDate: nextSaturday(),
  days: 3,
  budgetINR: Math.max(1000, Math.round((me.budgetPerDay * 3 * me.travelers) / 1000) * 1000),
  travelers: me.travelers,
  soloTraveler: me.travelers === 1,
  pace: me.pace,
  interests: [...me.interests],
  dietary: me.dietary,
  notes: '',
  assumed: [],
});

interface State {
  settings: Settings;
  trip: TripParams;
  itinerary: Day[];
  past: Day[][];
  future: Day[][];
  violations: Violation[];
  messages: ChatMessage[];
  apiMessages: ApiMessage[];
  busy: boolean;
  stage: string;
  activeDay: number;
  tab: 'chat' | 'trip';
  settingsOpen: boolean;
  exportOpen: boolean;
  savedOpen: boolean;
  saved: SavedTrip[];
  draft: string;

  setSettings: (p: Partial<Settings>) => void;
  setTrip: (p: Partial<TripParams>) => void;
  setItinerary: (days: Day[], opts?: { highlight?: boolean }) => void;
  setViolations: (v: Violation[]) => void;
  clearHighlights: () => void;
  undo: () => void;
  redo: () => void;
  addMessage: (m: ChatMessage) => void;
  patchMessage: (id: string, p: Partial<ChatMessage>) => void;
  pushApi: (m: ApiMessage) => void;
  setBusy: (busy: boolean, stage?: string) => void;
  setStage: (s: string) => void;
  setActiveDay: (n: number) => void;
  setTab: (t: 'chat' | 'trip') => void;
  setDialog: (k: 'settingsOpen' | 'exportOpen' | 'savedOpen', v: boolean) => void;
  setDraft: (s: string) => void;
  newChat: () => void;
  saveTrip: () => void;
  loadTrip: (id: string) => void;
  deleteTrip: (id: string) => void;
}

export const useStore = create<State>((set, get) => ({
  settings: loadSettings(),
  trip: emptyTrip(loadSettings().me),
  itinerary: [],
  past: [],
  future: [],
  violations: [],
  messages: [],
  apiMessages: [],
  busy: false,
  stage: '',
  activeDay: 1,
  tab: 'chat',
  settingsOpen: false,
  exportOpen: false,
  savedOpen: false,
  saved: readJSON<SavedTrip[]>(TRIPS_KEY, []),
  draft: '',

  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    writeJSON(SETTINGS_KEY, settings);
    set({ settings });
  },
  setTrip: (p) => set({ trip: { ...get().trip, ...p } }),
  setItinerary: (days, opts) => {
    const cur = get().itinerary;
    const next = opts?.highlight === false ? days : markChanged(cur, days);
    set({ itinerary: next, past: [...get().past, cur].slice(-30), future: [] });
    if (get().activeDay > next.length) set({ activeDay: 1 });
  },
  setViolations: (violations) => set({ violations }),
  clearHighlights: () =>
    set({ itinerary: get().itinerary.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.changed ? { ...b, changed: false } : b)) })) }),
  undo: () => {
    const { past, itinerary, future } = get();
    if (!past.length) return;
    set({ itinerary: past[past.length - 1], past: past.slice(0, -1), future: [itinerary, ...future] });
  },
  redo: () => {
    const { past, itinerary, future } = get();
    if (!future.length) return;
    set({ itinerary: future[0], future: future.slice(1), past: [...past, itinerary] });
  },
  addMessage: (m) => set({ messages: [...get().messages, m] }),
  patchMessage: (id, p) => set({ messages: get().messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }),
  pushApi: (m) => set({ apiMessages: [...get().apiMessages, m] }),
  setBusy: (busy, stage = '') => set({ busy, stage }),
  setStage: (stage) => set({ stage }),
  setActiveDay: (activeDay) => set({ activeDay }),
  setTab: (tab) => set({ tab }),
  setDialog: (k, v) => set({ [k]: v } as any),
  setDraft: (draft) => set({ draft }),
  newChat: () =>
    set({ trip: emptyTrip(get().settings.me), itinerary: [], past: [], future: [], violations: [], messages: [], apiMessages: [], busy: false, stage: '', activeDay: 1, draft: '' }),
  saveTrip: () => {
    const { trip, itinerary, saved } = get();
    if (!itinerary.length) return;
    const entry: SavedTrip = { id: `t${Date.now()}`, savedAt: new Date().toISOString(), trip, itinerary };
    const next = [entry, ...saved].slice(0, 20);
    writeJSON(TRIPS_KEY, next);
    set({ saved: next });
  },
  loadTrip: (id) => {
    const t = get().saved.find((s) => s.id === id);
    if (!t) return;
    set({ trip: t.trip, itinerary: t.itinerary, past: [], future: [], violations: [], activeDay: 1, savedOpen: false });
  },
  deleteTrip: (id) => {
    const next = get().saved.filter((s) => s.id !== id);
    writeJSON(TRIPS_KEY, next);
    set({ saved: next });
  },
}));
