// Los sonidos de Tenti, sintetizados con Web Audio: sin ficheros, pesan cero.
// Portados del prototipo de Coucou (MIT, Copyright (c) 2026 Louis Raillé; ver
// el aviso completo en ./motor.ts).
//
// ⚠️ Apagados salvo que la persona los encienda: un panel que suena solo en
// una recepción es justo lo que hace que alguien cierre la pestaña. Y el
// navegador no deja crear el AudioContext hasta el primer gesto, así que se
// crea perezoso, en el primer `sonar`.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null;
let ruido: AudioBuffer | null = null;
let volumen = 0.7;

function iniciar(): boolean {
  if (ctx) return true;
  if (typeof window === 'undefined') return false;
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return false;
  const c = (ctx = new C());
  master = c.createGain(); master.gain.value = volumen;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -18;
  master.connect(comp); comp.connect(c.destination);
  // Reverb corta hecha a mano: un impulso de ruido que decae.
  const len = Math.floor(c.sampleRate * 1.3), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
  const rev = c.createConvolver(); rev.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.2; rev.connect(wet); wet.connect(master);
  bus = c.createGain(); bus.connect(master); bus.connect(rev);
  ruido = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const nd = ruido.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return true;
}

export function ponerVolumen(v: number) { volumen = v; if (master) master.gain.value = v; }

interface Tono { f?: number; to?: number; d?: number; type?: OscillatorType; g?: number; a?: number; delay?: number; vib?: number; vibf?: number; h?: number }
function tono({ f = 440, to = 0, d = 0.2, type = 'sine', g = 0.1, a = 0.006, delay = 0, vib = 0, vibf = 6, h = 0 }: Tono) {
  if (!ctx || !bus) return;
  const c = ctx, t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d * 0.9);
  const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vibf; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + d + 0.05); }
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + d + 0.05);
  if (h) {
    const o2 = c.createOscillator(); o2.frequency.setValueAtTime(f * h, t); const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(g * 0.3, t + a); g2.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.35);
    o2.connect(g2); g2.connect(bus); o2.start(t); o2.stop(t + d);
  }
}
interface Ruido { d?: number; g?: number; f?: number; to?: number; q?: number; type?: BiquadFilterType; delay?: number }
function soplo({ d = 0.2, g = 0.04, f = 1500, to = 0, q = 0.9, type = 'bandpass', delay = 0 }: Ruido) {
  if (!ctx || !bus || !ruido) return;
  const c = ctx, t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = ruido; const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + d);
  const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + d * 0.35); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl); fl.connect(gn); gn.connect(bus); s.start(t); s.stop(t + d + 0.05);
}

const BIBLIOTECA = {
  peek() { tono({ f: 1320, d: 0.09, g: 0.04 }); tono({ f: 1760, d: 0.12, g: 0.035, delay: 0.07 }); },
  open() { tono({ f: 300, to: 560, d: 0.24, g: 0.06 }); soplo({ d: 0.28, g: 0.018, f: 900, to: 3200 }); },
  close() { tono({ f: 540, to: 300, d: 0.2, g: 0.05 }); soplo({ d: 0.2, g: 0.014, f: 2600, to: 800 }); },
  hover() { tono({ f: 2100, d: 0.05, g: 0.014 }); },
  blip() { tono({ f: 1480, d: 0.07, g: 0.035 }); },
  slap() { tono({ f: 280, to: 110, d: 0.18, type: 'triangle', g: 0.16 }); soplo({ d: 0.06, g: 0.06, f: 900, q: 0.6 }); },
  annoyed() { tono({ f: 240, to: 185, d: 0.2, type: 'triangle', g: 0.07, delay: 0.06 }); },
  dizzy() { tono({ f: 640, to: 380, d: 1, g: 0.06, vib: 45, vibf: 9 }); tono({ f: 960, to: 560, d: 1, g: 0.025, vib: 70, vibf: 7, delay: 0.06 }); },
  greet() { [523.25, 659.25, 783.99].forEach((f, i) => tono({ f, d: 0.32, g: 0.06, delay: i * 0.085, h: 4 })); },
  work() { tono({ f: 880, d: 0.14, g: 0.028 }); tono({ f: 1174.7, d: 0.18, g: 0.022, delay: 0.07 }); },
  finish() { tono({ f: 783.99, d: 0.6, g: 0.08, h: 4 }); tono({ f: 1046.5, d: 0.9, g: 0.08, h: 4, delay: 0.11 }); tono({ f: 1318.5, d: 1.1, g: 0.045, h: 3, delay: 0.22 }); },
  error() { tono({ f: 392, d: 0.35, type: 'triangle', g: 0.09 }); tono({ f: 311.1, d: 0.55, type: 'triangle', g: 0.09, delay: 0.16 }); },
  approval() { tono({ f: 987.8, d: 0.35, g: 0.07, h: 2.76 }); tono({ f: 987.8, d: 0.5, g: 0.07, h: 2.76, delay: 0.18 }); },
  question() { tono({ f: 659.3, d: 0.24, g: 0.06, h: 3 }); tono({ f: 880, d: 0.4, g: 0.06, h: 3, delay: 0.12 }); },
  approve() { tono({ f: 660, d: 0.18, g: 0.05 }); tono({ f: 990, d: 0.3, g: 0.05, delay: 0.08, h: 3 }); },
  love() { tono({ f: 1046.5, d: 0.32, g: 0.045, vib: 14, vibf: 8 }); tono({ f: 1318.5, d: 0.5, g: 0.045, vib: 14, vibf: 8, delay: 0.14 }); },
  pop() { tono({ f: 480, to: 1150, d: 0.11, g: 0.07 }); },
  proud() { [784, 988, 1175, 1568].forEach((f, i) => tono({ f, d: 0.4, g: 0.045, delay: i * 0.06, h: 4 })); },
  wink() { tono({ f: 1400, to: 1900, d: 0.09, g: 0.035 }); },
  yawn() { tono({ f: 430, to: 250, d: 0.8, g: 0.045, vib: 9, vibf: 4 }); },
  think() { tono({ f: 520, d: 0.2, g: 0.03 }); tono({ f: 620, d: 0.25, g: 0.03, delay: 0.12 }); },
  search() { tono({ f: 740, d: 0.12, g: 0.025 }); tono({ f: 990, d: 0.12, g: 0.025, delay: 0.1 }); tono({ f: 1245, d: 0.2, g: 0.025, delay: 0.2 }); },
  rate() { tono({ f: 500, to: 420, d: 0.3, g: 0.04 }); tono({ f: 420, to: 350, d: 0.4, g: 0.04, delay: 0.18 }); },
  sleep() { tono({ f: 330, to: 290, d: 0.5, g: 0.03 }); },
};
export type Sonido = keyof typeof BIBLIOTECA;

/** Hace sonar un efecto. Si el navegador no tiene audio, no pasa nada. */
export function sonar(n: Sonido) {
  if (!iniciar() || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  try { BIBLIOTECA[n](); } catch { /* un sonido que falla no rompe nada */ }
}
