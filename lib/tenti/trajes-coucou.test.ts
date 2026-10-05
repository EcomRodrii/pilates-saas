// Los trajes de Coucou portados (./trajes-coucou.ts). Ningún test ve un canvas,
// así que aquí se prueba lo que un repaso visual no garantiza:
//   · que están TODOS los del original y que cada uno es un traje de Tenti;
//   · que el port habla la misma geometría que el cuerpo del motor (si no, los
//     recortes contra el contorno —la sombra del ala, la bufanda— no casarían);
//   · que cada traje dibuja sin lanzar en cualquier pose (un traje que lanza
//     tira el canvas entero a su reserva);
//   · el gorro de bruja: lo de detrás (el ala entera) y lo de delante (sombra
//     sobre la cabeza, ala, cono, banda naranja y hebilla dorada), con los
//     colores del original;
//   · y que con su margen (`lienzoDeTenti`) ningún traje se sale del lienzo.
// La fidelidad de verdad se mira: /interno/tenti tiene la hoja de sheet.html.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACC_PITCH, EXP, EYE_H, EYE_P, EYE_SP, EYE_W, OUTFITS, VIEW_TILT, VISTAS_DE_LA_HOJA,
  capClip, dibujarMochi, eyeFrames, frontArc, mochiPath, proj, ringR, rot, surf, witchBrimPts,
  type MarcoCabeza, type TrajeCoucou,
} from './trajes-coucou.ts';
import { EXPONENTE, MARGEN_TRAJE, OJO, R_DEL_LADO, SEMIEJE_X, SEMIEJE_Y, BAJADA, colocarOjo, lienzoDeTenti } from './geometria.ts';
import { LISTA_TRAJES, TRAJES, type NombreTrajeCoucou } from './trajes.ts';

// ── Un Path2D y un contexto 2D falsos que apuntan lo que se pinta ────────────
//
// Cada figura guarda sus puntos (y los puntos de control de las curvas, que
// las encierran: la caja sale conservadora). El contexto lleva su matriz
// (save/restore/translate/rotate/scale) para que el pompón, el lazo o la hoja
// de la calabaza, que se dibujan trasladados, cuenten donde caen de verdad.

type Pt = [x: number, y: number, radio: number];
class Ruta {
  pts: Pt[] = [];
  moveTo(x: number, y: number) { this.pts.push([x, y, 0]); }
  lineTo(x: number, y: number) { this.pts.push([x, y, 0]); }
  quadraticCurveTo(a: number, b: number, x: number, y: number) { this.pts.push([a, b, 0], [x, y, 0]); }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) { this.pts.push([a, b, 0], [c, d, 0], [x, y, 0]); }
  arc(x: number, y: number, r: number) { if (r < 0) throw new RangeError('radio negativo'); this.pts.push([x, y, r]); }
  ellipse(x: number, y: number, a: number, b: number) { if (a < 0 || b < 0) throw new RangeError('radio negativo'); this.pts.push([x, y, Math.max(a, b)]); }
  arcTo(x: number, y: number, a: number, b: number) { this.pts.push([x, y, 0], [a, b, 0]); }
  rect(x: number, y: number, w: number, h: number) { this.pts.push([x, y, 0], [x + w, y + h, 0]); }
  addPath(p: Ruta) { this.pts.push(...p.pts); }
  closePath() {}
  roundRect() {}
}

type Matriz = [number, number, number, number, number, number];
const por = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

interface Apunte { tipo: 'fill' | 'stroke' | 'clip'; color: unknown; colores: string[]; ruta: Ruta | null; regla?: string }
interface Caja { x0: number; x1: number; y0: number; y1: number }

/** Un contexto que apunta cada fill/stroke/clip (con su color y las paradas de
 *  su degradado) y la caja de lo PINTADO (no de los recortes). */
function contexto() {
  let m: Matriz = [1, 0, 0, 1, 0, 0];
  const pila: Matriz[] = [];
  let actual = new Ruta();
  let grosor = 1;
  const apuntes: Apunte[] = [];
  const caja: Caja = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const estado: Record<string | symbol, unknown> = {};
  const sumar = (r: Ruta, mm: Matriz, extra: number) => {
    const escala = Math.hypot(mm[0], mm[1]);
    for (const [x, y, radio] of r.pts) {
      const X = mm[0] * x + mm[2] * y + mm[4], Y = mm[1] * x + mm[3] * y + mm[5], e = radio * escala + extra;
      caja.x0 = Math.min(caja.x0, X - e); caja.x1 = Math.max(caja.x1, X + e);
      caja.y0 = Math.min(caja.y0, Y - e); caja.y1 = Math.max(caja.y1, Y + e);
    }
  };
  const coloresDe = (v: unknown): string[] => (typeof v === 'string' ? [v] : ((v as { paradas?: string[] })?.paradas ?? []));
  const ctx = new Proxy(estado, {
    get(t, k) {
      if (k === 'save') return () => { pila.push(m); };
      if (k === 'restore') return () => { m = pila.pop() ?? m; };
      if (k === 'translate') return (x: number, y: number) => { m = por(m, [1, 0, 0, 1, x, y]); };
      if (k === 'scale') return (a: number, b: number) => { m = por(m, [a, 0, 0, b, 0, 0]); };
      if (k === 'rotate') return (a: number) => { m = por(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); };
      if (k === 'beginPath') return () => { actual = new Ruta(); };
      if (k === 'closePath') return () => {};
      if (typeof k === 'string' && k in Ruta.prototype) {
        // Lo que se traza en el camino del contexto se transforma AL TRAZARLO.
        return (...a: number[]) => {
          const q = new Ruta(); (q[k as 'lineTo'] as (...x: number[]) => void)(...a);
          sumar(q, m, 0); actual.pts.push(...q.pts.map(([x, y, r]): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], r]));
        };
      }
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return () => { const g = { paradas: [] as string[], addColorStop: (_: number, c: string) => { g.paradas.push(c); } }; return g; };
      }
      if (k === 'fill' || k === 'stroke') {
        return (r?: Ruta) => {
          if (r) sumar(r, m, k === 'stroke' ? grosor / 2 : 0);
          apuntes.push({ tipo: k, color: t[k === 'fill' ? 'fillStyle' : 'strokeStyle'], colores: coloresDe(t[k === 'fill' ? 'fillStyle' : 'strokeStyle']), ruta: r ?? actual });
        };
      }
      if (k === 'clip') return (r?: Ruta, regla?: string) => { apuntes.push({ tipo: 'clip', color: null, colores: [], ruta: r ?? actual, regla }); };
      if (k === 'fillRect') return () => { apuntes.push({ tipo: 'fill', color: t.fillStyle, colores: coloresDe(t.fillStyle), ruta: null }); };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { if (k === 'lineWidth') grosor = v as number; t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, apuntes, caja };
}

before(() => { (globalThis as { Path2D?: unknown }).Path2D = Ruta; });
after(() => { delete (globalThis as { Path2D?: unknown }).Path2D; });

const marco = (R: number, yaw = 0, pitch = 0, dx = 0, dy = 0): MarcoCabeza =>
  ({ R, rx: R * SEMIEJE_X, ry: R * SEMIEJE_Y, view: VIEW_TILT, yaw, pitch, phys: { dx, dy } });

const NOMBRES: NombreTrajeCoucou[] = ['beanie', 'santaHat', 'partyHat', 'crown', 'witchHat', 'sunglasses', 'roundGlasses', 'scarf', 'pumpkin', 'bow'];

function pintar(o: TrajeCoucou, H: MarcoCabeza) {
  const c = contexto();
  const cuerpo = mochiPath(H.rx, H.ry) as unknown as Ruta;
  o.back?.(c.ctx, H);
  o.front?.(c.ctx, H, cuerpo as unknown as Path2D);
  return { ...c, cuerpo };
}

// ── Están todos, y cada uno es un traje de Tenti ─────────────────────────────

test('están los diez trajes del original, y cada uno es exactamente un traje de Tenti', () => {
  assert.deepEqual(Object.keys(OUTFITS).sort(), [...NOMBRES].sort());
  const usados = LISTA_TRAJES.map((t) => TRAJES[t].coucou);
  assert.deepEqual([...usados].sort(), [...NOMBRES].sort(), 'cada traje de Coucou, una vez, en TRAJES (el selector de /interno los enseña todos)');
  for (const n of NOMBRES) assert.ok(OUTFITS[n].front || OUTFITS[n].back, `${n} no dibuja nada`);
  // Lo que el original marca: la bruja y la corona tienen parte de atrás, las
  // gafas de sol tapan los ojos y la calabaza recolorea el cuerpo.
  assert.ok(OUTFITS.witchHat.back && OUTFITS.crown.back);
  assert.equal(OUTFITS.sunglasses.frontAfterEyes, true);
  assert.deepEqual(OUTFITS.pumpkin.bodyColors, ['#FFA94D', '#E8590C']);
  assert.equal(TRAJES.bruja.coucou, 'witchHat', 'la bruja de la temporada es el witchHat de Coucou');
});

test('el port habla la geometría del cuerpo de Tenti: mismo superelipse, mismos ojos', () => {
  assert.equal(EXP, EXPONENTE);
  assert.deepEqual({ w: EYE_W, h: EYE_H, sp: EYE_SP, p: EYE_P }, { ...OJO });
  assert.equal(VIEW_TILT, -0.30);
  assert.equal(ACC_PITCH, 0.4);
  // mochiPath es el contorno del motor (recorrerContorno), con más tramos.
  const p = mochiPath(SEMIEJE_X, SEMIEJE_Y) as unknown as Ruta;
  for (const [x, y] of p.pts) {
    const v = Math.abs(x / SEMIEJE_X) ** EXPONENTE + Math.abs(y / SEMIEJE_Y) ** EXPONENTE;
    assert.ok(Math.abs(v - 1) < 1e-9, `(${x}, ${y}) fuera del contorno`);
  }
  // ringR es el radio del contorno a esa altura, y con la cabeza al frente el
  // aro del ecuador cae en el borde.
  assert.ok(Math.abs(ringR(0) - 1) < 1e-12 && ringR(1) === 0);
  // Los ojos del port caen donde los pinta el motor.
  for (const [yaw, pitch] of [[0, 0], [0.5, 0.2], [-0.62, -0.5]]) {
    const H = marco(1, yaw, pitch);
    const [l, r] = eyeFrames(H);
    for (const [o, lado] of [[l, -1], [r, 1]] as const) {
      const m = colocarOjo(lado, yaw, pitch, H.rx, H.ry);
      assert.ok(m && Math.abs(m.x - o.x) < 1e-9 && Math.abs(m.y - o.y) < 1e-9 && Math.abs(m.escalaX - o.fx) < 1e-9, `ojo ${lado} en ${yaw}/${pitch}`);
    }
  }
  // rot/proj/surf: un punto de la superficie al frente se proyecta delante (z > 0).
  assert.ok(proj(marco(1), surf(0, 0)).z > 0);
  assert.deepEqual(rot([1, 0, 0], 0, 0), [1, 0, 0]);
});

test('cada traje dibuja sin lanzar en cualquier pose, también más allá de lo que gira el motor', () => {
  for (const n of NOMBRES) {
    for (const yaw of [-Math.PI, -1.2, -0.62, -0.3, 0, 0.3, 0.62, 1.2, Math.PI]) {
      for (const pitch of [-1.5, -0.5, -0.14, 0, 0.25, 0.5, 1.5]) {
        for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [0.6, -0.4]]) {
          assert.doesNotThrow(() => pintar(OUTFITS[n], marco(30, yaw, pitch, dx, dy)), `${n} a yaw ${yaw}, pitch ${pitch}`);
        }
      }
    }
  }
  // La hoja entera del original, con su cuerpo y sus ojos.
  for (const n of [null, ...NOMBRES]) {
    for (const v of VISTAS_DE_LA_HOJA) assert.doesNotThrow(() => dibujarMochi(contexto().ctx, 190, { ...v, scale: 0.62, outfit: n }));
  }
});

test('un aro entero de espaldas no revienta capClip: no cubre nada', () => {
  const H = { ...marco(30), view: Math.PI / 2 }; // vista desde arriba del todo: el aro de y = 0,5 queda detrás
  assert.equal(frontArc(H, 0.5, 1).length, 0);
  assert.equal((capClip(H, 0.5, 1) as unknown as Ruta).pts.length, 0);
});

// ── El gorro de bruja ────────────────────────────────────────────────────────

test('bruja, detrás: el ala ENTERA, morada oscura, antes del cuerpo', () => {
  const H = marco(30);
  const c = contexto();
  OUTFITS.witchHat.back!(c.ctx, H);
  const rellenos = c.apuntes.filter((a) => a.tipo === 'fill');
  assert.equal(rellenos.length, 1);
  assert.deepEqual(rellenos[0].colores, ['#2A0A4F', '#3B0F6B']);
  // El ala da la vuelta entera a la cabeza (121 puntos, por delante y por detrás).
  const ala = rellenos[0].ruta!;
  assert.equal(ala.pts.length, witchBrimPts(H).length);
  assert.ok(witchBrimPts(H).some((p) => p.z < 0) && witchBrimPts(H).some((p) => p.z > 0), 'el ala rodea la cabeza');
  // Mucho más ancha que la cabeza (1,42 del radio, con su ondulación).
  const xs = ala.pts.map((p) => p[0]);
  assert.ok(Math.max(...xs) > H.rx * 1.3 && Math.min(...xs) < -H.rx * 1.3, `el ala va de ${Math.min(...xs)} a ${Math.max(...xs)}`);
});

test('bruja, delante: sombra del ala sobre la cabeza, ala, cono, pliegue, banda naranja y hebilla dorada', () => {
  const H = marco(30);
  const { apuntes, cuerpo } = pintar({ front: OUTFITS.witchHat.front }, H);
  const colores = apuntes.filter((a) => a.tipo !== 'clip').map((a) => (typeof a.color === 'string' ? a.color : a.colores.join('→')));
  assert.deepEqual(colores, [
    'rgba(40,0,70,0.10)', // la sombra del ala sobre la cabeza
    '#5B21B6→#3B0764', // el ala, delante
    'rgba(190,150,255,0.35)', // su canto
    '#7C3AED→#4C1D95→#2E1065', // el cono
    'rgba(255,255,255,0.22)→rgba(255,255,255,0)→rgba(0,0,0,0.15)', // su volumen
    'rgba(20,0,40,0.35)', // el pliegue de la punta
    '#F97316', // la banda naranja
    '#FCD34D', '#C2410C', // la hebilla dorada
  ]);
  // La sombra se recorta al contorno del CUERPO que le pasa el motor.
  const primerRecorte = apuntes.find((a) => a.tipo === 'clip')!;
  assert.equal(primerRecorte.ruta, cuerpo);
  // El cono sube por encima de la cabeza y la punta cae a la derecha, más con la física.
  const cono = apuntes.find((a) => a.colores[0] === '#7C3AED')!.ruta!;
  const alto = Math.min(...cono.pts.map((p) => p[1]));
  assert.ok(alto < -H.ry * 1.8, `el cono llega a ${alto}`);
  const punta = (dx: number) => {
    const c = pintar({ front: OUTFITS.witchHat.front }, marco(30, 0, 0, dx, 0));
    return Math.max(...c.apuntes.find((a) => a.colores[0] === '#7C3AED')!.ruta!.pts.map((p) => p[0]));
  };
  assert.ok(punta(1) > punta(0) && punta(0) > punta(-1), 'la punta no sigue a la física');
});

test('bruja: la hebilla gira con la cabeza (yaw), el cono se estrecha, y se inclina con ella a medias (ACC_PITCH)', () => {
  const medir = (yaw: number, pitch: number) => {
    const c = pintar({ front: OUTFITS.witchHat.front }, marco(30, yaw, pitch));
    const hebilla = c.apuntes.find((a) => a.color === '#FCD34D')!.ruta!.pts.map((p) => p[0]);
    const cono = c.apuntes.find((a) => a.colores[0] === '#7C3AED')!.ruta!.pts;
    return {
      hebilla: (Math.min(...hebilla) + Math.max(...hebilla)) / 2,
      ancho: Math.max(...cono.map((p) => p[0])) - cono[0][0],
      alto: Math.min(...cono.map((p) => p[1])),
    };
  };
  const frente = medir(0, 0);
  assert.ok(Math.abs(frente.hebilla) < 1e-6, 'al frente, la hebilla en el centro');
  assert.ok(medir(0.5, 0).hebilla > 3 && medir(-0.5, 0).hebilla < -3, 'la hebilla no sigue al giro');
  assert.ok(medir(0.5, 0).ancho < frente.ancho, 'girada, la base del cono no se estrecha');
  assert.notEqual(medir(0, 0.5).alto, frente.alto, 'el gorro no se inclina con la cabeza');
});

// ── El margen del lienzo: ningún traje se sale ───────────────────────────────

test('con el margen de lienzoDeTenti, ningún traje se sale del lienzo en ninguna pose del motor', () => {
  // Un cuadro de 100 (R = 30): las pocas medidas absolutas del original
  // (2-4 px de más en una banda recortada) no pesan como a tamaño de icono.
  const lado = 100, R = lado * R_DEL_LADO;
  const l = lienzoDeTenti(lado, true);
  // Del centro del cuerpo a cada borde del lienzo.
  const cuerpoY = lado / 2 + R * BAJADA;
  const limite = { arriba: -(l.arriba + cuerpoY), abajo: l.alto - l.arriba - cuerpoY, lado: l.ancho / 2 };
  // Lo que el cuerpo le hace al traje en el panel: aplastarse al tocarlo, el
  // bote de la sorpresa, el ladeo de 'pregunta', el bostezo.
  const cuerpos = [
    { sx: 1, sy: 1, oy: 0, tilt: 0 }, { sx: 1.16, sy: 1.1, oy: 0, tilt: 0 }, { sx: 1, sy: 1, oy: -0.3, tilt: 0 },
    { sx: 1, sy: 1, oy: 0, tilt: 0.17 }, { sx: 1, sy: 1, oy: 0, tilt: -0.17 }, { sx: 0.94, sy: 1.12, oy: 0, tilt: 0 },
  ];
  for (const n of NOMBRES) {
    for (const yaw of [-0.62, -0.3, 0, 0.3, 0.62]) for (const pitch of [-0.5, -0.14, 0, 0.25, 0.5]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      const { caja } = pintar(OUTFITS[n], marco(R, yaw, pitch, dx, dy));
      for (const c of cuerpos) {
        const esquinas = [[caja.x0, caja.y0], [caja.x1, caja.y0], [caja.x0, caja.y1], [caja.x1, caja.y1]].map(([x, y]) => {
          const sx = x * c.sx, sy = y * c.sy;
          return [sx * Math.cos(c.tilt) - sy * Math.sin(c.tilt), sx * Math.sin(c.tilt) + sy * Math.cos(c.tilt) + c.oy * R];
        });
        const ys = esquinas.map((e) => e[1]), xs = esquinas.map((e) => Math.abs(e[0]));
        const que = `${n} (yaw ${yaw}, pitch ${pitch}, física ${dx}/${dy}, cuerpo ${JSON.stringify(c)})`;
        assert.ok(Math.min(...ys) >= limite.arriba, `${que} sube a ${Math.min(...ys).toFixed(1)} y el lienzo empieza en ${limite.arriba.toFixed(1)}`);
        assert.ok(Math.max(...ys) <= limite.abajo, `${que} baja a ${Math.max(...ys).toFixed(1)} y el lienzo acaba en ${limite.abajo.toFixed(1)}`);
        assert.ok(Math.max(...xs) <= limite.lado, `${que} llega a ${Math.max(...xs).toFixed(1)} de lado y el lienzo a ${limite.lado.toFixed(1)}`);
      }
    }
  }
  // Y sin traje, el lienzo es el cuadro de siempre.
  assert.deepEqual(lienzoDeTenti(lado, false), { ancho: lado, alto: lado, izquierda: 0, arriba: 0 });
  assert.ok(MARGEN_TRAJE.arriba > MARGEN_TRAJE.lado, 'los gorros suben más de lo que se abren');
});
