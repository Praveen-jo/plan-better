import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useStore } from './store';
import { ChatPanel } from './components/ChatPanel';
import { TripPanel } from './components/TripPanel';
import { ExportDialog, SettingsDrawer } from './components/Dialogs';
import { PrintSheet } from './components/PrintSheet';
import { Bookmark, Chat, Gear, Map as MapIcon, Pin, Plus, User } from './components/Icons';
import { Home } from './components/Home';
import { Explore } from './components/Explore';
import { MyTrips } from './components/MyTrips';
import { ProfileScreen } from './components/Profile';
import { HeroScene, UserAvatar, Wordmark } from './components/Brand';
import { useWikiImage } from './lib/images';
import { resetConversation, sendUserMessage } from './ai/orchestrator';
import { cancelSpeech } from './voice/tts';

type Screen = 'home' | 'app' | 'explore' | 'trips' | 'profile';

export default function App() {
  const settings = useStore((s) => s.settings);
  const itinerary = useStore((s) => s.itinerary);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const setDialog = useStore((s) => s.setDialog);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const exportOpen = useStore((s) => s.exportOpen);
  const newItin = itinerary.length > 0;
  const [tripsTab, setTripsTab] = useState<'upcoming' | 'saved' | 'past'>('upcoming');
  const promo = useWikiImage(['Amber Fort Jaipur'], 500);
  const [screen, setScreen] = useState<Screen>(() => useStore.getState().messages.length ? 'app' : 'home');

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = settings.theme;
    r.dataset.mode = settings.mode;
    r.dataset.density = settings.density;
    r.dataset.text = settings.textSize;
  }, [settings.theme, settings.mode, settings.density, settings.textSize]);

  // when a plan first appears on a phone, jump to it
  useEffect(() => {
    if (newItin && window.matchMedia('(max-width: 900px)').matches) setTab('trip');
  }, [newItin, setTab]);

  const newTrip = () => {
    cancelSpeech();
    resetConversation();
    setTab('chat');
    setScreen('app');
  };
  const ask = (prompt: string) => {
    setTab('chat');
    setScreen('app');
    void sendUserMessage(prompt);
  };

  if (screen === 'home') {
    return (
      <div className="app home-wrap">
        <Home onStart={() => setScreen('app')} onExplore={() => setScreen('explore')} onTrips={() => setScreen('trips')} onProfile={() => setScreen('profile')} />
        {settingsOpen && <SettingsDrawer />}
      </div>
    );
  }

  const nav = (s: Screen, t?: 'chat' | 'trip') => () => {
    setScreen(s);
    if (t) setTab(t);
  };

  return (
    <div className="app shell">
      <a className="skip" href="#msg">Skip to message box</a>
      <aside className="sidebar" aria-label="Main">
        <button className="side-brand" onClick={nav('home')} aria-label="Home">
          <Wordmark size={24} sub />
        </button>
        <button className={`me-chip ${screen === 'profile' ? 'on' : ''}`} onClick={nav('profile')} aria-current={screen === 'profile' ? 'page' : undefined}>
          <UserAvatar size={38} />
          <span>
            <b>{settings.me.name || 'Guest traveller'}</b>
            <small>{settings.me.name ? 'View profile' : 'Set up your profile'}</small>
          </span>
        </button>
        <nav>
          <button className={`side-item primary ${screen === 'app' ? 'on' : ''}`} onClick={newTrip} aria-current={screen === 'app' ? 'page' : undefined}><Plus width={18} height={18} /> New Trip</button>
          <button className={`side-item ${screen === 'trips' && tripsTab !== 'saved' ? 'on' : ''}`} onClick={() => { setTripsTab('upcoming'); setScreen('trips'); }}><Bookmark width={18} height={18} /> My Trips</button>
          <button className={`side-item ${screen === 'explore' ? 'on' : ''}`} aria-current={screen === 'explore' ? 'page' : undefined} onClick={nav('explore')}><Pin width={18} height={18} /> Explore</button>
          <button className={`side-item ${screen === 'trips' && tripsTab === 'saved' ? 'on' : ''}`} onClick={() => { setTripsTab('saved'); setScreen('trips'); }}><Bookmark width={18} height={18} /> Saved</button>
          <button className="side-item" onClick={() => setDialog('settingsOpen', true)}><Gear width={18} height={18} /> Settings</button>
        </nav>
        <div className="side-promo" aria-hidden="true">
          {promo ? <img className="hero-img" src={promo} alt="" /> : <HeroScene />}
          <span>Collect Experiences Not Things</span>
        </div>
      </aside>

      <header className="topbar">
        <button className="side-brand" onClick={nav('home')} aria-label="Home"><Wordmark size={20} /></button>
        <nav className="actions" aria-label="App actions">
          <button className="icon-btn" onClick={newTrip} aria-label="New trip"><Plus /></button>
          <button className="icon-btn" onClick={nav('profile')} aria-label="Profile"><UserAvatar size={30} /></button>
          <button className="icon-btn" onClick={() => setDialog('settingsOpen', true)} aria-label="Settings"><Gear /></button>
        </nav>
      </header>

      <main className={`main show-${tab} ${screen !== 'app' ? 'single' : ''}`}>
        {screen === 'explore' && <Explore onBack={nav('app')} onPick={ask} />}
        {screen === 'profile' && <ProfileScreen onPlan={newTrip} />}
        {screen === 'trips' && <MyTrips tab={tripsTab} onTab={setTripsTab} onOpen={nav('app', 'trip')} onNew={newTrip} />}
        {screen === 'app' && (
          <>
            <ChatPanel />
            <TripPanel />
          </>
        )}
      </main>

      <nav className="bottom-tabs" aria-label="Switch view">
        <button className={screen === 'app' && tab === 'chat' ? 'on' : ''} onClick={nav('app', 'chat')}><Chat /> Chat</button>
        <button className={screen === 'app' && tab === 'trip' ? 'on' : ''} onClick={nav('app', 'trip')}><MapIcon /> Trip</button>
        <button className={screen === 'trips' ? 'on' : ''} onClick={nav('trips')}><Bookmark /> Trips</button>
        <button className={screen === 'explore' ? 'on' : ''} onClick={nav('explore')}><Pin /> Explore</button>
        <button className={screen === 'profile' ? 'on' : ''} onClick={nav('profile')}><User /> Profile</button>
      </nav>

      {settingsOpen && <SettingsDrawer />}
      {exportOpen && newItin && <ExportDialog />}
      <PrintSheet />
      <Toaster position="bottom-center" />
    </div>
  );
}
