import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CITIES, PLACES } from '../data/places';
import { useWikiImage } from '../lib/images';
import type { Interest, Place } from '../types';
import { HeroScene } from './Brand';
import { Calendar, Chevron, Pin, Search, Plane } from './Icons';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const CITY_INFO: Record<string, { photo: string[]; best: string; perDay: number; blurb: string; prompt: string }> = {
  goa: { photo: ['Fort Aguada Goa', 'Goa beach'], best: 'Nov – Feb', perDay: 4500, blurb: 'Sun, sand, Portuguese lanes and seafood by the sea.', prompt: 'Weekend in Goa, relaxed, food and beaches, around 25k' },
  jaipur: { photo: ['Amber Fort Jaipur', 'Jaipur'], best: 'Oct – Mar', perDay: 4000, blurb: 'Pink palaces, hilltop forts and buzzing bazaars.', prompt: '3 days in Jaipur for two, culture and history' },
  rishikesh: { photo: ['Laxman Jhula Rishikesh', 'Rishikesh'], best: 'Sep – Apr', perDay: 3000, blurb: 'Rafting, yoga and calm evenings on the Ganga.', prompt: 'Solo trip to Rishikesh, adventure, 15k' },
};

const FILTERS: { id: Interest | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'culture', label: 'Heritage' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'relax', label: 'Wellness' },
  { id: 'spiritual', label: 'Spiritual' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'nightlife', label: 'Nightlife' },
];

const MOODS = [
  { title: 'Weekend getaway', sub: 'Two easy days, nothing rushed', prompt: 'Weekend in Goa, relaxed, food and beaches, around 25k', tone: 'yellow' },
  { title: 'Culture deep-dive', sub: 'Forts, palaces and bazaars', prompt: '3 days in Jaipur for two, culture and history, around 25k', tone: 'pink' },
  { title: 'Solo adventure', sub: 'Rafting, trails and sunrise yoga', prompt: 'Solo trip to Rishikesh, adventure, 15k', tone: 'green' },
  { title: 'Foodie trail', sub: 'Street food and local classics', prompt: '3 days in Jaipur for two, food focused, vegetarian friendly', tone: 'coral' },
];

function CityCard({ id, name, tagline, onPick, index }: { id: string; name: string; tagline: string; onPick: (p: string) => void; index: number }) {
  const info = CITY_INFO[id];
  const src = useWikiImage(info.photo, 900);
  const count = PLACES.filter((p) => p.city === id && p.kind === 'activity').length;
  return (
    <motion.button className="city-card" onClick={() => onPick(info.prompt)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <span className="city-img">{src ? <img src={src} alt="" /> : <HeroScene />}</span>
      <span className="city-shade" />
      <span className="city-body">
        <b>{name}</b>
        <small>{tagline}</small>
        <span className="city-meta">
          <span><Calendar width={13} height={13} /> Best {info.best}</span>
          <span>~{inr(info.perDay)}/day</span>
          <span>{count} experiences</span>
        </span>
        <span className="city-go">
          Plan a trip <Chevron width={16} height={16} />
        </span>
      </span>
    </motion.button>
  );
}

function ExpCard({ p, onPick, index }: { p: Place; onPick: (prompt: string) => void; index: number }) {
  const city = CITIES.find((c) => c.id === p.city)!;
  const short = p.name.split(/ and |, | trip| walk| visit| viewpoint| sunset/i)[0];
  const src = useWikiImage([`${short} ${city.name}`, short], 500);
  return (
    <motion.button
      className="exp-card"
      onClick={() => onPick(`Plan a trip to ${city.name} and include ${p.name}`)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
    >
      <span className="exp-img">{src && <img src={src} alt="" loading="lazy" />}</span>
      <span className="exp-body">
        <b>{p.name}</b>
        <small>
          <Pin width={12} height={12} /> {city.name} · {Math.round(p.durationMin / 60 * 10) / 10}h · {p.costINR ? inr(p.costINR) : 'Free'}
        </small>
        <span className="tags">
          <span className="tag pinkish">{p.tags[0]}</span>
          <span className="tag">{p.indoor ? 'indoor' : 'outdoor'}</span>
        </span>
      </span>
    </motion.button>
  );
}

export function Explore({ onPick, onBack }: { onPick: (prompt: string) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Interest | 'all'>('all');
  const term = q.trim().toLowerCase();

  const experiences = useMemo(
    () =>
      PLACES.filter((p) => p.kind === 'activity')
        .filter((p) => filter === 'all' || p.tags.includes(filter))
        .filter((p) => !term || p.name.toLowerCase().includes(term) || p.city.includes(term) || p.blurb.toLowerCase().includes(term)),
    [filter, term],
  );
  const cities = useMemo(
    () => CITIES.filter((c) => (!term || c.name.toLowerCase().includes(term)) && (filter === 'all' || PLACES.some((p) => p.city === c.id && p.tags.includes(filter)))),
    [filter, term],
  );

  return (
    <section className="panel explore" aria-label="Explore destinations">
      <div className="explore-hero">
        <div className="explore-hero-text">
          <small className="eyebrow"><Plane width={14} height={14} /> Explore</small>
          <h2>Let's plan your next adventure!</h2>
          <p>Pick a destination, an experience or a mood and I will build the itinerary.</p>
          <form
            className="search big"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim() && !cities.length && !experiences.length) onPick(`Plan a trip to ${q.trim()}`);
            }}
          >
            <Search width={20} height={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where do you want to go?" aria-label="Where do you want to go?" />
            {q && (
              <button type="button" className="link plain" onClick={() => setQ('')}>
                Clear
              </button>
            )}
          </form>
        </div>
        <button className="link plain back" onClick={onBack}>
          Back to chat
        </button>
      </div>

      <div className="filter-row" role="group" aria-label="Filter by interest">
        {FILTERS.map((f) => (
          <button key={f.id} className={`filter ${filter === f.id ? 'on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="section-title">
        <h3>Popular destinations</h3>
        <small>{cities.length} place{cities.length === 1 ? '' : 's'}</small>
      </div>
      <div className="city-grid">
        {cities.map((c, i) => (
          <CityCard key={c.id} id={c.id} name={c.name} tagline={CITY_INFO[c.id].blurb} onPick={onPick} index={i} />
        ))}
        {!cities.length && (
          <div className="empty-note">
            No destination matches yet.{' '}
            {term && (
              <button className="link" onClick={() => onPick(`Plan a trip to ${q.trim()}`)}>
                Ask the assistant to plan "{q.trim()}"
              </button>
            )}
          </div>
        )}
      </div>

      <div className="section-title">
        <h3>Trending experiences</h3>
        <small>{experiences.length} to explore</small>
      </div>
      <div className="exp-grid">
        {experiences.map((p, i) => (
          <ExpCard key={p.id} p={p} onPick={onPick} index={i} />
        ))}
        {!experiences.length && <div className="empty-note">Nothing matches that filter. Try another interest.</div>}
      </div>

      <div className="section-title">
        <h3>Plan by mood</h3>
      </div>
      <div className="mood-grid">
        {MOODS.map((m) => (
          <button key={m.title} className={`mood ${m.tone}`} onClick={() => onPick(m.prompt)}>
            <b>{m.title}</b>
            <small>{m.sub}</small>
            <Chevron width={18} height={18} />
          </button>
        ))}
      </div>
    </section>
  );
}
