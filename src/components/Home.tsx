import { useStore } from '../store';
import { Wordmark, HeroScene, UserAvatar } from './Brand';
import { useWikiImage } from '../lib/images';
import { Chat, Download, Map as MapIcon, Mic, Pencil } from './Icons';

const FEATURES = [
  { icon: <Chat />, label: 'Conversational Planning', tone: 'yellow' },
  { icon: <Pencil />, label: 'Day-by-day Itineraries', tone: 'pink' },
  { icon: <Mic />, label: 'Voice or Text Chat', tone: 'green' },
  { icon: <MapIcon />, label: 'Maps and Local Insights', tone: 'coral' },
  { icon: <Download />, label: 'Save and Export Anywhere', tone: 'pink' },
];

export function Home({ onStart, onExplore, onTrips, onProfile }: { onStart: () => void; onExplore: () => void; onTrips: () => void; onProfile: () => void }) {
  const name = useStore((st) => st.settings.me.name);
  const hero = useWikiImage(['Hawa Mahal Jaipur', 'Jaipur'], 1200);
  return (
    <div className="home">
      <header className="home-nav">
        <Wordmark sub />
        <nav aria-label="Home">
          <button className="link plain on">Home</button>
          <button className="link plain" onClick={onExplore}>Explore</button>
          <button className="link plain" onClick={onTrips}>My Trips</button>
          <button className="link plain me-link" onClick={onProfile}>
            <UserAvatar size={26} /> {name || 'Profile'}
          </button>
        </nav>
      </header>
      <section className="home-hero">
        <div className="home-copy">
          <h1>
            A trip that feels <em>like you.</em>
          </h1>
          <p>Chat or speak with our AI travel assistant to plan personalised itineraries with real experiences.</p>
          <div className="home-cta">
            <button className="btn cta" onClick={onStart}>
              Plan My Trip <span aria-hidden="true">→</span>
            </button>
            <button className="btn ghost-pink" onClick={onExplore}>
              Explore destinations
            </button>
          </div>
        </div>
        <div className="home-art">{hero ? <img className="hero-img" src={hero} alt="Hawa Mahal, Jaipur" /> : <HeroScene />}</div>
      </section>
      <ul className="home-features">
        {FEATURES.map((f) => (
          <li key={f.label}>
            <span className={`ficon ${f.tone}`}>{f.icon}</span>
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
