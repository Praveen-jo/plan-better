import { useStore } from '../store';
import { useWikiImage } from '../lib/images';
import type { SavedTrip } from '../types';
import { Chevron } from './Icons';

const dm = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function range(t: SavedTrip) {
  const a = new Date(t.trip.startDate + 'T00:00:00');
  if (isNaN(a.getTime())) return '';
  const b = new Date(a);
  b.setDate(b.getDate() + t.itinerary.length - 1);
  return `${dm(a)} – ${dm(b)} ${b.getFullYear()}`;
}

function TripRow({ t, onOpen, onDelete }: { t: SavedTrip; onOpen: () => void; onDelete: () => void }) {
  const src = useWikiImage([t.trip.destination], 300);
  return (
    <li className="trip-row">
      <button className="trip-open" onClick={onOpen}>
        <span className="thumb big">{src && <img src={src} alt="" />}</span>
        <span className="trip-info">
          <b>{t.trip.destination} Trip</b>
          <small>{range(t)}</small>
          <small>
            {t.itinerary.length} Days · {t.trip.travelers} Traveler{t.trip.travelers > 1 ? 's' : ''}
          </small>
        </span>
        <Chevron width={18} height={18} />
      </button>
      <button className="link" onClick={onDelete} aria-label={`Delete ${t.trip.destination} trip`}>
        Delete
      </button>
    </li>
  );
}

export type TripsTab = 'upcoming' | 'saved' | 'past';

export function MyTrips({ tab, onTab, onOpen, onNew }: { tab: TripsTab; onTab: (t: TripsTab) => void; onOpen: () => void; onNew: () => void }) {
  const saved = useStore((s) => s.saved);
  const load = useStore((s) => s.loadTrip);
  const del = useStore((s) => s.deleteTrip);
  const today = new Date().toISOString().slice(0, 10);
  const list = saved.filter((t) => (tab === 'saved' ? true : tab === 'upcoming' ? t.trip.startDate >= today : t.trip.startDate < today));
  return (
    <section className="panel mytrips" aria-label="My trips">
      <div className="explore-head">
        <h2>My Trips</h2>
        <div className="pillset" role="tablist">
          {(['upcoming', 'saved', 'past'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`pill ${tab === k ? 'on' : ''}`} onClick={() => onTab(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {!list.length && (
        <div className="empty">
          <h3>No trips here yet</h3>
          <p>Plan a trip, then press Save to keep it in this browser.</p>
          <button className="btn cta" onClick={onNew}>
            Plan My Trip →
          </button>
        </div>
      )}
      <ul className="trip-list">
        {list.map((t) => (
          <TripRow
            key={t.id}
            t={t}
            onOpen={() => {
              load(t.id);
              onOpen();
            }}
            onDelete={() => del(t.id)}
          />
        ))}
      </ul>
    </section>
  );
}
