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
// estudio. El dibujo y las curvas de animación son las mismas. Los colores, en
// cambio, salen de los tokens del panel (./paleta.ts) cuando se le pasan, y
// «reducir movimiento» (`quieto`) quita todo recorrido, no solo lo acorta.
// ─────────────────────────────────────────────────────────────────────────────

import type { Sonido } from './sonidos.ts';
import type { PaletaTenti } from './paleta.ts';
// El dibujo (contorno, ojos, mofletes, luz) sale de la misma geometría que el
// icono de lo diario: aquí solo se anima.
import { BAJADA, LUZ, MOFLETE, OJO, SILUETA_PX, colocarOjo, medidas, pildora, recorrerContorno } from './geometria.ts';

type RGB = [number, number, number];

// Los sonidos van en su propio chunk y se piden la primera vez que hacen falta:
// con «Sonidos de Tenti» apagado (Configuración › Tu panel) no se descarga la
// síntesis de veinticinco efectos. Se piden al encender `sonido`, no al primer
// efecto, para que ese primero no llegue tarde respecto al gesto que lo provoca.
let sonidos: typeof import('./sonidos.ts') | null = null;
let pidiendoSonidos: Promise<void> | null = null;
function cargarSonidos(): Promise<void> {
  return (pidiendoSonidos ??= import('./sonidos.ts').then(
    (m) => { sonidos = m; },
    // Si el chunk no llega, otro intento la próxima vez: un sonido no rompe nada.
    () => { pidiendoSonidos = null; },
  ));
}

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

// Los colores del prototipo, para cuando nadie le pasa una paleta (o los tokens
// no se pudieron leer: el componente lo marca con data-paleta="defecto").
const PALETA_PROTOTIPO: PaletaTenti = {
  cuerpo: ['#FFFAF5', '#DDCCBF'], tinta: '#1A1412', rubor: '#FF7896', chispa: '#FFFFFF', hecho: '#34D399',
};

type FormaOjo = 'pill' | 'wide' | 'dot' | 'line' | 'flat' | 'happy' | 'closed' | 'spiral' | 'heart' | 'star' | 'tired' | 'wink';
// La insignia lleva el color de su estado (`colorDe`): así 'hecho' no puede
// quedarse con un punto de otro color que el tinte.
type Insignia = 'dots' | 'dot' | 'bang' | 'q' | null;

interface ConfigEstado {
  etiqueta: string; col: string; tint: number; ojo: FormaOjo; insignia: Insignia; sonido?: Sonido;
  mira?: [number, number]; escanea?: boolean; bota?: boolean; ladea?: number; suda?: boolean; respira?: boolean; zz?: boolean;
}

/** Lo que Tenti está haciendo. Cada uno con su color, sus ojos y su sonido. */
export const ESTADOS = {
  reposo: { etiqueta: 'En reposo', col: '#E6E9EE', tint: 0, ojo: 'pill', insignia: null },
  trabajando: { etiqueta: 'Trabajando', col: '#3B9EFF', tint: 0.72, ojo: 'pill', insignia: 'dots', sonido: 'work' },
  hecho: { etiqueta: 'Hecho', col: '#34D399', tint: 0.35, ojo: 'happy', insignia: 'dot', sonido: 'finish' },
  error: { etiqueta: 'Algo ha fallado', col: '#F4505E', tint: 0.78, ojo: 'flat', insignia: 'dot', sonido: 'error' },
  mareado: { etiqueta: 'Mareado', col: '#F472B6', tint: 0.7, ojo: 'spiral', insignia: null, sonido: 'dizzy' },
  pensando: { etiqueta: 'Pensando', col: '#8B5CF6', tint: 0.72, ojo: 'pill', insignia: 'dots', mira: [0.55, 0.55], sonido: 'think' },
  buscando: { etiqueta: 'Buscando', col: '#6366F1', tint: 0.72, ojo: 'pill', insignia: 'dots', escanea: true, sonido: 'search' },
  esperaTuOk: { etiqueta: 'Espera tu visto bueno', col: '#F5A524', tint: 0.78, ojo: 'wide', insignia: 'bang', bota: true, sonido: 'approval' },
  pregunta: { etiqueta: 'Tiene una pregunta', col: '#22D3EE', tint: 0.75, ojo: 'pill', insignia: 'q', ladea: 0.17, sonido: 'question' },
  agobiado: { etiqueta: 'Agobiado', col: '#FB923C', tint: 0.72, ojo: 'tired', insignia: 'dot', suda: true, sonido: 'rate' },
  dormido: { etiqueta: 'Dormido', col: '#94A3B8', tint: 0.32, ojo: 'closed', insignia: null, respira: true, zz: true, sonido: 'sleep' },
} satisfies Record<string, ConfigEstado>;
export type EstadoTenti = keyof typeof ESTADOS;

/** El gesto con el que Tenti entra en un estado. */
export type AnimacionEntrada = 'rodar' | 'chispas' | 'sacudir' | 'botar' | 'marear' | 'sudar' | 'parpadear';
const ENTRADA: Partial<Record<EstadoTenti, AnimacionEntrada[]>> = {
  hecho: ['rodar', 'chispas'], error: ['sacudir'], esperaTuOk: ['botar'], mareado: ['marear'],
  pregunta: ['parpadear'], agobiado: ['sudar'],
};

/**
 * Qué anima al entrar en `estado`. Con `quieto` («reducir movimiento») se queda,
 * como mucho, en un parpadeo: el cambio se ve en los ojos y el color, sin giros,
 * botes ni chispas que crucen la pantalla.
 */
export function animacionDeEntrada(estado: EstadoTenti, quieto: boolean): AnimacionEntrada[] {
  const a = ENTRADA[estado] ?? ['parpadear'];
  return quieto ? a.filter((x) => x === 'parpadear') : a;
}

/** Reacciones de un momento: vuelven solas al estado de antes. */
export const EMOCIONES = {
  amor: { etiqueta: 'Amor', ojo: 'heart', sonido: 'love' },
  sorpresa: { etiqueta: 'Sorpresa', ojo: 'dot', sonido: 'pop' },
  orgullo: { etiqueta: 'Orgullo', ojo: 'star', sonido: 'proud' },
  guino: { etiqueta: 'Guiño', ojo: 'wink', sonido: 'wink' },
  bostezo: { etiqueta: 'Bostezo', ojo: 'tired', sonido: 'yawn' },
  // 'feliz' suena (corto y alegre): es la emoción del logo guardado. Al
  // saludar va en silencio, porque el saludo ya lleva su propio sonido.
  feliz: { etiqueta: 'Feliz', ojo: 'happy', sonido: 'love' },
  // El segundo toque seguido: «¡eh!».
  molesto: { etiqueta: 'Molesto', ojo: 'line', sonido: 'annoyed' },
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

export interface OpcionesTenti {
  mini?: boolean; colorCuerpo?: string | null; sonido?: boolean;
  /** Los colores del panel (./paleta.ts). Sin ella, los del prototipo. */
  paleta?: PaletaTenti | null;
  /** El piloto de estado sobre la cabeza (puntos, «!», «?»). */
  insignias?: boolean;
  /** «Reducir movimiento»: sin recorrido, ver `animacionDeEntrada`. */
  quieto?: boolean;
  /** Mira alrededor de vez en cuando, en reposo (`proximoDespertar` lo cuenta). */
  miradas?: boolean;
  /** El color de la silueta por dentro del cuerpo, o null para no pintarla.
   *  Es la del icono (`SILUETA_PX`): a tamaño de icono, en claro, el cuerpo
   *  crema da 1,04:1 sobre --card y sin ella Tenti son dos ojos flotando. */
  silueta?: string | null;
}

interface ColoresRgb { luz: RGB; sombra: RGB; rubor: RGB }
const aRgb = (p: PaletaTenti): ColoresRgb => ({ luz: hexRgb(p.cuerpo[0]), sombra: hexRgb(p.cuerpo[1]), rubor: hexRgb(p.rubor) });

export class Tenti {
  private c: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private mini: boolean;
  private colorCuerpo: RGB | null;
  private conSonido = false;
  /** Si sus reacciones suenan. Al encenderlo se piden los sonidos (otro chunk). */
  get sonido(): boolean { return this.conSonido; }
  set sonido(v: boolean) { this.conSonido = v; if (v) void cargarSonidos(); }
  /** «Reducir movimiento». Se puede cambiar en vivo. */
  quieto: boolean;
  /** Mirar alrededor en reposo. Se puede cambiar en vivo. */
  miradas: boolean;
  /** Ver `OpcionesTenti.silueta`. Se puede cambiar en vivo (claro ↔ oscuro). */
  silueta: string | null;
  private dpr = 1;
  private insignias: boolean;
  private paleta: PaletaTenti = PALETA_PROTOTIPO;
  private rgb: ColoresRgb = aRgb(PALETA_PROTOTIPO);
  /** Cuántas veces ha saludado DE VERDAD (con `quieto`, saludar() no cuenta). */
  saludos = 0;
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
  private insignia: Insignia = null;
  private colInsignia = '#fff';
  private claveInsignia = 'none';
  private turnoInsignia = 0;
  private parts: Particula[] = [];
  private proxParpadeo: number;
  /** Hacia dónde mira, de -1 a 1 en cada eje. */
  mira = { x: 0, y: 0 };
  /** La mirada de ambiente en curso (se suma a `mira`) y hasta cuándo dura. */
  private mirada = { x: 0, y: 0 };
  private miradaHasta = 0;
  private proxMirada: number;
  private t0: number;
  private saludaHasta = 0;
  private ultimoAmbiente = 0;
  private ultimo = AHORA();
  private temporizadores = new Set<ReturnType<typeof setTimeout>>();

  constructor(canvas: HTMLCanvasElement, {
    mini = false, colorCuerpo = null, sonido = false, paleta = null, insignias = true, quieto = false,
    miradas = false, silueta = null,
  }: OpcionesTenti = {}) {
    this.c = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tenti necesita un canvas 2D');
    this.x = ctx; this.mini = mini; this.colorCuerpo = colorCuerpo ? hexRgb(colorCuerpo) : null; this.sonido = sonido;
    this.insignias = insignias; this.quieto = quieto; this.miradas = miradas; this.silueta = silueta;
    if (paleta) this.ponerPaleta(paleta);
    this.proxParpadeo = AHORA() + 1500 + Math.random() * 2000;
    this.proxMirada = AHORA() + 2500 + Math.random() * 4000;
    this.t0 = AHORA() - Math.random() * 5000;
  }

  /** Ajusta la resolución del canvas a su tamaño en pantalla. */
  medir(cssPx: number) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.dpr = dpr;
    this.c.width = Math.round(cssPx * dpr); this.c.height = Math.round(cssPx * dpr);
  }

  private luego(fn: () => void, ms: number) {
    const t = setTimeout(() => { this.temporizadores.delete(t); fn(); }, ms);
    this.temporizadores.add(t);
  }
  destruir() { for (const t of this.temporizadores) clearTimeout(t); this.temporizadores.clear(); }
  private suena(n?: Sonido) {
    if (!this.conSonido || !n) return;
    if (sonidos) sonidos.sonar(n);
    else void cargarSonidos().then(() => { if (this.conSonido) sonidos?.sonar(n); });
  }

  private anim(p: Prop, keys: Clave[], after?: () => void) {
    this.tw = this.tw.filter((t) => t.p !== p);
    this.tw.push({ p, keys, i: 0, from: this.s[p], t0: AHORA(), after }); this.lock[p] = 1;
  }

  /** El color de un estado: 'hecho' tiñe con el de la paleta (--success en el panel). */
  private colorDe(n: EstadoTenti): string { return n === 'hecho' ? this.paleta.hecho : ESTADOS[n].col; }

  ponerEstado(n: EstadoTenti, { forzar = false, silencio = false } = {}) {
    const c: ConfigEstado | undefined = ESTADOS[n];
    if (!c || (this.estado === n && !forzar)) return;
    const prev = this.estado; this.estado = n; this.cfg = c;
    this.colT = hexRgb(this.colorDe(n));
    // Si el tinte de antes no se veía, su color no pinta nada: arrancar la
    // mezcla desde él solo enseñaría un tono intermedio sucio (el gris azulado
    // de 'reposo' cruzándose con el verde de 'hecho').
    if (this.s.tint < 0.01) this.col = [...this.colT];
    this.tg.tint = c.tint; this.tg.tilt = c.ladea || 0; this.ponerInsignia(this.insignias ? c.insignia : null);
    for (const a of animacionDeEntrada(n, this.quieto)) {
      if (a === 'rodar') this.rodar(950, 1);
      else if (a === 'chispas') this.luego(() => this.emitir('spark', 5), 500);
      else if (a === 'sacudir') this.anim('ox', [[0.08, 50, E.out], [-0.08, 70, E.inOut], [0.05, 70, E.inOut], [0, 90, E.out]]);
      else if (a === 'botar') this.anim('oy', [[-0.2, 150, E.out], [0, 300, E.back]]);
      else if (a === 'marear') this.rodar(1300, 2);
      else if (a === 'sudar') this.emitir('sweat', 1);
      else if (n === 'pregunta' || prev !== 'reposo' || n !== 'reposo') this.parpadear();
    }
    if (!silencio) this.suena(c.sonido);
  }

  /** Cambia los colores (al pasar de claro a oscuro). No anima: el resto de la pantalla tampoco. */
  ponerPaleta(p: PaletaTenti | null) {
    this.paleta = p ?? PALETA_PROTOTIPO; this.rgb = aRgb(this.paleta);
    this.colT = hexRgb(this.colorDe(this.estado)); this.col = [...this.colT];
    if (this.insignia) this.colInsignia = this.colorDe(this.estado);
  }

  /** Enseña u oculta la insignia del estado actual. */
  mostrarInsignias(v: boolean) { this.insignias = v; this.ponerInsignia(v ? this.cfg.insignia : null); }

  private ponerInsignia(b: Insignia) {
    const clave = b ?? 'none'; if (clave === this.claveInsignia) return;
    this.claveInsignia = clave; const turno = ++this.turnoInsignia;
    this.anim('badgeS', [[0, 90, E.inOut]]);
    this.luego(() => {
      if (turno !== this.turnoInsignia) return;
      this.insignia = b; this.colInsignia = this.colorDe(this.estado);
      if (b) this.anim('badgeS', [[1, 280, E.back]]);
    }, 100);
  }

  parpadear() { if (this.lock.open) return; this.anim('open', [[0.06, 70, E.inOut], [1, 130, E.out]]); }
  /** Se aplasta, como al tocarlo, y suena (el sonido no es movimiento: con
   *  «reducir movimiento» suena igual, sin aplastarse). */
  aplastar() {
    this.suena('slap');
    if (this.quieto) return;
    this.anim('sy', [[0.78, 70, E.out], [1.1, 130, E.out], [1, 170, E.inOut]]);
    this.anim('sx', [[1.16, 70, E.out], [0.95, 130, E.out], [1, 170, E.inOut]]);
  }
  private rodar(d = 900, vueltas = 1) {
    this.s.roll = 0;
    this.anim('roll', [[Math.PI * 2 * vueltas, d, E.inOut]], () => { this.s.roll = 0; this.tg.roll = 0; });
  }
  /**
   * Saluda con la mano. Devuelve si lo ha hecho: con `quieto` no hace nada (es
   * todo recorrido: la mano sube, se agita y baja) y tampoco cuenta.
   */
  saludar(): boolean {
    if (this.quieto) return false;
    this.saludos++;
    this.anim('hands', [[1, 280, E.back]]); this.saludaHasta = AHORA() + 1500; this.emocion('feliz', 1500, true);
    this.suena('greet');
    this.luego(() => this.anim('hands', [[0, 240, E.inOut]]), 1550);
    return true;
  }

  /** Con `quieto`, solo cambian los ojos y el rubor: nada se desplaza ni sale volando. */
  emocion(n: EmocionTenti, d = 1800, silencio = false) {
    const em: { ojo: FormaOjo; sonido?: Sonido } | undefined = EMOCIONES[n]; if (!em) return;
    const mueve = !this.quieto;
    this.ojoForzado = em.ojo; this.ojoHasta = AHORA() + d;
    if (n === 'amor') {
      this.anim('blush', [[1, 300, E.out], [1, d - 600, E.lin], [0, 300, E.inOut]]);
      if (mueve) { this.emitir('heart', 4); this.anim('oy', [[-0.1, 160, E.out], [0, 300, E.back]]); }
    }
    if (n === 'sorpresa' && mueve) { this.anim('oy', [[-0.3, 140, E.out], [0, 380, E.back]]); this.anim('es', [[1.25, 120, E.out], [1, 500, E.inOut]]); }
    if (n === 'orgullo' && mueve) { this.emitir('star', 5); this.anim('tilt', [[-0.14, 220, E.out], [-0.14, d - 500, E.lin], [0, 280, E.inOut]]); }
    if (n === 'guino' && mueve) this.anim('tilt', [[0.12, 160, E.out], [0.12, d - 400, E.lin], [0, 240, E.inOut]]);
    if (n === 'bostezo') {
      if (mueve) { this.anim('sy', [[1.12, 500, E.inOut], [1, 500, E.inOut]]); this.anim('sx', [[0.94, 500, E.inOut], [1, 500, E.inOut]]); }
      this.luego(() => { this.ojoForzado = 'closed'; if (this.quieto) return; this.emitir('z', 2); }, 700);
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

  /**
   * Si queda algo por moverse: un tween, un temporizador, una partícula, unos
   * ojos forzados que tienen que volver, o un valor que aún no ha llegado a su
   * objetivo. El bucle de fotogramas sigue mientras esto (o `perpetuo()`) sea
   * cierto y ni uno más: pararlo a una hora fija dejaba un parpadeo a medias,
   * con los ojos entornados hasta el siguiente despertar. Los temporizadores
   * cuentan a propósito: el hueco del parpadeo doble son 30 ms, y así el bucle
   * no se duerme entre los dos.
   */
  animando(): boolean {
    if (this.tw.length || this.temporizadores.size || this.parts.length || this.ojoForzado) return true;
    if (AHORA() < this.saludaHasta) return true;
    // A tamaño de icono (mini) un 0,01 no llega a medio píxel: no merece los
    // treinta fotogramas de cola que cuesta acercarse a 0,002.
    const umbral = this.mini ? 0.01 : 0.002;
    for (const k of Object.keys(this.tg) as Prop[]) if (Math.abs(this.tg[k] - this.s[k]) > umbral) return true;
    return Math.abs(this.col[0] - this.colT[0]) + Math.abs(this.col[1] - this.colT[1]) + Math.abs(this.col[2] - this.colT[2]) > 1;
  }

  /**
   * Lo que se mueve sin fin mientras dure: escanear, botar, respirar, el mareo,
   * la insignia de puntos, los ojos que giran (espiral, estrella) y la mano del
   * saludo. Mientras sea cierto, un fotograma por refresco; si no, el bucle
   * duerme hasta `proximoDespertar()`. Con `quieto` nada de esto se mueve.
   */
  perpetuo(): boolean {
    if (this.quieto) return false;
    const c = this.cfg;
    if (c.escanea || c.bota || c.respira || this.estado === 'mareado') return true;
    if (this.insignias && this.insignia === 'dots' && !this.mini) return true;
    const forma = this.ojoForzado || c.ojo;
    if (forma === 'spiral' || forma === 'star') return true;
    return AHORA() < this.saludaHasta;
  }

  /**
   * Cuándo vuelve a pasar algo sin que nadie lo pida: el próximo parpadeo y,
   * solo fuera de mini, la siguiente partícula de ambiente de 'dormido' y
   * 'agobiado' (que el panel no usa). Con `quieto`, nunca: ni parpadea ni echa
   * partículas, así que no hay por qué despertar.
   */
  proximoDespertar(): number {
    if (this.quieto) return Infinity;
    const c = this.cfg;
    const ambiente = !this.mini && (c.zz || c.suda) ? this.ultimoAmbiente + 1300 : Infinity;
    // Una mirada en curso se despierta para volver al frente; si no, para la siguiente.
    const mirada = !this.miraAlrededor() ? Infinity : this.miradaHasta > AHORA() ? this.miradaHasta : this.proxMirada;
    return Math.min(this.proxParpadeo, ambiente, mirada);
  }

  /** Si toca mirar alrededor: solo en reposo, y nunca con «reducir movimiento». */
  private miraAlrededor(): boolean {
    return this.miradas && !this.quieto && this.estado === 'reposo';
  }

  private actualizar() {
    const n = AHORA(), dt = Math.min(0.05, (n - this.ultimo) / 1000); this.ultimo = n;
    const s = this.s, tg = this.tg, c = this.cfg, t = (n - this.t0) / 1000;
    // Con `quieto`, nada se mueve solo: ni el cursor, ni los estados que oscilan
    // sin fin (escanear, botar, respirar, el mareo), ni los parpadeos y las
    // partículas de ambiente. Lo que oscila nunca acabaría, y el bucle no
    // podría dormirse.
    const q = this.quieto;
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
    // Las miradas de ambiente: de vez en cuando mira a un lado (y un poco arriba
    // o abajo) un rato, y vuelve al frente. Se suman a `mira`, sin pisarla.
    if (this.miraAlrededor()) {
      if (n >= this.proxMirada) {
        const lado = Math.random() < 0.5 ? -1 : 1;
        this.mirada = { x: lado * (0.4 + Math.random() * 0.45), y: (Math.random() - 0.4) * 0.6 };
        this.miradaHasta = n + 900 + Math.random() * 900;
        this.proxMirada = this.miradaHasta + 3500 + Math.random() * 5000;
      } else if (n >= this.miradaHasta) this.mirada = { x: 0, y: 0 };
    } else {
      this.mirada = { x: 0, y: 0 };
      if (n >= this.proxMirada) this.proxMirada = n + 2500 + Math.random() * 4000;
    }
    let ty = q ? 0 : clamp(this.mira.x + this.mirada.x, -1, 1) * 0.62, tp = q ? 0 : clamp(this.mira.y + this.mirada.y, -1, 1) * 0.5;
    if (c.mira) { ty = ty * 0.35 + c.mira[0] * 0.55; tp = tp * 0.3 + c.mira[1] * 0.5; }
    if (c.escanea && !q) { ty = Math.sin(t * 2.6) * 0.6; tp = -0.06; }
    if (this.estado === 'dormido') { ty = 0; tp = -0.14; }
    if (this.estado === 'mareado' && !q) ty = Math.sin(t * 9) * 0.25;
    const bota = c.bota && !q, respira = c.respira && !q;
    tg.yaw = ty; tg.pitch = tp; tg.tilt = c.ladea || 0; tg.oy = bota ? -Math.abs(Math.sin(t * 5.2)) * 0.07 : 0;
    tg.sy = respira ? 1 + Math.sin(t * 1.8) * 0.035 : 1; tg.sx = respira ? 1 - Math.sin(t * 1.8) * 0.02 : 1;
    const kMira = 1 - Math.pow(0.0025, dt), kGen = 1 - Math.pow(0.0008, dt);
    for (const k of Object.keys(tg) as Prop[]) { if (this.lock[k]) continue; s[k] += (tg[k] - s[k]) * (k === 'yaw' || k === 'pitch' ? kMira : kGen); }
    this.col = mix(this.col, this.colT, 1 - Math.pow(0.002, dt));
    if (n > this.proxParpadeo) {
      if (!q && this.estado !== 'dormido' && this.estado !== 'mareado') { this.parpadear(); if (Math.random() < 0.22) this.luego(() => this.parpadear(), 230); }
      this.proxParpadeo = n + 2200 + Math.random() * 3200;
    }
    if (this.ojoForzado && n > this.ojoHasta) this.ojoForzado = null;
    if (!q && !this.mini && n - this.ultimoAmbiente > 1300) {
      this.ultimoAmbiente = n;
      if (c.zz) this.emitir('z', 1);
      if (c.suda && Math.random() < 0.5) this.emitir('sweat', 1);
    }
    for (const p of this.parts) p.age += dt;
    this.parts = this.parts.filter((p) => p.age < p.life);
  }

  private dibujar() {
    const x = this.x, W = this.c.width, H = this.c.height, s = this.s, P = this.rgb;
    x.clearRect(0, 0, W, H);
    const { R, rx, ry } = medidas(W);
    const cx = W / 2 + s.ox * R, cy = H / 2 + s.oy * R + R * BAJADA;
    const col = this.col;
    x.save(); x.translate(cx, cy); x.rotate(s.tilt); x.scale(s.sx, s.sy);
    const path = new Path2D(), m = s.morph;
    if (m < 0.01) {
      recorrerContorno(rx, ry, (px, py, i) => { if (i) path.lineTo(px, py); else path.moveTo(px, py); });
      path.closePath();
    } else {
      const w = lerp(rx, R * 1.02, m), h = lerp(ry, R * 0.94, m), r = lerp(Math.min(rx, ry), R * 0.34, m);
      path.roundRect(-w, -h, 2 * w, 2 * h, r);
    }
    // cuerpo
    const bc = this.colorCuerpo;
    {
      let c0: RGB, c1: RGB;
      if (bc) { c0 = mix(bc, [255, 255, 255], 0.35); c1 = mix(bc, [0, 0, 0], 0.18); } else { c0 = P.luz; c1 = P.sombra; }
      const { degradado: dg, volumen: vo, brillo: br } = LUZ;
      const g = x.createLinearGradient(rx * dg.desde[0], ry * dg.desde[1], rx * dg.hasta[0], ry * dg.hasta[1]); g.addColorStop(0, rgba(c0, 1)); g.addColorStop(1, rgba(c1, 1)); x.fillStyle = g; x.fill(path);
      if (!bc && s.tint > 0.01) {
        const tg2 = x.createLinearGradient(0, ry, 0, -ry * 0.25); tg2.addColorStop(0, rgba(col, 0.92 * s.tint)); tg2.addColorStop(1, rgba(col, 0));
        x.fillStyle = tg2; x.fill(path);
      }
      const sh = x.createRadialGradient(rx * vo.foco[0], ry * vo.foco[1], R * vo.radioFoco, 0, 0, R * vo.radio);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(vo.desde, 'rgba(0,0,0,0)'); sh.addColorStop(1, `rgba(0,0,0,${vo.opacidad})`); x.fillStyle = sh; x.fill(path);
      const hl = x.createRadialGradient(rx * br.centro[0], ry * br.centro[1], 0, rx * br.centro[0], ry * br.centro[1], R * br.radio);
      hl.addColorStop(0, `rgba(255,255,255,${br.opacidad})`); hl.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = hl; x.fill(path);
      // La silueta, POR DENTRO, como la del icono: el trazo es el doble y el
      // recorte se come la mitad de fuera. Mide SILUETA_PX en px de pantalla.
      if (this.silueta) {
        x.save(); x.clip(path); x.strokeStyle = this.silueta; x.lineWidth = 2 * SILUETA_PX * this.dpr / Math.max(0.5, Math.min(s.sx, s.sy));
        x.stroke(path); x.restore();
      }
    }
    // mofletes
    const bl = Math.max(s.blush, MOFLETE.minimo) * (1 - m);
    if (bl > 0.01) {
      x.save(); x.clip(path); const yo = Math.sin(s.yaw) * rx * MOFLETE.giro; x.fillStyle = rgba(P.rubor, MOFLETE.opacidad * bl);
      for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * rx * MOFLETE.x + yo, ry * MOFLETE.y, R * MOFLETE.rx, R * MOFLETE.ry, 0, 0, Math.PI * 2); x.fill(); }
      x.restore();
    }
    // ojos: sobre una esfera, para que giren con la cabeza
    const tinta = this.paleta.tinta;
    x.save(); x.clip(path); x.fillStyle = tinta; x.strokeStyle = tinta;
    const forma = this.ojoForzado || this.cfg.ojo;
    for (const sd of [-1, 1] as const) {
      const o = colocarOjo(sd, s.yaw, s.pitch, rx, ry, m, s.roll); if (!o) continue;
      x.save(); x.translate(o.x, o.y); x.scale(o.escalaX, o.escalaY); this.ojo(forma, R * OJO.w * s.es, R * OJO.h * s.es, s.open, sd); x.restore();
    }
    x.restore();
    x.restore();
    // manos
    if (s.hands > 0.01) {
      const hr = R * 0.2 * s.hands, c0 = bc ? mix(bc, [255, 255, 255], 0.35) : P.luz, c1 = bc ? bc : P.sombra; const tt = AHORA() / 1000;
      for (const sd of [-1, 1]) {
        let hx = cx + sd * rx * 1.25 * s.sx, hy = cy + ry * 0.42;
        if (sd === 1 && AHORA() < this.saludaHasta) { hy -= R * 0.38 + Math.sin(tt * 13) * R * 0.16; hx += Math.cos(tt * 13) * R * 0.06; }
        const g = x.createLinearGradient(hx + hr, hy - hr, hx - hr, hy + hr); g.addColorStop(0, rgba(c0, 1)); g.addColorStop(1, rgba(c1, 1));
        x.fillStyle = g; x.beginPath(); x.arc(hx, hy, hr, 0, Math.PI * 2); x.fill();
      }
    }
    // insignia
    if (this.insignias && this.insignia && s.badgeS > 0.01) {
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
    // ⚠️ Suben más allá del borde de arriba del lienzo (el lienzo es justo el
    // cuadro de `tamano`, sin aire), y allí se cortaban en seco: a 80 px las
    // chispas de 'hecho' se veían como medias estrellas. Se desvanecen en el
    // último tramo antes del borde, en vez de partirse contra él.
    const fundidoBorde = R * 0.3;
    for (const p of this.parts) {
      if (p.age < 0) continue;
      const k = p.age / p.life, a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      const px = cx + (p.x + p.vx * p.age) * R * 1.3, py = cy + (p.y + p.vy * p.age) * R * 1.3; const sz = R * p.sz * (1 + k * 0.4);
      const borde = clamp((py - sz * (p.type === 'z' ? 1.4 : 1)) / fundidoBorde, 0, 1);
      if (borde <= 0) continue;
      x.save(); x.translate(px, py); x.globalAlpha = clamp(a, 0, 1) * borde;
      if (p.type === 'heart') { x.fillStyle = '#FF4D6D'; x.rotate(Math.sin(p.age * 6) * 0.3); corazon(x, sz); x.fill(); }
      else if (p.type === 'star') { x.fillStyle = '#F7B32B'; x.rotate(p.rot + p.age * 2); estrella(x, sz, sz * 0.45); x.fill(); }
      else if (p.type === 'spark') { x.fillStyle = this.paleta.chispa; x.rotate(p.rot); estrella(x, sz * 0.8, sz * 0.18); x.fill(); }
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
      case 'pill': { const p = pildora(w, h, abierto); rr(x, -w / 2, -p.alto / 2, w, p.alto, p.radio); x.fill(); break; }
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
      case 'heart': x.fillStyle = '#FF4D6D'; corazon(x, w * 1.2); x.fill(); x.fillStyle = this.paleta.tinta; break;
      case 'star': x.fillStyle = '#F7B32B'; x.rotate(t * 1.5 * sd); estrella(x, w * 1.05, w * 0.46); x.fill(); x.fillStyle = this.paleta.tinta; break;
      case 'tired': rr(x, -w / 2, -h * 0.02, w, h * 0.38, w / 2); x.fill(); rr(x, -w * 0.62, -h * 0.1, w * 1.24, w * 0.22, w * 0.11); x.fill(); break;
      case 'wink':
        if (sd < 0) { rr(x, -w / 2, -h / 2, w, h, w / 2); x.fill(); }
        else { x.lineWidth = w * 0.5; x.lineCap = 'round'; x.beginPath(); x.arc(0, h * 0.18, w * 0.82, Math.PI * 1.12, Math.PI * 1.88); x.stroke(); }
        break;
      default: rr(x, -w / 2, -h / 2, w, h, w / 2); x.fill();
    }
  }
}
