// ─────────────────────────────────────────────────────────────────────────────
// Sonido "cha-ching" para el aviso de nueva venta (campana del panel).
//
// Asset real (public/sounds/venta-registrada.mp3) con un tono sintético vía
// Web Audio API como red de seguridad si el fichero no carga (404, CDN caído,
// bloqueo de red) — nunca se queda sin sonido por un fallo ajeno al audio en
// sí. Silencioso siempre: los navegadores bloquean audio sin gesto previo del
// usuario (autoplay policy), y eso NO debe romper el toast visual ni ensuciar
// la consola — el aviso ya se ve, el sonido es un extra.
//
// Silenciable por la propietaria: preferencia en localStorage (por navegador/
// dispositivo, no sincronizada entre ellos a propósito — es un ajuste de "no
// me interrumpas EN ESTA pantalla", no una regla de negocio del estudio).
// ─────────────────────────────────────────────────────────────────────────────
'use client';

const CLAVE_SILENCIADO = 'tentare:sonido-venta-silenciado';

export function sonidoVentaSilenciado(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CLAVE_SILENCIADO) === '1';
  } catch {
    return false;
  }
}

export function alternarSonidoVenta(): boolean {
  const nuevo = !sonidoVentaSilenciado();
  try {
    window.localStorage.setItem(CLAVE_SILENCIADO, nuevo ? '1' : '0');
  } catch {
    // Sin storage disponible (modo privado agresivo, cuota): el toggle sigue
    // funcionando en memoria para esta sesión, solo no persiste.
  }
  return nuevo;
}

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

/** Sintetizado: dos notas cortas ascendentes. Solo como red de seguridad. */
function reproducirTonoSintetico(): void {
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

let audioEl: HTMLAudioElement | null = null;

/** Reproduce el "cha-ching" (asset real, con fallback sintético). Nunca lanza. */
export function reproducirChaChing(): void {
  if (sonidoVentaSilenciado()) return;
  try {
    if (!audioEl) {
      audioEl = new Audio('/sounds/venta-registrada.mp3');
      audioEl.volume = 0.6;
    } else {
      audioEl.currentTime = 0;
    }
    audioEl.play().catch(() => reproducirTonoSintetico());
  } catch {
    reproducirTonoSintetico();
  }
}
