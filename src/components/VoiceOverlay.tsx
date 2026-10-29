import { createPortal } from 'react-dom';
import { Avatar, Waveform, Wordmark } from './Brand';
import { Keyboard, Mic, Stop, Volume } from './Icons';

export function VoiceOverlay({ listening, busy, caption, onMute, onStop, onType }: { listening: boolean; busy: boolean; caption: string; onMute: () => void; onStop: () => void; onType: () => void }) {
  const status = busy ? 'Thinking…' : listening ? 'Listening…' : 'Muted';
  return createPortal(
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Voice conversation">
      <div className="voice-top">
        <Wordmark size={22} />
        <Volume width={20} height={20} />
      </div>
      <div className="voice-ring">
        <Avatar size={220} glow />
      </div>
      <h2>{status}</h2>
      <Waveform active={listening || busy} bars={56} />
      <p className="voice-caption" aria-live="polite">
        {caption ? (
          <q>{caption}</q>
        ) : (
          <>
            You can speak naturally, for example:
            <br />
            "Make day 2 more relaxed" or
            <br />
            "Add a spa experience"
          </>
        )}
      </p>
      <div className="voice-actions">
        <button className="vbtn" onClick={onMute} aria-pressed={!listening}>
          <span className="round"><Mic /></span>
          Mute
        </button>
        <button className="vbtn" onClick={onStop}>
          <span className="round pink big"><Stop width={26} height={26} /></span>
          Stop
        </button>
        <button className="vbtn" onClick={onType}>
          <span className="round"><Keyboard /></span>
          Type instead
        </button>
      </div>
    </div>,
    document.body,
  );
}
