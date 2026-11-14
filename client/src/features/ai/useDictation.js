import { useCallback, useEffect, useRef, useState } from 'react';

// Voice typing with the browser's own speech recognition (Chrome, Edge,
// Safari; not Firefox, where the button is hidden). Nothing is recorded or
// uploaded by FrameDesk: the words appear in the box as they are spoken.

const Recognition =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    : null;

const ERRORS = {
  'not-allowed': 'Allow microphone access in your browser to dictate.',
  'service-not-allowed': 'Allow microphone access in your browser to dictate.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice typing needs an internet connection.',
  'no-speech': 'Didn’t hear anything. Tap the microphone and try again.',
};

// Android Chrome repeats words in continuous mode, so phones take one phrase
// at a time (tap again to keep going).
const continuous =
  typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches;

export function useDictation({ value, onChange }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const recognition = useRef(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  }, [value, onChange]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!Recognition || recognition.current) return;
    setError(null);
    const rec = new Recognition();
    rec.lang = navigator.language || 'en-IN';
    rec.interimResults = true;
    rec.continuous = continuous;
    // What was typed before speaking; spoken words are added after it.
    const base = latest.current.value.replace(/\s+$/, '');
    rec.onresult = (event) => {
      const spoken = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      latest.current.onChange(base && spoken ? `${base} ${spoken}` : base || spoken);
    };
    rec.onerror = (event) => {
      if (event.error !== 'aborted') setError(ERRORS[event.error] ?? 'Voice typing stopped.');
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setError('Voice typing could not start.');
    }
  }, []);

  // Stop listening when the chat closes.
  useEffect(() => () => recognition.current?.abort(), []);

  return { supported: Boolean(Recognition), listening, error, start, stop };
}
