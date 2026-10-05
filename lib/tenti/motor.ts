// ─────────────────────────────────────────────────────────────────────────────
// Tenti — el motor del personaje (Canvas 2D).
//
// Portado del prototipo web de Coucou (design/prototype/notch-buddy.html),
// cuyo personaje Tentare usa con autorización escrita de su autor (5-oct-2026).
// El código de Coucou es MIT:
//
//   Copyright (c) 2026 Louis Raillé
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or
//   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
//   WITHOUT WARRANTY OF ANY KIND.
//
// Qué cambia respecto al prototipo: un solo cuerpo (el «mochi»), sin el estado
// global de la demo (`app`), y los estados con nombre de lo que pasa en un
// estudio. El dibujo y las curvas de animación son las mismas.
// ─────────────────────────────────────────────────────────────────────────────

import { sonar, type Sonido } from './sonidos.ts';

type RGB = [number, number, number];

const AHORA = () => performance.now();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type Curva = (t: number) => number;
const E: Record<'out' | 'inOut' | 'back' | 'lin', Curva> = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  lin: (t) => t,
};
const hexRgb = (h: string): RGB => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// El cuerpo y los ojos de Tenti (la «pista mochi» del prototipo).
const CUERPO = { base: ['#FFFAF5', '#DDCCBF'] as const, tinta: '#1A1412', ojo: { w: 0.25, h: 0.27, sp: 0.37, p: -0.12 } };

type FormaOjo = 'pill' | 'wide' | 'dot' | 'line' | 'flat' | 'happy' | 'closed' | 'spiral' | 'heart' | 'star' | 'tired' | 'wink';
type Insignia = ['dots' | 'dot' | 'bang' | 'q', string] | null;

interface ConfigEstado {
  etiqueta: string; col: string; tint: number; ojo: FormaOjo; insignia: Insignia; sonido?: Sonido;
  mira?: [number, number]; escanea?: boolean; bota?: boolean; ladea?: number; suda?: boolean; respira?: boolean; zz?: boolean;
}

/** Lo que Tenti está haciendo. Cada uno con su color, sus ojos y su sonido. */
export const ESTADOS = {
  reposo: { etiqueta: 'En reposo', col: '#E6E9EE', tint: 0, ojo: 'pill', insignia: null },
  trabajando: { etiqueta: 'Trabajando', col: '#3B9EFF', tint: 0.72, ojo: 'pill', insignia: ['dots', '#3B9EFF'], sonido: 'work' },
  hecho: { etiqueta: 'Hecho', col: '#34D399', tint: 0.35, ojo: 'happy', insignia: ['dot', '#34D399'], sonido: 'finish' },
  error: { etiqueta: 'Algo ha fallado', col: '#F4505E', tint: 0.78, ojo: 'flat', insignia: ['dot', '#F4505E'], sonido: 'error' },
  mareado: { etiqueta: 'Mareado', col: '#F472B6', tint: 0.7, ojo: 'spiral', insignia: null, sonido: 'dizzy' },
  pensando: { etiqueta: 'Pensando', col: '#8B5CF6', tint: 0.72, ojo: 'pill', insignia: ['dots', '#8B5CF6'], mira: [0.55, 0.55], sonido: 'think' },
  buscando: { etiqueta: 'Buscando', col: '#6366F1', tint: 0.72, ojo: 'pill', insignia: ['dots', '#6366F1'], escanea: true, sonido: 'search' },
  esperaTuOk: { etiqueta: 'Espera tu visto bueno', col: '#F5A524', tint: 0.78, ojo: 'wide', insignia: ['bang', '#F5A524'], bota: true, sonido: 'approval' },
  pregunta: { etiqueta: 'Tiene una pregunta', col: '#22D3EE', tint: 0.75, ojo: 'pill', insignia: ['q', '#22D3EE'], ladea: 0.17, sonido: 'question' },
  agobiado: { etiqueta: 'Agobiado', col: '#FB923C', tint: 0.72, ojo: 'tired', insignia: ['dot', '#FB923C'], suda: true, sonido: 'rate' },
  dormido: { etiqueta: 'Dormido', col: '#94A3B8', tint: 0.32, ojo: 'closed', insignia: null, respira: true, zz: true, sonido: 'sleep' },
} satisfies Record<string, ConfigEstado>;
export type EstadoTenti = keyof typeof ESTADOS;

/** Reacciones de un momento: vuelven solas al estado de antes. */
export const EMOCIONES = {
  amor: { etiqueta: 'Amor', ojo: 'heart', sonido: 'love' },
  sorpresa: { etiqueta: 'Sorpresa', ojo: 'dot', sonido: 'pop' },
  orgullo: { etiqueta: 'Orgullo', ojo: 'star', sonido: 'proud' },
  guino: { etiqueta: 'Guiño', ojo: 'wink', sonido: 'wink' },
  bostezo: { etiqueta: 'Bostezo', ojo: 'tired', sonido: 'yawn' },
  feliz: { etiqueta: 'Feliz', ojo: 'happy' },
  molesto: { etiqueta: 'Molesto', ojo: 'line' },
} satisfies Record<string, { etiqueta: string; ojo: FormaOjo; sonido?: Sonido }>;
export type EmocionTenti = keyof typeof EMOCIONES;

function rr(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, R: number) {
  R = Math.max(0, Math.min(R, W / 2, H / 2));
  x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
}
function corazon(x: CanvasRenderingContext2D, s: number) {
  x.beginPath(); x.moveTo(0, s * 0.38);
  x.bezierCurveTo(-s * 1.05, -s * 0.15, -s * 0.5, -s * 0.95, 0, -s * 0.38);
  x.bezierCurveTo(s * 0.5, -s * 0.95, s * 1.05, -s * 0.15, 0, s * 0.38); x.closePath();
}
function estrella(x: CanvasRenderingContext2D, ro: number, ri: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  x.closePath();
}

type Prop = 'yaw' | 'pitch' | 'roll' | 'tilt' | 'open' | 'sx' | 'sy' | 'oy' | 'ox' | 'tint' | 'morph' | 'hands' | 'blush' | 'es' | 'badgeS';
type Clave = [valor: number, ms: number, curva: Curva];
interface Tween { p: Prop; keys: Clave[]; i: number; from: number; t0: number; after?: () => void }
interface Particula { type: 'heart' | 'star' | 'spark' | 'sweat' | 'z'; x: number; y: number; vx: number; vy: number; age: number; life: number; rot: number; sz: number }

export interface OpcionesTenti { mini?: boolean; colorCuerpo?: string | null; sonido?: boolean }

export class Tenti {
  private c: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private mini: boolean;
  private colorCuerpo: RGB | null;
  sonido: boolean;
  private s: Record<Prop, number> = { yaw: 0, pitch: 0, roll: 0, tilt: 0, open: 1, sx: 1, sy: 1, oy: 0, ox: 0, tint: 0, morph: 0, hands: 0, blush: 0, es: 1, badgeS: 0 };
  private tg: Record<Prop, number> = { ...this.s };
  private tw: Tween[] = [];
  private lock: Partial<Record<Prop, 1>> = {};
  private col: RGB = [230, 233, 238];
  private colT: RGB = [230, 233, 238];
  estado: EstadoTenti = 'reposo';
  private cfg: ConfigEstado = ESTADOS.reposo;
  private ojoForzado: FormaOjo | null = null;
  private ojoHasta = 0;
  private insignia: 'dots' | 'dot' | 'bang' | 'q' | null = null;
  private colInsignia = '#fff';
  private claveInsignia = 'none';
  private turnoInsignia = 0;
  private parts: Particula[] = [];
  private proxParpadeo: number;
  /** Hacia dónde mira, de -1 a 1 en cada eje. */
  mira = { x: 0, y: 0 };
  private t0: number;
  private saludaHasta = 0;
  private ultimoAmbiente = 0;
  private ultimo = AHORA();
  private temporizadores = new Set<ReturnType<typeof setTimeout>>();

  constructor(canvas: HTMLCanvasElement, { mini = false, colorCuerpo = null, sonido = false }: OpcionesTenti = {}) {
    this.c = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tenti necesita un canvas 2D');
    this.x = ctx; this.mini = mini; this.colorCuerpo = colorCuerpo ? hexRgb(colorCuerpo) : null; this.sonido = sonido;
    this.proxParpadeo = AHORA() + 1500 + Math.random() * 2000;
    this.t0 = AHORA() - Math.random() * 5000;
  }

  /** Ajusta la resolución del canvas a su tamaño en pantalla. */
  medir(cssPx: number) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.c.width = Math.round(cssPx * dpr); this.c.height = Math.round(cssPx * dpr);
  }

  private luego(fn: () => void, ms: number) {
    const t = setTimeout(() => { this.temporizadores.delete(t); fn(); }, ms);
    this.temporizadores.add(t);
  }
  destruir() { for (const t of this.temporizadores) clearTimeout(t); this.temporizadores.clear(); }
  private suena(n?: Sonido) { if (this.sonido && n) sonar(n); }

  private anim(p: Prop, keys: Clave[], after?: () => void) {
    this.tw = this.tw.filter((t) => t.p !== p);
    this.tw.push({ p, keys, i: 0, from: this.s[p], t0: AHORA(), after }); this.lock[p] = 1;
  }

  ponerEstado(n: EstadoTenti, { forzar = false, silencio = false } = {}) {
    const c: ConfigEstado | undefined = ESTADOS[n];
    if (!c || (this.estado === n && !forzar)) return;
    const prev = this.estado; this.estado = n; this.cfg = c;
    this.colT = hexRgb(c.col); this.tg.tint = c.tint; this.tg.tilt = c.ladea || 0; this.ponerInsignia(c.insignia);
    if (n === 'hecho') { this.rodar(950, 1); this.luego(() => this.emitir('spark', 5), 500); }
    else if (n === 'error') this.anim('ox', [[0.08, 50, E.out], [-0.08, 70, E.inOut], [0.05, 70, E.inOut], [0, 90, E.out]]);
    else if (n === 'esperaTuOk') this.anim('oy', [[-0.2, 150, E.out], [0, 300, E.back]]);
    else if (n === 'mareado') this.rodar(1300, 2);
    else if (n === 'pregunta') this.parpadear();
    else if (n === 'agobiado') this.emitir('sweat', 1);
    else if (prev !== 'reposo' || n !== 'reposo') this.parpadear();
    if (!silencio) this.suena(c.sonido);
  }

  private ponerInsignia(b: Insignia) {
    const clave = b ? b.join() : 'none'; if (clave === this.claveInsignia) return;
    this.claveInsignia = clave; const turno = ++this.turnoInsignia;
    this.anim('badgeS', [[0, 90, E.inOut]]);
    this.luego(() => {
      if (turno !== this.turnoInsignia) return;
      this.insignia = b ? b[0] : null; this.colInsignia = b ? b[1] : '#fff';
      if (b) this.anim('badgeS', [[1, 280, E.back]]);
    }, 100);
  }

  parpadear() { if (this.lock.open) return; this.anim('open', [[0.06, 70, E.inOut], [1, 130, E.out]]); }
  /** Se aplasta, como al tocarlo. */
  aplastar() {
    this.anim('sy', [[0.78, 70, E.out], [1.1, 130, E.out], [1, 170, E.inOut]]);
    this.anim('sx', [[1.16, 70, E.out], [0.95, 130, E.out], [1, 170, E.inOut]]);
  }
  private rodar(d = 900, vueltas = 1) {
    this.s.roll = 0;
    this.anim('roll', [[Math.PI * 2 * vueltas, d, E.inOut]], () => { this.s.roll = 0; this.tg.roll = 0; });
  }
  /** Saluda con la mano. */
  saludar() {
    this.anim('hands', [[1, 280, E.back]]); this.saludaHasta = AHORA() + 1500; this.emocion('feliz', 1500, true);
    this.suena('greet');
    this.luego(() => this.anim('hands', [[0, 240, E.inOut]]), 1550);
  }

  emocion(n: EmocionTenti, d = 1800, silencio = false) {
    const em: { ojo: FormaOjo; sonido?: Sonido } | undefined = EMOCIONES[n]; if (!em) return;
    this.ojoForzado = em.ojo; this.ojoHasta = AHORA() + d;
    if (n === 'amor') { this.anim('blush', [[1, 300, E.out], [1, d - 600, E.lin], [0, 300, E.inOut]]); this.emitir('heart', 4); this.anim('oy', [[-0.1, 160, E.out], [0, 300, E.back]]); }
    if (n === 'sorpresa') { this.anim('oy', [[-0.3, 140, E.out], [0, 380, E.back]]); this.anim('es', [[1.25, 120, E.out], [1, 500, E.inOut]]); }
    if (n === 'orgullo') { this.emitir('star', 5); this.anim('tilt', [[-0.14, 220, E.out], [-0.14, d - 500, E.lin], [0, 280, E.inOut]]); }
    if (n === 'guino') this.anim('tilt', [[0.12, 160, E.out], [0.12, d - 400, E.lin], [0, 240, E.inOut]]);
    if (n === 'bostezo') {
      this.anim('sy', [[1.12, 500, E.inOut], [1, 500, E.inOut]]); this.anim('sx', [[0.94, 500, E.inOut], [1, 500, E.inOut]]);
      this.luego(() => { this.ojoForzado = 'closed'; this.emitir('z', 2); }, 700);
    }
    if (n === 'feliz') this.anim('blush', [[0.6, 200, E.out], [0, 600, E.inOut]]);
    if (!silencio) this.suena(em.sonido);
  }

  private emitir(type: Particula['type'], n: number) {
    for (let i = 0; i < n; i++) this.parts.push({
      type, x: (Math.random() - 0.5) * 0.9 + (type === 'z' ? 0.55 : 0), y: -0.7 - Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 0.35 + (type === 'z' ? 0.18 : 0), vy: -(0.45 + Math.random() * 0.35),
      age: -i * 0.14, life: 1.3 + Math.random() * 0.5, rot: Math.random() * 6, sz: 0.15 + Math.random() * 0.08,
    });
  }

  /** Avanza un fotograma: calcula y dibuja. */
  fotograma() { this.actualizar(); this.dibujar(); }

  private actualizar() {
    const n = AHORA(), dt = Math.min(0.05, (n - this.ultimo) / 1000); this.ultimo = n;
    const s = this.s, tg = this.tg, c = this.cfg, t = (n - this.t0) / 1000;
    for (const tw of [...this.tw]) {
      const k = tw.keys[tw.i]; const p = clamp((n - tw.t0) / k[1], 0, 1); s[tw.p] = tw.from + (k[0] - tw.from) * k[2](p);
      if (p >= 1) {
        tw.from = k[0]; tw.i++; tw.t0 = n;
        if (tw.i >= tw.keys.length) {
          this.tw.splice(this.tw.indexOf(tw), 1); delete this.lock[tw.p];
          this.tg[tw.p] = tw.keys[tw.keys.length - 1][0]; tw.after?.();
        }
      }
    }
    let ty = this.mira.x * 0.62, tp = this.mira.y * 0.5;
    if (c.mira) { ty = ty * 0.35 + c.mira[0] * 0.55; tp = tp * 0.3 + c.mira[1] * 0.5; }
    if (c.escanea) { ty = Math.sin(t * 2.6) * 0.6; tp = -0.06; }
    if (this.estado === 'dormido') { ty = 0; tp = -0.14; }
    if (this.estado === 'mareado') ty = Math.sin(t * 9) * 0.25;
    tg.yaw = ty; tg.pitch = tp; tg.tilt = c.ladea || 0; tg.oy = c.bota ? -Math.abs(Math.sin(t * 5.2)) * 0.07 : 0;
    tg.sy = c.respira ? 1 + Math.sin(t * 1.8) * 0.035 : 1; tg.sx = c.respira ? 1 - Math.sin(t * 1.8) * 0.02 : 1;
    const kMira = 1 - Math.pow(0.0025, dt), kGen = 1 - Math.pow(0.0008, dt);
    for (const k of Object.keys(tg) as Prop[]) { if (this.lock[k]) continue; s[k] += (tg[k] - s[k]) * (k === 'yaw' || k === 'pitch' ? kMira : kGen); }
    this.col = mix(this.col, this.colT, 1 - Math.pow(0.002, dt));
    if (n > this.proxParpadeo) {
      if (this.estado !== 'dormido' && this.estado !== 'mareado') { this.parpadear(); if (Math.random() < 0.22) this.luego(() => this.parpadear(), 230); }
      this.proxParpadeo = n + 2200 + Math.random() * 3200;
    }
    if (this.ojoForzado && n > this.ojoHasta) this.ojoForzado = null;
    if (!this.mini && n - this.ultimoAmbiente > 1300) {
      this.ultimoAmbiente = n;
      if (c.zz) this.emitir('z', 1);
      if (c.suda && Math.random() < 0.5) this.emitir('sweat', 1);
    }
    for (const p of this.parts) p.age += dt;
    this.parts = this.parts.filter((p) => p.age < p.life);
  }

  private dibujar() {
    const x = this.x, W = this.c.width, H = this.c.height, s = this.s, P = CUERPO;
    x.clearRect(0, 0, W, H);
    const R = W * 0.3; const rx = R * 1.14, ry = R * 0.88;
    const cx = W / 2 + s.ox * R, cy = H / 2 + s.oy * R + R * 0.06;
    const col = this.col;
    x.save(); x.translate(cx, cy); x.rotate(s.tilt); x.scale(s.sx, s.sy);
    const path = new Path2D(), m = s.morph;
    if (m < 0.01) {
      for (let i = 0; i <= 72; i++) {
        const a = i / 72 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const px = rx * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / 2.7), py = ry * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / 2.7);
        if (i) path.lineTo(px, py); else path.moveTo(px, py);
      }
      path.closePath();
    } else {
      const w = lerp(rx, R * 1.02, m), h = lerp(ry, R * 0.94, m), r = lerp(Math.min(rx, ry), R * 0.34, m);
      path.roundRect(-w, -h, 2 * w, 2 * h, r);
    }
    // cuerpo
    const bc = this.colorCuerpo;
    {
      let c0: RGB, c1: RGB;
      if (bc) { c0 = mix(bc, [255, 255, 255], 0.35); c1 = mix(bc, [0, 0, 0], 0.18); } else { c0 = hexRgb(P.base[0]); c1 = hexRgb(P.base[1]); }
      const g = x.createLinearGradient(rx * 0.7, -ry * 0.85, -rx * 0.8, ry * 0.9); g.addColorStop(0, rgba(c0, 1)); g.addColorStop(1, rgba(c1, 1)); x.fillStyle = g; x.fill(path);
      if (!bc && s.tint > 0.01) {
        const tg2 = x.createLinearGradient(0, ry, 0, -ry * 0.25); tg2.addColorStop(0, rgba(col, 0.92 * s.tint)); tg2.addColorStop(1, rgba(col, 0));
        x.fillStyle = tg2; x.fill(path);
      }
      const sh = x.createRadialGradient(rx * 0.25, -ry * 0.32, R * 0.15, 0, 0, R * 1.25);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = sh; x.fill(path);
      const hl = x.createRadialGradient(rx * 0.34, -ry * 0.46, 0, rx * 0.34, -ry * 0.46, R * 0.42);
      hl.addColorStop(0, 'rgba(255,255,255,.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = hl; x.fill(path);
    }
    // mofletes
    const bl = Math.max(s.blush, 0.35) * (1 - m);
    if (bl > 0.01) {
      x.save(); x.clip(path); const yo = Math.sin(s.yaw) * rx * 0.8; x.fillStyle = `rgba(255,120,150,${0.5 * bl})`;
      for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * rx * 0.55 + yo, ry * 0.2, R * 0.17, R * 0.1, 0, 0, Math.PI * 2); x.fill(); }
      x.restore();
    }
    // ojos: sobre una esfera, para que giren con la cabeza
    x.save(); x.clip(path); x.fillStyle = P.tinta; x.strokeStyle = P.tinta;
    const forma = this.ojoForzado || this.cfg.ojo;
    for (const sd of [-1, 1]) {
      const yaw = sd * P.ojo.sp + s.yaw; let pitch = P.ojo.p + s.pitch + s.roll;
      pitch = ((pitch + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const cp = Math.cos(pitch); if (Math.cos(yaw) * cp < 0.04) continue;
      const px = Math.sin(yaw) * cp * rx; let py = -Math.sin(pitch) * ry; if (m > 0) py += ry * 0.14 * m;
      const fx = lerp(Math.max(0.18, Math.cos(yaw)), 1, m * 0.7), fy = lerp(Math.max(0.18, cp), 1, m * 0.7);
      x.save(); x.translate(px, py); x.scale(fx, fy); this.ojo(forma, R * P.ojo.w * s.es, R * P.ojo.h * s.es, s.open, sd); x.restore();
    }
    x.restore();
    x.restore();
    // manos
    if (s.hands > 0.01) {
      const hr = R * 0.2 * s.hands, c0 = bc ? mix(bc, [255, 255, 255], 0.35) : hexRgb(P.base[0]), c1 = bc ? bc : hexRgb(P.base[1]); const tt = AHORA() / 1000;
      for (const sd of [-1, 1]) {
        let hx = cx + sd * rx * 1.25 * s.sx, hy = cy + ry * 0.42;
        if (sd === 1 && AHORA() < this.saludaHasta) { hy -= R * 0.38 + Math.sin(tt * 13) * R * 0.16; hx += Math.cos(tt * 13) * R * 0.06; }
        const g = x.createLinearGradient(hx + hr, hy - hr, hx - hr, hy + hr); g.addColorStop(0, rgba(c0, 1)); g.addColorStop(1, rgba(c1, 1));
        x.fillStyle = g; x.beginPath(); x.arc(hx, hy, hr, 0, Math.PI * 2); x.fill();
      }
    }
    // insignia
    if (this.insignia && s.badgeS > 0.01) {
      const bs = s.badgeS * (this.mini ? 1.25 : 1); const bx = cx - rx * 0.76 * s.sx, by = cy - ry * 0.72 * s.sy;
      x.save(); x.translate(bx, by); x.scale(bs, bs); const bcol = this.colInsignia;
      if (this.insignia === 'dots' && !this.mini) {
        const w = R * 0.74, h = R * 0.42; x.fillStyle = '#000'; rr(x, -w / 2 - R * 0.07, -h / 2 - R * 0.07, w + R * 0.14, h + R * 0.14, (h + R * 0.14) / 2); x.fill();
        x.fillStyle = bcol; rr(x, -w / 2, -h / 2, w, h, h / 2); x.fill();
        const tt = AHORA() / 1000;
        for (let i = 0; i < 3; i++) {
          const ph = ((tt * 2.4 - i * 0.22) % 1 + 1) % 1; const r = R * 0.06 * (1 + 0.4 * Math.max(0, Math.sin(ph * Math.PI * 2)));
          x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.arc((i - 1) * R * 0.19, 0, r, 0, Math.PI * 2); x.fill();
        }
      } else if (this.insignia === 'bang' || this.insignia === 'q') {
        x.fillStyle = '#000'; x.beginPath(); x.arc(0, 0, R * 0.3, 0, Math.PI * 2); x.fill();
        x.fillStyle = bcol; x.beginPath(); x.arc(0, 0, R * 0.23, 0, Math.PI * 2); x.fill();
        if (!this.mini) {
          x.fillStyle = '#fff'; x.font = `800 ${R * 0.32}px -apple-system,system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText(this.insignia === 'bang' ? '!' : '?', 0, R * 0.02);
        }
      } else {
        x.fillStyle = '#000'; x.beginPath(); x.arc(0, 0, R * 0.2, 0, Math.PI * 2); x.fill();
        x.fillStyle = bcol; x.beginPath(); x.arc(0, 0, R * 0.135, 0, Math.PI * 2); x.fill();
      }
      x.restore();
    }
    // partículas
    for (const p of this.parts) {
      if (p.age < 0) continue;
      const k = p.age / p.life, a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      const px = cx + (p.x + p.vx * p.age) * R * 1.3, py = cy + (p.y + p.vy * p.age) * R * 1.3; const sz = R * p.sz * (1 + k * 0.4);
      x.save(); x.translate(px, py); x.globalAlpha = clamp(a, 0, 1);
      if (p.type === 'heart') { x.fillStyle = '#FF4D6D'; x.rotate(Math.sin(p.age * 6) * 0.3); corazon(x, sz); x.fill(); }
      else if (p.type === 'star') { x.fillStyle = '#F7B32B'; x.rotate(p.rot + p.age * 2); estrella(x, sz, sz * 0.45); x.fill(); }
      else if (p.type === 'spark') { x.fillStyle = '#fff'; x.rotate(p.rot); estrella(x, sz * 0.8, sz * 0.18); x.fill(); }
      else if (p.type === 'sweat') {
        x.fillStyle = '#7CC7FF'; x.beginPath(); x.moveTo(0, -sz); x.quadraticCurveTo(sz * 0.8, sz * 0.2, 0, sz * 0.6); x.quadraticCurveTo(-sz * 0.8, sz * 0.2, 0, -sz); x.fill();
      } else { x.fillStyle = 'rgba(210,220,235,1)'; x.font = `700 ${sz * 1.9}px -apple-system,system-ui,sans-serif`; x.fillText('z', 0, 0); }
      x.restore();
    }
  }

  private ojo(forma: FormaOjo, w: number, h: number, abierto: number, sd: number) {
    const x = this.x, t = AHORA() / 1000;
    switch (forma) {
      case 'wide': w *= 1.16; h *= 1.12; // y sigue como 'pill', más grande
      case 'pill': { const hh = Math.max(h * abierto, w * 0.3); rr(x, -w / 2, -hh / 2, w, hh, Math.min(w / 2, hh / 2)); x.fill(); break; }
      case 'dot': x.beginPath(); x.arc(0, 0, w * 0.45, 0, Math.PI * 2); x.fill(); break;
      case 'line': x.rotate(-sd * 0.2); rr(x, -w * 0.78, -w * 0.21, w * 1.56, w * 0.42, w * 0.21); x.fill(); break;
      case 'flat': rr(x, -w * 0.72, -w * 0.2, w * 1.44, w * 0.4, w * 0.2); x.fill(); break;
      case 'happy': x.lineWidth = w * 0.5; x.lineCap = 'round'; x.beginPath(); x.arc(0, h * 0.18, w * 0.82, Math.PI * 1.12, Math.PI * 1.88); x.stroke(); break;
      case 'closed': x.lineWidth = w * 0.36; x.lineCap = 'round'; x.beginPath(); x.arc(0, -h * 0.08, w * 0.78, Math.PI * 0.15, Math.PI * 0.85); x.stroke(); break;
      case 'spiral': {
        x.lineWidth = w * 0.22; x.lineCap = 'round'; x.beginPath();
        for (let a = 0; a < 4.4 * Math.PI; a += 0.2) { const r = w * 0.06 + a * w * 0.058, aa = a + t * 9 * sd; const px = Math.cos(aa) * r, py = Math.sin(aa) * r; if (a) x.lineTo(px, py); else x.moveTo(px, py); }
        x.stroke(); break;
      }
      case 'heart': x.fillStyle = '#FF4D6D'; corazon(x, w * 1.2); x.fill(); x.fillStyle = CUERPO.tinta; break;
      case 'star': x.fillStyle = '#F7B32B'; x.rotate(t * 1.5 * sd); estrella(x, w * 1.05, w * 0.46); x.fill(); x.fillStyle = CUERPO.tinta; break;
      case 'tired': rr(x, -w / 2, -h * 0.02, w, h * 0.38, w / 2); x.fill(); rr(x, -w * 0.62, -h * 0.1, w * 1.24, w * 0.22, w * 0.11); x.fill(); break;
      case 'wink':
        if (sd < 0) { rr(x, -w / 2, -h / 2, w, h, w / 2); x.fill(); }
        else { x.lineWidth = w * 0.5; x.lineCap = 'round'; x.beginPath(); x.arc(0, h * 0.18, w * 0.82, Math.PI * 1.12, Math.PI * 1.88); x.stroke(); }
        break;
      default: rr(x, -w / 2, -h / 2, w, h, w / 2); x.fill();
    }
  }
}
