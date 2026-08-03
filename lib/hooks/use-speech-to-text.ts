'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Tipos mínimos de la Web Speech API — no forma parte de lib.dom.d.ts.
interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface WindowConSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

// Piloto de validación de captura por voz — ver informe estratégico ago-2026
// (memoria de sesión). Deliberadamente sin grabar/subir audio: transcribe
// en el propio navegador para no meter infra nueva (bucket, subida, proveedor
// externo) que contaminaría la medición de "¿la instructora lo usa de verdad?".
// Soporte real solo en Chromium (Chrome/Edge/Android) — Safari/iOS es
// parcial o inexistente, mismo tipo de gotcha ya documentado en este repo
// para BarcodeDetector (#565): hay que comprobar `disponible`, no asumirlo.

interface UseSpeechToTextResult {
  disponible: boolean;
  grabando: boolean;
  transcripcion: string;
  error: string | null;
  iniciar: () => void;
  detener: () => void;
  reiniciar: () => void;
}

export function useSpeechToText(idioma = 'es-ES'): UseSpeechToTextResult {
  const [grabando, setGrabando] = useState(false);
  const [transcripcion, setTranscripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const disponible =
    typeof window !== 'undefined' &&
    !!((window as WindowConSpeech).SpeechRecognition || (window as WindowConSpeech).webkitSpeechRecognition);

  const iniciar = useCallback(() => {
    if (typeof window === 'undefined') return;
    const win = window as WindowConSpeech;
    const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Ctor) {
      setError('not-supported');
      return;
    }
    setError(null);
    setTranscripcion('');

    const recognition = new Ctor();
    recognition.lang = idioma;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let texto = '';
      for (let i = 0; i < event.results.length; i++) texto += event.results[i][0].transcript;
      setTranscripcion(texto);
    };
    recognition.onerror = (event) => {
      setError(event.error ?? 'unknown');
      setGrabando(false);
    };
    recognition.onend = () => setGrabando(false);

    recognitionRef.current = recognition;
    recognition.start();
    setGrabando(true);
  }, [idioma]);

  const detener = useCallback(() => {
    recognitionRef.current?.stop();
    setGrabando(false);
  }, []);

  const reiniciar = useCallback(() => {
    setTranscripcion('');
    setError(null);
  }, []);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  return { disponible, grabando, transcripcion, error, iniciar, detener, reiniciar };
}
