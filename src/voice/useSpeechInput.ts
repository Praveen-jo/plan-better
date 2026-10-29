import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelSpeech } from './tts';

type SR = any;

export function speechInputSupported() {
  return typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

interface Opts {
  lang: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}

/** Thin wrapper over the browser SpeechRecognition API (Chrome and Edge). */
export function useSpeechInput({ lang, onInterim, onFinal }: Opts) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<SR | null>(null);
  const finalRef = useRef('');
  const cbs = useRef({ onInterim, onFinal });
  cbs.current = { onInterim, onFinal };

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(() => {
    if (!speechInputSupported() || recRef.current) return;
    cancelSpeech(); // barge-in: stop the assistant talking
    setError('');
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SR = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    finalRef.current = '';
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      let interim = '';
      let fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (fin) finalRef.current += fin;
      cbs.current.onInterim((finalRef.current + interim).trim());
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') setError('Microphone access is blocked. Allow it in the browser address bar and try again.');
      else if (code === 'no-speech') setError('I did not hear anything. Tap the mic and try again.');
      else if (code === 'network') setError('Speech recognition needs an internet connection in this browser.');
      else if (code !== 'aborted') setError(`Voice input error: ${code}`);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const text = finalRef.current.trim();
      finalRef.current = '';
      if (text) cbs.current.onFinal(text);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [lang]);

  const abort = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    finalRef.current = '';
  }, []);

  useEffect(() => () => abort(), [abort]);

  return { supported: speechInputSupported(), listening, error, start, stop, abort, clearError: () => setError('') };
}
