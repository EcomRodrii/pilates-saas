// ─────────────────────────────────────────────────────────────────────────────
// Sonido "cha-ching" para el aviso de nueva venta (campana del panel). Sintético
// vía Web Audio API en vez de un asset .mp3/.wav — dos tonos ascendentes cortos,
// sin problema de licencia ni fichero que servir.
//
// Falla en silencio a propósito: los navegadores bloquean audio sin gesto
// previo del usuario (autoplay policy), y eso NO debe romper el toast visual
// ni ensuciar la consola — el aviso ya se ve, el sonido es un extra.
// ─────────────────────────────────────────────────────────────────────────────
'use client';

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function tono(ac: AudioContext, freq: number, inicio: number, duracion: number, volumen: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ac.currentTime + inicio;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volumen, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
}

/** Reproduce el "cha-ching": dos notas cortas ascendentes. Nunca lanza. */
export function reproducirChaChing(): void {
  try {
    const ac = contexto();
    if (!ac) return;
    if (ac.state === 'suspended') { void ac.resume().catch(() => {}); }
    tono(ac, 1046.5, 0, 0.16, 0.18);   // C6
    tono(ac, 1568.0, 0.09, 0.22, 0.16); // G6
  } catch {
    // Autoplay bloqueado u otra restricción del navegador — silencioso.
  }
}
