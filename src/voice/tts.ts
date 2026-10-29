import { useStore } from '../store';

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let speaking = false;
const listeners = new Set<(s: boolean) => void>();
export const onSpeaking = (fn: (s: boolean) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const setSpeaking = (s: boolean) => {
  speaking = s;
  listeners.forEach((l) => l(s));
};
export const isSpeaking = () => speaking;

export function listVoices(): SpeechSynthesisVoice[] {
  return ttsSupported() ? window.speechSynthesis.getVoices() : [];
}

function clean(text: string) {
  return text.replace(/[*_`#>]/g, '').replace(/\bINR\b/g, 'rupees').replace(/\s+/g, ' ').trim();
}

export function cancelSpeech() {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  setSpeaking(false);
}

/** Speaks text; resolves when finished (or immediately if unsupported). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text.trim()) return resolve();
    const { voiceLang, voiceName, voiceRate } = useStore.getState().settings;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean(text));
    u.lang = voiceLang;
    u.rate = voiceRate;
    const voices = listVoices();
    const chosen = voices.find((v) => v.name === voiceName) ?? voices.find((v) => v.lang === voiceLang) ?? voices.find((v) => v.lang.startsWith(voiceLang.slice(0, 2)));
    if (chosen) u.voice = chosen;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      setSpeaking(false);
      resolve();
    };
    // some browsers never fire onend when no voice is installed: never hang the voice loop
    const guard = setTimeout(finish, Math.max(4000, text.length * (95 / Math.max(0.5, voiceRate)) + 2500));
    u.onstart = () => setSpeaking(true);
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  });
}
