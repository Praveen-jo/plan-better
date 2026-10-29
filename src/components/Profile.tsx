import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useStore } from '../store';
import type { Interest, Pace, Profile, UserProfile } from '../types';
import { UserAvatar, TONES } from './Brand';
import { Toggle } from './Dialogs';
import { Download, Gear, Plane, Shield } from './Icons';

const INTERESTS: { id: Interest; label: string }[] = [
  { id: 'culture', label: 'Heritage' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'relax', label: 'Wellness' },
  { id: 'spiritual', label: 'Spiritual' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'nightlife', label: 'Nightlife' },
];
const PACES: { id: Pace; label: string; sub: string }[] = [
  { id: 'relaxed', label: 'Relaxed', sub: '2 stops a day' },
  { id: 'balanced', label: 'Balanced', sub: '3 stops a day' },
  { id: 'packed', label: 'Packed', sub: '4+ stops a day' },
];
const PERSONAS: { id: Profile; label: string }[] = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'unspecified', label: 'Prefer not to say' },
];
const THEMES = [
  { id: 'sunrise', label: 'Sunrise', a: '#F6C945', b: '#E0527A' },
  { id: 'blush', label: 'Blush', a: '#FFD25A', b: '#D6246E' },
  { id: 'honey', label: 'Honey', a: '#FFC400', b: '#BE185D' },
] as const;

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function Card({ title, sub, icon, children }: { title: string; sub?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="pcard">
      <header>
        {icon && <span className="pcard-ic">{icon}</span>}
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProfileScreen({ onPlan }: { onPlan: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const saved = useStore((s) => s.saved);
  const me = settings.me;
  const patch = (p: Partial<UserProfile>) => setSettings({ me: { ...me, ...p } });

  const stats = useMemo(
    () => ({
      trips: saved.length,
      days: saved.reduce((n, t) => n + t.itinerary.length, 0),
      cities: new Set(saved.map((t) => t.trip.destination).filter(Boolean)).size,
    }),
    [saved],
  );
  const since = new Date(me.joined).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

  function choosePersona(p: Profile) {
    setSettings({ profile: p, safetyAware: p === 'woman' ? true : p === 'unspecified' ? false : settings.safetyAware });
  }

  function exportData() {
    const { apiKey: _k, keys: _ks, ...safe } = settings;
    download('plan-better-my-data.json', { exportedAt: new Date().toISOString(), settings: safe, savedTrips: saved });
    toast.success('Your data was downloaded. API keys are not included.');
  }

  return (
    <section className="panel profile" aria-label="Your profile">
      <motion.div className="profile-hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <UserAvatar size={92} />
        <div className="profile-id">
          <input className="name-input" value={me.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Your name" aria-label="Your name" maxLength={40} />
          <small>
            {me.email || 'Add an email to label your exports'} · Planning since {since}
          </small>
          <div className="tones" role="radiogroup" aria-label="Avatar colour">
            {(Object.keys(TONES) as (keyof typeof TONES)[]).map((t) => (
              <button key={t} role="radio" aria-checked={me.avatarTone === t} aria-label={t} className={`tone ${me.avatarTone === t ? 'on' : ''}`} style={{ background: TONES[t][0] }} onClick={() => patch({ avatarTone: t })} />
            ))}
          </div>
        </div>
        <ul className="stats">
          <li><b>{stats.trips}</b><span>Saved trips</span></li>
          <li><b>{stats.days}</b><span>Days planned</span></li>
          <li><b>{stats.cities}</b><span>Cities</span></li>
        </ul>
      </motion.div>

      <div className="profile-grid">
        <Card title="About you" sub="Only stored in this browser." icon={<Plane width={18} height={18} />}>
          <label className="field">
            <span>Email (optional)</span>
            <input type="email" value={me.email} onChange={(e) => patch({ email: e.target.value.trim() })} placeholder="you@example.com" autoComplete="off" />
          </label>
          <label className="field">
            <span>Home city</span>
            <input type="text" value={me.homeCity} onChange={(e) => patch({ homeCity: e.target.value })} placeholder="Where do you travel from?" />
          </label>
          <div className="field">
            <span>Travelling as (optional)</span>
            <div className="chips">
              {PERSONAS.map((p) => (
                <button key={p.id} className={`chip ${settings.profile === p.id ? 'selected' : ''}`} aria-pressed={settings.profile === p.id} onClick={() => choosePersona(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={settings.safetyAware} onChange={(v) => setSettings({ safetyAware: v })} label="Safety-aware planning" hint="Evenings end by 9:30 PM and busy areas come first." />
        </Card>

        <Card title="Travel style" sub="These become the defaults for every new trip and for the assistant." icon={<Shield width={18} height={18} />}>
          <div className="field">
            <span>Pace</span>
            <div className="pace-row">
              {PACES.map((p) => (
                <button key={p.id} className={`pace ${me.pace === p.id ? 'on' : ''}`} aria-pressed={me.pace === p.id} onClick={() => patch({ pace: p.id })}>
                  <b>{p.label}</b>
                  <small>{p.sub}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Interests</span>
            <div className="chips">
              {INTERESTS.map((i) => (
                <button key={i.id} className={`chip ${me.interests.includes(i.id) ? 'selected' : ''}`} aria-pressed={me.interests.includes(i.id)} onClick={() => patch({ interests: me.interests.includes(i.id) ? me.interests.filter((x) => x !== i.id) : [...me.interests, i.id] })}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Food</span>
            <div className="chips">
              {(['none', 'vegetarian', 'vegan'] as const).map((d) => (
                <button key={d} className={`chip ${me.dietary === d ? 'selected' : ''}`} aria-pressed={me.dietary === d} onClick={() => patch({ dietary: d })}>
                  {d === 'none' ? 'No preference' : d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>
              Budget per person per day <b className="val">{inr(me.budgetPerDay)}</b>
            </span>
            <input type="range" min={1500} max={15000} step={500} value={me.budgetPerDay} onChange={(e) => patch({ budgetPerDay: Number(e.target.value) })} aria-label="Budget per person per day" />
          </div>
          <div className="field">
            <span>Usually travelling with</span>
            <div className="stepper">
              <button onClick={() => patch({ travelers: Math.max(1, me.travelers - 1) })} aria-label="Fewer travellers">−</button>
              <b>
                {me.travelers} traveller{me.travelers > 1 ? 's' : ''}
              </b>
              <button onClick={() => patch({ travelers: Math.min(12, me.travelers + 1) })} aria-label="More travellers">+</button>
            </div>
          </div>
          <button className="btn cta full" onClick={onPlan}>
            Plan a trip with these defaults
          </button>
        </Card>

        <Card title="Assistant and voice" icon={<Gear width={18} height={18} />}>
          <Toggle checked={settings.speakReplies} onChange={(v) => setSettings({ speakReplies: v })} label="Speak replies aloud" />
          <div className="set-row">
            <span>AI mode</span>
            <b>{settings.aiMode === 'mock' ? 'Demo (offline)' : `Live · ${settings.provider}`}</b>
          </div>
          <button className="btn" onClick={() => useStore.getState().setDialog('settingsOpen', true)}>
            <Gear width={16} height={16} /> AI, voice and appearance settings
          </button>
          <div className="field">
            <span>Theme</span>
            <div className="themes">
              {THEMES.map((t) => (
                <button key={t.id} className={`theme-pick ${settings.theme === t.id ? 'on' : ''}`} aria-pressed={settings.theme === t.id} onClick={() => setSettings({ theme: t.id })}>
                  <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.a} 50%, ${t.b} 50%)` }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={settings.mode === 'dark'} onChange={(v) => setSettings({ mode: v ? 'dark' : 'light' })} label="Dark mode" />
        </Card>

        <Card title="Your data" sub="Everything lives in this browser. Nothing is sent to a server except your chat to the AI provider you choose." icon={<Download width={18} height={18} />}>
          <button className="btn" onClick={exportData}>
            <Download width={16} height={16} /> Download my data
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (!saved.length) return toast('No saved trips to clear.');
              if (confirm(`Delete all ${saved.length} saved trips? This cannot be undone.`)) {
                saved.forEach((t) => useStore.getState().deleteTrip(t.id));
                toast.success('Saved trips cleared.');
              }
            }}
          >
            Clear saved trips
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Reset your profile and preferences? Saved trips stay.')) {
                setSettings({ me: { ...useStore.getState().settings.me, name: '', email: '', homeCity: '', interests: [], dietary: 'none', pace: 'balanced', budgetPerDay: 4000, travelers: 2 }, profile: 'unspecified', safetyAware: false });
                toast.success('Profile reset.');
              }
            }}
          >
            Reset profile
          </button>
        </Card>
      </div>
    </section>
  );
}
