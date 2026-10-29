import { useStore } from '../store';
import { useWikiImage } from '../lib/images';
import { PLACE_BY_ID } from '../data/places';
import { UserAvatar } from './Brand';
import { Calendar, Chevron, User, Pin } from './Icons';
import { inr } from './TripViews';

const CATS = [
  { label: 'Local Culture', q: ['Jaipur City Palace', 'Jaipur'], prompt: '3 days in Jaipur for two, culture and history' },
  { label: 'Historic Forts', q: ['Amber Fort'], prompt: 'Weekend in Jaipur, historic forts and sunsets, around 20k' },
  { label: 'Authentic Food', q: ['Rajasthani cuisine', 'Dal baati churma'], prompt: '3 days in Jaipur for two, food focused, vegetarian friendly' },
  { label: 'Shopping', q: ['Johari Bazaar', 'Bapu Bazaar Jaipur'], prompt: '2 days in Jaipur, shopping and street food, around 15k' },
];

function CatCard({ label, q, onPick }: { label: string; q: string[]; onPick: () => void }) {
  const src = useWikiImage(q, 400);
  return (
    <button className="cat-card" onClick={onPick}>
      <span className="cat-img">{src && <img src={src} alt="" />}</span>
      <span>{label}</span>
    </button>
  );
}

export function CategoryCards({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="cat-cards" role="group" aria-label="Ideas to start with">
      {CATS.map((c) => (
        <CatCard key={c.label} label={c.label} q={c.q} onPick={() => onPick(c.prompt)} />
      ))}
    </div>
  );
}

/** Summary card shown in the chat once a plan exists (jumps to the trip on phones). */
export function TripCard() {
  const trip = useStore((s) => s.trip);
  const itinerary = useStore((s) => s.itinerary);
  const setTab = useStore((s) => s.setTab);
  const first = itinerary[0]?.blocks.find((b) => b.placeId && PLACE_BY_ID[b.placeId]?.kind === 'activity');
  const src = useWikiImage([`${first?.placeId ? PLACE_BY_ID[first.placeId].name : ''} ${trip.destination}`, trip.destination], 500);
  const tags = trip.interests.slice(0, 4);
  return (
    <div className="trip-card">
      <span className="trip-card-img">{src && <img src={src} alt="" />}</span>
      <div className="trip-card-body">
        <h4>{trip.destination} Trip</h4>
        <p className="meta">
          <span><Calendar width={14} height={14} /> {itinerary.length} Days</span>
          <span><User width={14} height={14} /> {trip.travelers} Traveler{trip.travelers > 1 ? 's' : ''}</span>
          <span><Pin width={14} height={14} /> {inr(trip.budgetINR)}</span>
        </p>
        <div className="tags">
          {tags.map((t) => (
            <span key={t} className="tag pinkish">{t}</span>
          ))}
        </div>
        <button className="btn cta sm full" onClick={() => setTab('trip')}>
          View Full Itinerary <Chevron width={16} height={16} />
        </button>
      </div>
    </div>
  );
}

export function UserBadge() {
  return (
    <span className="avatar me" aria-hidden="true">
      <UserAvatar size={32} />
    </span>
  );
}
