import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { sendUserMessage, stopGenerating } from '../ai/orchestrator';
import { useSpeechInput } from '../voice/useSpeechInput';
import { cancelSpeech, ttsSupported } from '../voice/tts';
import { Mic, Send, Stop, Volume, VolumeOff, Shield, Chat as ChatIcon } from './Icons';
import { Avatar } from './Brand';
import { Toggle } from './Dialogs';
import { motion } from 'framer-motion';
import { VoiceOverlay } from './VoiceOverlay';
import { CategoryCards, TripCard, UserBadge } from './ChatExtras';
import type { Profile } from '../types';

const STARTERS = [
  'Weekend in Goa, relaxed, food and beaches, around 25k',
  '3 days in Jaipur for two, culture and history',
  'Solo trip to Rishikesh, adventure, 15k',
  'Surprise me with a trip',
];

const PROFILES: { id: Profile; label: string }[] = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'unspecified', label: 'Prefer not to say' },
];

export function ChatPanel() {
  const messages = useStore((s) => s.messages);
  const busy = useStore((s) => s.busy);
  const stage = useStore((s) => s.stage);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pressRef = useRef({ at: 0, handled: false });
  const [voiceMode, setVoiceMode] = useState(false);
  const hasPlan = useStore((s) => s.itinerary.length > 0);

  async function send(text: string, viaVoice = false) {
    if (!text.trim() || useStore.getState().busy) return;
    setDraft('');
    await sendUserMessage(text, { voice: viaVoice });
    const s = useStore.getState().settings;
    if (viaVoice && s.handsFree) voice.start();
  }

  const isPhone = () => window.matchMedia('(max-width: 900px)').matches;

  function startVoiceMode() {
    setVoiceMode(true);
    setSettings({ handsFree: true, speakReplies: true });
    if (!useStore.getState().busy) voice.start();
  }

  function endVoice() {
    voice.abort();
    cancelSpeech();
    setVoiceMode(false);
    setSettings({ handsFree: false });
  }

  const voice = useSpeechInput({
    lang: settings.voiceLang,
    onInterim: (t) => setDraft(t),
    onFinal: (t) => void send(t, true),
  });

  useEffect(() => {
    if (!messages.length && !busy) return; // keep the welcome greeting in view on first load
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, stage]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [draft]);

  const lastAssistantIdx = [...messages].map((m) => (m.role === 'assistant' && (m.text || m.chips) ? 'assistant' : 'other')).lastIndexOf('assistant');
  const hasWork = messages.length > 0;

  function choosePersona(p: Profile) {
    setSettings({ profile: p, safetyAware: p === 'woman' ? true : p === 'unspecified' ? false : settings.safetyAware });
  }

  return (
    <section className="chat panel" aria-label="Chat with your travel concierge">
      <div className="panel-head chat-head">
        <div className="panel-title">
          <Avatar size={44} />
          <span className="who">
            <b>Your Travel Assistant</b>
            <small className="online">Online</small>
            <small className="sub">Ask, speak or type — I'll plan it for you!</small>
          </span>
        </div>
        <div className="row-tools">
          <div className="pillset" role="group" aria-label="Chat mode">
            <button className="pill on" aria-pressed={!voiceMode}><ChatIcon width={16} height={16} /> Chat</button>
            <button
              className="pill"
              disabled={!voice.supported}
              aria-pressed={voiceMode}
              title={voice.supported ? 'Talk to your assistant' : 'Voice input needs Chrome or Edge'}
              onClick={startVoiceMode}
            >
              <Mic width={16} height={16} /> Voice
            </button>
          </div>
          {ttsSupported() && (
            <button
              className={`icon-btn ${settings.speakReplies ? 'on' : ''}`}
              onClick={() => {
                if (settings.speakReplies) cancelSpeech();
                setSettings({ speakReplies: !settings.speakReplies, handsFree: settings.speakReplies ? false : settings.handsFree });
              }}
              aria-pressed={settings.speakReplies}
              aria-label={settings.speakReplies ? 'Turn spoken replies off' : 'Turn spoken replies on'}
              title="Spoken replies"
            >
              {settings.speakReplies ? <Volume /> : <VolumeOff />}
            </button>
          )}
        </div>
      </div>

      <div className="messages" role="log" aria-live="polite" aria-relevant="additions text">
        {!hasWork && (
          <div className="welcome">
            <div className="msg assistant">
              <span className="avatar" aria-hidden="true"><Avatar size={32} /></span>
              <div className="msg-body">
                <div className="bubble">
                  <b>Hi{settings.me.name ? ` ${settings.me.name.split(' ')[0]}` : ''}! I'm your travel assistant.</b>
                  <br />
                  Where would you like to go? Tell me in your own words, type it or tap the mic and talk.{!settings.me.name && ' (Tip: add your name and travel style in your profile and I will plan around them.)'}
                </div>
              </div>
            </div>
            <CategoryCards onPick={(t) => void send(t)} />
            <div className="persona" role="group" aria-label="Optional: tailor the plan to you">
              <span className="persona-label">Optional: travelling as</span>
              <div className="chips">
                {PROFILES.map((p) => (
                  <button key={p.id} className={`chip ${settings.profile === p.id ? 'selected' : ''}`} aria-pressed={settings.profile === p.id} onClick={() => choosePersona(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {settings.safetyAware && (
                <p className="persona-note">
                  <Shield width={16} height={16} /> Safety-aware planning is on: evenings wrap up early, busy areas come first. You can turn it off in Settings.
                </p>
              )}
            </div>
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s} className="starter" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div key={m.id} className={`msg ${m.role} ${m.error ? 'error' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {m.role === 'assistant' && (
              <span className="avatar" aria-hidden="true">
                <Avatar size={32} />
              </span>
            )}
            <div className="msg-body">
              {m.text && (
                <div className="bubble">
                  {m.voice && <span className="voice-tag">voice</span>}
                  {m.text}
                </div>
              )}
              {hasPlan && i === lastAssistantIdx && !busy && <TripCard />}
              {m.chips && i === lastAssistantIdx && !busy && (
                <div className="chips reply-chips">
                  {m.chips.map((c) => (
                    <button key={c} className="chip" onClick={() => void send(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && <UserBadge />}
          </motion.div>
        ))}

        {busy && (
          <div className="msg assistant">
            <span className="avatar" aria-hidden="true">
              <Avatar size={32} />
            </span>
            <div className="bubble thinking" aria-live="polite">
              <span className="dots" aria-hidden="true">
                <i /> <i /> <i />
              </span>
              <span className="stage">{stage || 'Thinking'}</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {voice.error && (
        <div className="voice-error" role="alert">
          {voice.error}
          <button className="link" onClick={voice.clearError}>
            Dismiss
          </button>
        </div>
      )}

      {hasPlan && !busy && (
        <div className="suggest" aria-label="Quick changes">
          {['Make it more relaxed', 'Add an indoor alternative for rain', 'Vegetarian food only', 'Make it cheaper'].map((q) => (
            <button key={q} className="chip" onClick={() => void send(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className={`composer ${voice.listening ? 'listening' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (voice.listening) voice.abort();
          void send(draft);
        }}
      >
        <label htmlFor="msg" className="sr-only">
          Message
        </label>
        <textarea
          id="msg"
          ref={taRef}
          rows={1}
          value={draft}
          placeholder={voice.listening ? 'Listening… speak now' : 'Type or speak…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        {voice.supported ? (
          <button
            type="button"
            className={`mic ${voice.listening ? 'live' : ''}`}
            disabled={busy}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? 'Stop listening' : 'Start voice input. Hold to talk, or tap to toggle.'}
            title="Tap to talk. Hold for push-to-talk."
            onPointerDown={() => {
              if (isPhone()) return; // on phones the mic opens the avatar voice screen instead of dictating
              if (!voice.listening && !busy) {
                pressRef.current = { at: Date.now(), handled: true };
                voice.start();
              }
            }}
            onPointerUp={() => {
              if (pressRef.current.at && Date.now() - pressRef.current.at > 600) {
                voice.stop();
              }
              pressRef.current.at = 0;
            }}
            onClick={() => {
              if (isPhone()) {
                if (!busy) startVoiceMode();
                return;
              }
              if (pressRef.current.handled) {
                pressRef.current.handled = false;
                return;
              }
              if (voice.listening) voice.stop();
              else if (!busy) voice.start();
            }}
          >
            <Mic />
          </button>
        ) : (
          <button type="button" className="mic" disabled title="Voice input works in Chrome or Edge" aria-label="Voice input is not supported in this browser">
            <Mic />
          </button>
        )}
        {busy ? (
          <button type="button" className="send stop" onClick={stopGenerating} aria-label="Stop">
            <Stop />
          </button>
        ) : (
          <button type="submit" className="send" disabled={!draft.trim()} aria-label="Send message">
            <Send />
          </button>
        )}
      </form>
      <div className="composer-foot">
        <Toggle
          small
          label="Hands-free conversation"
          checked={settings.handsFree}
          disabled={!voice.supported}
          onChange={(v) => {
            setSettings({ handsFree: v, speakReplies: v ? true : settings.speakReplies });
            if (v && !busy) voice.start();
            if (!v) voice.abort();
          }}
        />
        <span className="hint">{voice.supported ? 'Voice works in Chrome and Edge' : 'Voice input needs Chrome or Edge'}</span>
      </div>
      {voiceMode && (
        <VoiceOverlay
          listening={voice.listening}
          busy={busy}
          caption={draft}
          onMute={() => (voice.listening ? voice.stop() : voice.start())}
          onStop={endVoice}
          onType={() => {
            endVoice();
            setTimeout(() => taRef.current?.focus(), 50);
          }}
        />
      )}
    </section>
  );
}
