import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { toast } from 'sonner';
import { useStore } from '../store';
import type { Profile, Provider, Settings } from '../types';
import { PROVIDERS, presetFor } from '../ai/providers';
import { exportICS, exportJSON, planAsText, printItinerary, DISCLAIMER } from '../lib/export';
import { listVoices } from '../voice/tts';
import { Bookmark, Calendar, Chevron, Close, Code, FileDoc, Link } from './Icons';

function Modal({ title, onClose, children, side = false }: { title: string; onClose: () => void; children: React.ReactNode; side?: boolean }) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={`modal ${side ? 'side' : ''}`} aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
          <div className="modal-head">
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close className="icon-btn" aria-label="Close">
              <Close />
            </Dialog.Close>
          </div>
          <div className="modal-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Toggle({ checked, onChange, label, hint, small = false, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; small?: boolean; disabled?: boolean }) {
  return (
    <label className={`switch ${small ? 'small' : ''}`}>
      <Switch.Root className="sw" checked={checked} onCheckedChange={onChange} disabled={disabled}>
        <Switch.Thumb className="sw-thumb" />
      </Switch.Root>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <ToggleGroup.Root className="seg" type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label}>
      {options.map((o) => (
        <ToggleGroup.Item key={o.id} value={o.id} className={value === o.id ? 'on' : ''}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

const THEMES: { id: Settings['theme']; label: string; a: string; b: string }[] = [
  { id: 'sunrise', label: 'Sunrise', a: '#FFC93C', b: '#C21F63' },
  { id: 'blush', label: 'Blush', a: '#FFD25A', b: '#D6246E' },
  { id: 'honey', label: 'Honey', a: '#FFC400', b: '#BE185D' },
];

export function SettingsDrawer() {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSettings);
  const close = () => useStore.getState().setDialog('settingsOpen', false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showKey, setShowKey] = useState(false);
  const preset = presetFor(settings.provider);
  const pickProvider = (id: Provider) => {
    const p = presetFor(id);
    set({ provider: id, baseUrl: p.baseUrl, model: p.model, apiKey: settings.keys[id] ?? '' });
  };

  useEffect(() => {
    const load = () => setVoices(listVoices().filter((v) => v.lang.toLowerCase().startsWith('en')));
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);

  return (
    <Modal title="Customise" onClose={close} side>
      <section className="set-sec">
        <h3>Theme</h3>
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-pick ${settings.theme === t.id ? 'on' : ''}`} onClick={() => set({ theme: t.id })} aria-pressed={settings.theme === t.id}>
              <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.a} 50%, ${t.b} 50%)` }} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="set-row">
          <span>Mode</span>
          <Seg label="Mode" value={settings.mode} onChange={(v) => set({ mode: v })} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
        </div>
        <div className="set-row">
          <span>Density</span>
          <Seg label="Density" value={settings.density} onChange={(v) => set({ density: v })} options={[{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }]} />
        </div>
        <div className="set-row">
          <span>Text size</span>
          <Seg label="Text size" value={settings.textSize} onChange={(v) => set({ textSize: v })} options={[{ id: 'sm', label: 'Small' }, { id: 'md', label: 'Medium' }, { id: 'lg', label: 'Large' }]} />
        </div>
        <div className="set-row">
          <span>Itinerary view</span>
          <Seg label="Itinerary view" value={settings.view} onChange={(v) => set({ view: v })} options={[{ id: 'cards', label: 'Cards' }, { id: 'timeline', label: 'Timeline' }]} />
        </div>
      </section>

      <section className="set-sec">
        <h3>Travelling as</h3>
        <p className="muted">Optional. This only picks helpful defaults, and you can change everything. Nothing is stored on a server.</p>
        <Seg<Profile>
          label="Travelling as"
          value={settings.profile}
          onChange={(v) => set({ profile: v, safetyAware: v === 'woman' ? true : v === 'unspecified' ? false : settings.safetyAware })}
          options={[
            { id: 'woman', label: 'Woman' },
            { id: 'man', label: 'Man' },
            { id: 'nonbinary', label: 'Non-binary' },
            { id: 'unspecified', label: 'Prefer not to say' },
          ]}
        />
        <Toggle checked={settings.safetyAware} onChange={(v) => set({ safetyAware: v })} label="Safety-aware planning" hint="Evenings end by 9:30 PM, busy areas first, share-trip option." />
      </section>

      <section className="set-sec">
        <h3>Voice</h3>
        <Toggle checked={settings.speakReplies} onChange={(v) => set({ speakReplies: v })} label="Speak replies aloud" />
        <Toggle checked={settings.handsFree} onChange={(v) => set({ handsFree: v, speakReplies: v ? true : settings.speakReplies })} label="Hands-free conversation" hint="Listens, replies out loud, then listens again." />
        <div className="set-row">
          <span>Language</span>
          <select value={settings.voiceLang} onChange={(e) => set({ voiceLang: e.target.value, voiceName: '' })}>
            <option value="en-IN">English (India)</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="hi-IN">Hindi</option>
            <option value="ta-IN">Tamil</option>
            <option value="kn-IN">Kannada</option>
          </select>
        </div>
        <div className="set-row">
          <span>Voice</span>
          <select value={settings.voiceName} onChange={(e) => set({ voiceName: e.target.value })}>
            <option value="">Automatic</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="set-row">
          <span>Speed {settings.voiceRate.toFixed(1)}x</span>
          <input type="range" min={0.7} max={1.4} step={0.1} value={settings.voiceRate} onChange={(e) => set({ voiceRate: Number(e.target.value) })} aria-label="Speaking speed" />
        </div>
      </section>

      <section className="set-sec">
        <h3>AI</h3>
        <Seg label="AI mode" value={settings.aiMode} onChange={(v) => set({ aiMode: v })} options={[{ id: 'mock', label: 'Demo mode (offline)' }, { id: 'claude', label: 'Live AI' }]} />
        {settings.aiMode === 'claude' && (
          <>
            <div className="set-row">
              <span>Provider</span>
              <select value={settings.provider} onChange={(e) => pickProvider(e.target.value as Provider)} aria-label="AI provider">
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {settings.provider !== 'anthropic' && (
              <label className="field">
                <span>Base URL</span>
                <input type="text" value={settings.baseUrl} onChange={(e) => set({ baseUrl: e.target.value.trim() })} spellCheck={false} placeholder="https://.../v1" />
              </label>
            )}
            {preset.needsKey && (
              <label className="field">
                <span>
                  API key
                  {preset.keyUrl && (
                    <>
                      {' '}
                      (<a href={preset.keyUrl} target="_blank" rel="noreferrer">get a free key</a>)
                    </>
                  )}
                </span>
                <div className="inline">
                  <input type={showKey ? 'text' : 'password'} value={settings.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim(), keys: { ...settings.keys, [settings.provider]: e.target.value.trim() } })} placeholder={preset.keyHint} autoComplete="off" spellCheck={false} />
                  <button type="button" className="btn sm" onClick={() => setShowKey(!showKey)}>
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
            )}
            <label className="field">
              <span>Model</span>
              <input type="text" value={settings.model} onChange={(e) => set({ model: e.target.value.trim() })} spellCheck={false} />
            </label>
            <p className="muted">
              {settings.provider === 'ollama' ? 'Ollama runs on your computer; nothing leaves it. No key needed.' : 'The key stays in this browser only (localStorage) and is sent straight to the provider. Use this for a local demo, not a public deployment.'}
              {(settings.provider === 'gemini' || settings.provider === 'groq' || settings.provider === 'custom') && ' Free tiers may use your prompts to improve their models, so do not enter personal details.'}
            </p>
          </>
        )}
        {settings.aiMode === 'mock' && <p className="muted">Demo mode understands the main flow: describe a trip to Goa, Jaipur or Rishikesh, then refine it. Switch to Live AI for open conversation.</p>}
      </section>
    </Modal>
  );
}

export function ExportDialog() {
  const trip = useStore((s) => s.trip);
  const itinerary = useStore((s) => s.itinerary);
  const close = () => useStore.getState().setDialog('exportOpen', false);
  const saveTrip = useStore((s) => s.saveTrip);
  const flash = (m: string) => toast.success(m);
  return (
    <Modal title="Save and export" onClose={close}>
      <div className="export-hero">
        <Suitcase />
        <h3>Save your {trip.destination} itinerary</h3>
        <p>Keep your trip or export it to share with travel companions.</p>
      </div>
      <div className="export-list">
        <button className="export-row primary" onClick={() => { saveTrip(); flash('Saved to My Trips.'); }}>
          <span className="eicon"><Bookmark /></span> Save to My Trips <Chevron width={18} height={18} />
        </button>
        <button className="export-row" onClick={() => { close(); setTimeout(printItinerary, 150); }}>
          <span className="eicon pink"><FileDoc /></span> Download PDF <Chevron width={18} height={18} />
        </button>
        <button className="export-row" onClick={() => exportJSON(trip, itinerary)}>
          <span className="eicon blue"><Code /></span> Export JSON <Chevron width={18} height={18} />
        </button>
        <button
          className="export-row"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(planAsText(trip, itinerary));
              flash('Itinerary copied. Paste it anywhere to share.');
            } catch {
              flash('Could not copy from this browser.');
            }
          }}
        >
          <span className="eicon green"><Link /></span> Share as text <Chevron width={18} height={18} />
        </button>
        <button className="export-row" onClick={() => exportICS(trip, itinerary)}>
          <span className="eicon blue"><Calendar /></span> Add to Calendar (.ics) <Chevron width={18} height={18} />
        </button>
      </div>
      <p className="muted export-note">{DISCLAIMER}</p>
    </Modal>
  );
}

function Suitcase() {
  return (
    <svg width="150" height="130" viewBox="0 0 150 130" aria-hidden="true">
      <rect x="30" y="38" width="90" height="76" rx="14" fill="#f6c945" stroke="#e0a91c" strokeWidth="3" />
      <path d="M58 38v-8a8 8 0 0 1 8-8h18a8 8 0 0 1 8 8v8" stroke="#8a5a1c" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="46" y="38" width="9" height="76" fill="#e0a91c" opacity=".55" />
      <rect x="95" y="38" width="9" height="76" fill="#e0a91c" opacity=".55" />
      <circle cx="75" cy="76" r="11" fill="#fff" opacity=".9" />
      <path d="m69 78 12-8-4 12-3-4Z" fill="#e0527a" />
      <rect x="10" y="60" width="26" height="22" rx="5" fill="#bfe0ea" transform="rotate(-12 23 71)" />
      <rect x="112" y="56" width="26" height="22" rx="5" fill="#ffd3dd" transform="rotate(10 125 67)" />
      <circle cx="40" cy="120" r="5" fill="#8a5a1c" />
      <circle cx="110" cy="120" r="5" fill="#8a5a1c" />
    </svg>
  );
}

export function SavedDialog() {
  const saved = useStore((s) => s.saved);
  const load = useStore((s) => s.loadTrip);
  const del = useStore((s) => s.deleteTrip);
  const close = () => useStore.getState().setDialog('savedOpen', false);
  return (
    <Modal title="Saved trips" onClose={close}>
      {!saved.length && <p className="muted">No saved trips yet. Build one, then use Save and export.</p>}
      <ul className="saved-list">
        {saved.map((t) => (
          <li key={t.id}>
            <div>
              <b>
                {t.trip.destination}, {t.itinerary.length} day{t.itinerary.length > 1 ? 's' : ''}
              </b>
              <span>Saved {new Date(t.savedAt).toLocaleString()}</span>
            </div>
            <div className="inline">
              <button className="btn sm primary" onClick={() => load(t.id)}>
                Open
              </button>
              <button className="btn sm" onClick={() => del(t.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
