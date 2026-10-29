import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useStore } from '../store';
import type { Interest, Pace } from '../types';
import { CITIES } from '../data/places';
import { planAsText } from '../lib/export';
import { sendUserMessage } from '../ai/orchestrator';
import { Bookmark, Download, Map as MapIcon, Pencil, Share, Logo } from './Icons';
import { EditDay, MapView, Overview, inr } from './TripViews';
import type { TripView } from './TripViews';

const INTERESTS: Interest[] = ['culture', 'adventure', 'nature', 'food', 'relax', 'spiritual', 'shopping', 'nightlife'];
const PACES: Pace[] = ['relaxed', 'balanced', 'packed'];

function Assumed({ field }: { field: string }) {
  const assumed = useStore((s) => s.trip.assumed);
  return assumed.includes(field) ? <span className="assumed" title="I filled this in. Change it if it is wrong.">assumed</span> : null;
}

function TripSummary() {
  const trip = useStore((s) => s.trip);
  const setTrip = useStore((s) => s.setTrip);
  const itinerary = useStore((s) => s.itinerary);
  const busy = useStore((s) => s.busy);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(true);
  const hasPlan = itinerary.length > 0;
  // fold the form away once a plan exists so the itinerary gets the space
  useEffect(() => {
    setOpen(!hasPlan);
  }, [hasPlan]);

  const edit = (p: Parameters<typeof setTrip>[0], field: string) => {
    setTrip({ ...p, assumed: trip.assumed.filter((a) => a !== field) });
    setDirty(true);
  };

  function replan() {
    setDirty(false);
    const city = trip.destination || 'the same place';
    void sendUserMessage(
      `Please re-plan ${trip.days} days in ${city} for ${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}, budget ₹${trip.budgetINR}, ${trip.pace} pace${trip.interests.length ? ', interests: ' + trip.interests.join(', ') : ''}${trip.dietary !== 'none' ? ', ' + trip.dietary : ''}.`,
    );
  }

  return (
    <div className="card summary">
      <div className="card-head">
        <h2>Trip details</h2>
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {!open && (
        <p className="summary-line">
          {[trip.destination || 'No destination yet', `${trip.days} day${trip.days > 1 ? 's' : ''}`, `${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}`, inr(trip.budgetINR), `${trip.pace} pace`, trip.dietary !== 'none' ? trip.dietary : '', ...trip.interests].filter(Boolean).join(' · ')}
        </p>
      )}
      {open && (
        <div className="fields">
          <label>
            <span>Destination <Assumed field="destination" /></span>
            <select
              value={trip.cityId ?? ''}
              onChange={(e) => {
                const c = CITIES.find((x) => x.id === e.target.value);
                edit({ cityId: c?.id, destination: c?.name ?? '' }, 'destination');
              }}
            >
              <option value="">Not chosen yet</option>
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Start date <Assumed field="startDate" /></span>
            <input type="date" value={trip.startDate} onChange={(e) => edit({ startDate: e.target.value }, 'startDate')} />
          </label>
          <label>
            <span>Days <Assumed field="days" /></span>
            <input type="number" min={1} max={5} value={trip.days} onChange={(e) => edit({ days: Math.max(1, Math.min(5, Number(e.target.value) || 1)) }, 'days')} />
          </label>
          <label>
            <span>Travelers <Assumed field="travelers" /></span>
            <input type="number" min={1} max={12} value={trip.travelers} onChange={(e) => edit({ travelers: Math.max(1, Number(e.target.value) || 1), soloTraveler: Number(e.target.value) === 1 }, 'travelers')} />
          </label>
          <label>
            <span>Budget (₹) <Assumed field="budgetINR" /></span>
            <input type="number" min={0} step={1000} value={trip.budgetINR} onChange={(e) => edit({ budgetINR: Math.max(0, Number(e.target.value) || 0) }, 'budgetINR')} />
          </label>
          <label>
            <span>Pace <Assumed field="pace" /></span>
            <select value={trip.pace} onChange={(e) => edit({ pace: e.target.value as Pace }, 'pace')}>
              {PACES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Food</span>
            <select value={trip.dietary} onChange={(e) => edit({ dietary: e.target.value as any }, 'dietary')}>
              <option value="none">No preference</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </label>
          <div className="field-wide">
            <span>Interests <Assumed field="interests" /></span>
            <div className="chips">
              {INTERESTS.map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip ${trip.interests.includes(i) ? 'selected' : ''}`}
                  aria-pressed={trip.interests.includes(i)}
                  onClick={() => edit({ interests: trip.interests.includes(i) ? trip.interests.filter((x) => x !== i) : [...trip.interests, i] }, 'interests')}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {dirty && trip.cityId && (
        <div className="replan">
          <span>You changed trip details.</span>
          <button className="btn primary sm" disabled={busy} onClick={replan}>
            {itinerary.length ? 'Re-plan with these' : 'Plan this trip'}
          </button>
        </div>
      )}
    </div>
  );
}

const dm = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function dateRange(start: string, days: number) {
  const a = new Date(start + 'T00:00:00');
  if (isNaN(a.getTime())) return '';
  const b = new Date(a);
  b.setDate(b.getDate() + Math.max(0, days - 1));
  return `${dm(a)} – ${dm(b)} ${b.getFullYear()}`;
}
function budgetLabel(trip: { budgetINR: number; days: number; travelers: number }) {
  const per = trip.budgetINR / Math.max(1, trip.days * trip.travelers);
  return per < 2500 ? 'Budget' : per < 6000 ? 'Moderate Budget' : 'Premium';
}

export function TripPanel() {
  const itinerary = useStore((s) => s.itinerary);
  const trip = useStore((s) => s.trip);
  const activeDay = useStore((s) => s.activeDay);
  const saveTrip = useStore((s) => s.saveTrip);
  const [view, setView] = useState<TripView>('overview');;
  const [details, setDetails] = useState(false);
  const day = itinerary.find((d) => d.day === activeDay) ?? itinerary[0];
  const has = itinerary.length > 0;
  const flash = (m: string) => toast.success(m);

  async function share() {
    const text = planAsText(trip, itinerary);
    try {
      if (navigator.share) await navigator.share({ title: `${trip.destination} trip`, text });
      else {
        await navigator.clipboard.writeText(text);
        flash('Trip copied to clipboard.');
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <section className="trip panel" aria-label="Your trip">
      <div className="panel-head trip-head">
        <div className="panel-title">
          <span className="tripicon"><MapIcon width={20} height={20} /></span>
          <span className="who">
            <b>{has ? `${trip.destination} Trip` : 'Your trip'}</b>
            {has && (
              <small>
                {dateRange(trip.startDate, itinerary.length)} · {trip.travelers} Traveler{trip.travelers > 1 ? 's' : ''} · {budgetLabel(trip)}
              </small>
            )}
          </span>
        </div>
        {has && (
          <div className="row-tools">
            <button className={`btn sm ${details ? 'on' : ''}`} onClick={() => setDetails(!details)} aria-pressed={details}><Pencil width={16} height={16} /> <span className="lbl">Details</span></button>
            <button className="btn sm" onClick={share}><Share width={16} height={16} /> <span className="lbl">Share</span></button>
            <button
              className="btn sm"
              onClick={() => {
                saveTrip();
                flash('Saved to My Trips.');
              }}
            >
              <Bookmark width={16} height={16} /> <span className="lbl">Save</span>
            </button>
            <button className="btn sm primary" onClick={() => useStore.getState().setDialog('exportOpen', true)}>
              <Download width={16} height={16} /> <span className="lbl">Export</span>
            </button>
          </div>
        )}
      </div>
      <div className="trip-scroll">
        {view === 'overview' && (!has || details) && <TripSummary />}
        {has && day ? (
          <motion.div key={view + (view === 'overview' ? day.day : '')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          {view === 'map' ? (
            <MapView onBack={() => setView('overview')} />
          ) : view === 'edit' ? (
            <EditDay day={day} onBack={() => setView('overview')} />
          ) : (
            <Overview day={day} setView={setView} />
          )}
          </motion.div>
        ) : (
          <div className="empty">
            <Logo size={44} />
            <h3>Your itinerary will appear here</h3>
            <p>Chat on the left. As soon as I know where you are going, I will build a day-by-day plan with travel times between stops, and you can keep changing it by chatting.</p>
          </div>
        )}
      </div>
    </section>
  );
}
