// P3.8 — los niveles con RITMO y EQUIVALENCIAS en clases (diseño 23 de la
// investigación). Un nivel no da nada (sus «beneficios» son texto); lo que vale
// dinero son los créditos, y esto NO toca ni las reglas ni los saldos: solo los
// umbrales de `level_definitions`.
//
// ⚠️ «Sin recalcular nada ya concedido» (decisión del fundador): el nivel no se
// guarda, se calcula al vuelo desde el total histórico ganado. Así que cambiar
// umbrales cambia lo que ve la alumna. La regla es NADIE BAJA: un cambio que
// dejaría a alguna alumna (con algo ganado) sin su nivel o en uno más bajo no se
// guarda (`quienBajaria`, comprobado en el servidor). Subir sí puede: no se le
// quita nada a nadie.
//
// Puro y sin `@/`: lo prueba el runner de Node.

import type { ReglaDef } from '../student/gamificacion.ts';

/** Lo que se supone que viene una alumna constante. Se dice en pantalla: es un supuesto, no un dato. */
export const CLASES_POR_SEMANA_SUPUESTAS = 2;

export type Ritmo = 'relajado' | 'equilibrado' | 'exigente';
export const RITMOS: Readonly<Record<Ritmo, { nombre: string; clases: readonly number[] }>> = {
  relajado: { nombre: 'Relajado', clases: [0, 10, 25, 50, 100] },
  equilibrado: { nombre: 'Equilibrado', clases: [0, 20, 50, 100, 200] },
  exigente: { nombre: 'Exigente', clases: [0, 30, 80, 160, 300] },
};

/** Nombres de partida, sobrios y editables (sin metales ni emoji: la app de la alumna es de marca blanca). */
export const NOMBRES_SUGERIDOS = ['Respiración', 'Centro', 'Control', 'Precisión', 'Fluidez'] as const;

/**
 * Créditos que da, de media, una clase en ESTE estudio: lo de asistir más la
 * racha semanal repartida (se da con la primera clase de cada semana, y se
 * supone que viene `CLASES_POR_SEMANA_SUPUESTAS`). Vale la primera regla activa
 * de cada disparador, como la RPC que los otorga. `null` si el estudio no da
 * nada por venir a clase: entonces no hay equivalencia en clases.
 */
export function creditosPorClase(reglas: ReadonlyArray<ReglaDef>): number | null {
  const de = (t: string) => {
    const r = reglas.find((x) => x.trigger === t && x.activa);
    return r && r.creditos > 0 ? r.creditos : 0;
  };
  const total = de('ASISTENCIA_CLASE') + de('SEMANA_COMPLETA') / CLASES_POR_SEMANA_SUPUESTAS;
  return total > 0 ? total : null;
}

/** El umbral en créditos para N clases, redondeado a 10 (0 clases = 0). Para los RITMOS: cifras redondas. */
export function umbralDeClases(clases: number, porClase: number): number {
  if (!(clases > 0)) return 0;
  return Math.max(10, Math.round((clases * porClase) / 10) * 10);
}

/**
 * Lo mismo al EDITAR a mano: si las clases escritas son las que ya enseña ese
 * umbral, el umbral NO cambia (ida y vuelta: con 30 por clase, 200 se ve como
 * «7» y reescribir «7» no puede dejarlo en 210 y bajar a alguien). Si cambian,
 * se redondea a 1 crédito, no a 10.
 */
export function umbralAlEditarClases(clases: number, umbralActual: number, porClase: number): number {
  if (!(clases > 0)) return 0;
  if (clases === clasesDeUmbral(umbralActual, porClase)) return umbralActual;
  return Math.max(1, Math.round(clases * porClase));
}

/** «≈ N clases» para un umbral (redondeado; 0 si el umbral es 0). */
export function clasesDeUmbral(umbral: number, porClase: number): number {
  if (!(umbral > 0) || !(porClase > 0)) return 0;
  return Math.max(1, Math.round(umbral / porClase));
}

/** Los umbrales de un ritmo con las reglas de este estudio. */
export function escalaDeRitmo(ritmo: Ritmo, porClase: number): number[] {
  return RITMOS[ritmo].clases.map((c) => umbralDeClases(c, porClase));
}

/** Qué ritmo son estos umbrales (ordenados), o 'a_medida' si no coinciden con ninguno. */
export function ritmoDe(umbrales: readonly number[], porClase: number | null): Ritmo | 'a_medida' {
  if (!porClase) return 'a_medida';
  const orden = [...umbrales].sort((a, b) => a - b);
  for (const r of Object.keys(RITMOS) as Ritmo[]) {
    const e = escalaDeRitmo(r, porClase);
    if (e.length === orden.length && e.every((u, i) => u === orden[i])) return r;
  }
  return 'a_medida';
}

/** Lo mínimo de un nivel para comparar escalas. */
export interface NivelComparable { id: string; umbralCreditos: number; activo?: boolean; orden?: number }

/**
 * Los niveles activos, de menor a mayor umbral. Empate: por `orden` y luego por
 * id, como la app de la alumna (`nivelDe`) y el panel: si no, el servidor podría
 * creer que una alumna está en otro nivel del que ella ve.
 */
export function escala<T extends NivelComparable>(niveles: readonly T[]): T[] {
  // `activo` ausente cuenta como activo (el payload de la app de la alumna lo trae opcional).
  return niveles.filter((n) => n.activo !== false)
    .sort((a, b) => a.umbralCreditos - b.umbralCreditos || (a.orden ?? 0) - (b.orden ?? 0) || a.id.localeCompare(b.id));
}

/** El nivel (de una escala ya ordenada) que corresponde a un total, o `null` si no llega a ninguno. */
export function nivelDeTotal<T extends NivelComparable>(total: number, ordenada: readonly T[]): T | null {
  let actual: T | null = null;
  for (const n of ordenada) {
    if (total >= n.umbralCreditos) actual = n;
    else break;
  }
  return actual;
}

/** Lo que enseñan panel y app: nivel actual, siguiente y progreso hacia él. */
export interface VistaNivel<T> {
  actual: T | null;
  siguiente: T | null;
  /** Créditos que faltan para el siguiente; `null` si ya está en el último. */
  faltan: number | null;
  /** 0-1 dentro del tramo actual; 1 sin siguiente. */
  progreso: number;
}

/**
 * LA función que decide el nivel de una alumna, la misma para el servidor, el
 * panel (`calcularNivel`) y la app (`nivelDe`): `escala` (activos, por UMBRAL;
 * `orden` solo desempata) + `nivelDeTotal` sobre el total HISTÓRICO ganado.
 * Quien necesite el nivel llama aquí; un ordenado propio reintroduce el bug de
 * dos niveles distintos para la misma alumna (lo vigila nivel-paridad.test.ts).
 */
export function vistaDeNivel<T extends NivelComparable>(totalGanado: number, niveles: readonly T[]): VistaNivel<T> {
  const ordenada = escala(niveles);
  if (ordenada.length === 0) return { actual: null, siguiente: null, faltan: null, progreso: 0 };
  const actual = nivelDeTotal(totalGanado, ordenada);
  const siguiente = ordenada.find((n) => n.umbralCreditos > totalGanado) ?? null;
  if (!siguiente) return { actual, siguiente: null, faltan: null, progreso: 1 };
  const desde = actual?.umbralCreditos ?? 0;
  const tramo = siguiente.umbralCreditos - desde;
  return {
    actual,
    siguiente,
    faltan: Math.max(0, siguiente.umbralCreditos - totalGanado),
    progreso: tramo > 0 ? Math.min(1, Math.max(0, (totalGanado - desde) / tramo)) : 0,
  };
}

/**
 * Cuántas alumnas BAJARÍAN con la escala nueva. Baja quien tiene algo ganado y:
 *   · su nivel de ahora desaparece o se desactiva, o
 *   · su nivel nuevo queda por debajo de su nivel de ahora en la escala nueva.
 * Renombrar, recolorear, bajar umbrales o añadir niveles que nadie alcanza no
 * baja a nadie. Una alumna con 0 ganado no tiene nada concedido: no cuenta.
 */
export function quienBajaria(
  totales: readonly number[], antes: readonly NivelComparable[], despues: readonly NivelComparable[],
): number {
  let n = 0;
  for (const c of bajadasPorNivel(totales, antes, despues).values()) n += c;
  return n;
}

/** Lo mismo, por el nivel de AHORA de quien bajaría (id → cuántas), para decir qué nivel lo provoca. */
export function bajadasPorNivel(
  totales: readonly number[], antes: readonly NivelComparable[], despues: readonly NivelComparable[],
): Map<string, number> {
  const a = escala(antes);
  const d = escala(despues);
  const posNueva = new Map(d.map((n, i) => [n.id, i]));
  const out = new Map<string, number>();
  for (const t of totales) {
    if (!(t > 0)) continue;
    const previo = nivelDeTotal(t, a);
    if (!previo) continue;
    const pPrevio = posNueva.get(previo.id);
    const nuevo = nivelDeTotal(t, d);
    const pNuevo = nuevo ? posNueva.get(nuevo.id) ?? -1 : -1;
    if (pPrevio === undefined || pNuevo < pPrevio) out.set(previo.id, (out.get(previo.id) ?? 0) + 1);
  }
  return out;
}

/** Cuántas alumnas quedan en cada nivel de la escala (ordenada) y cuántas en ninguno. */
export function repartoPorNivel(totales: readonly number[], niveles: readonly NivelComparable[]): { porNivel: Map<string, number>; sinNivel: number } {
  const d = escala(niveles);
  const porNivel = new Map(d.map((n) => [n.id, 0]));
  let sinNivel = 0;
  for (const t of totales) {
    const n = nivelDeTotal(t, d);
    if (n) porNivel.set(n.id, (porNivel.get(n.id) ?? 0) + 1);
    else sinNivel++;
  }
  return { porNivel, sinNivel };
}

// ── Lo que manda la pantalla al guardar ─────────────────────────────────────

export interface NivelGuardable {
  /** Ausente = nivel nuevo. */
  id?: string;
  nombre: string;
  umbralCreditos: number;
  color: string;
  icono: string;
  beneficios: string | null;
  activo: boolean;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
export const MAX_NIVELES = 15;

/** Valida lo que llega del navegador. `null` si algo no vale (con el motivo). */
export function validarNiveles(entrada: unknown): { ok: true; niveles: NivelGuardable[] } | { ok: false; error: string } {
  if (!Array.isArray(entrada)) return { ok: false, error: 'Faltan los niveles.' };
  if (entrada.length > MAX_NIVELES) return { ok: false, error: `Como mucho ${MAX_NIVELES} niveles.` };
  const out: NivelGuardable[] = [];
  const umbrales = new Set<number>();
  const ids = new Set<string>();
  const nombres = new Set<string>();
  for (const x of entrada as Record<string, unknown>[]) {
    const nombre = typeof x?.nombre === 'string' ? x.nombre.trim() : '';
    const umbral = x?.umbralCreditos;
    if (!nombre) return { ok: false, error: 'Cada nivel necesita un nombre.' };
    if (Array.from(nombre).length > 60) return { ok: false, error: `«${Array.from(nombre).slice(0, 20).join('')}…»: el nombre, como mucho 60 letras.` };
    if (typeof umbral !== 'number' || !Number.isInteger(umbral) || umbral < 0) {
      return { ok: false, error: `«${nombre}»: el umbral tiene que ser un número entero de 0 en adelante.` };
    }
    if (umbral > 1_000_000) return { ok: false, error: `«${nombre}»: el umbral, como mucho 1.000.000.` };
    if (x.activo !== false) {
      const clave = nombre.toLocaleLowerCase('es');
      if (nombres.has(clave)) return { ok: false, error: `Hay dos niveles activos que se llaman «${nombre}».` };
      nombres.add(clave);
    }
    if (x.activo !== false && umbrales.has(umbral)) return { ok: false, error: 'Dos niveles activos no pueden empezar en el mismo punto.' };
    if (x.activo !== false) umbrales.add(umbral);
    const id = typeof x?.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x.id) ? x.id : undefined;
    if (id && ids.has(id)) return { ok: false, error: 'Un nivel viene repetido. Recarga la página.' };
    if (id) ids.add(id);
    const beneficios = typeof x?.beneficios === 'string' ? x.beneficios.trim() : '';
    if (typeof x?.icono === 'string' && Array.from(x.icono.trim()).length > 8) return { ok: false, error: `«${nombre}»: el icono, como mucho 8 caracteres.` };
    // Por caracteres, no por unidades de código: cortar un emoji por la mitad lo rechazaría Postgres.
    if (Array.from(beneficios).length > 200) return { ok: false, error: `«${nombre}»: los beneficios, como mucho 200 letras.` };
    out.push({
      id,
      nombre,
      umbralCreditos: umbral,
      color: typeof x?.color === 'string' && COLOR.test(x.color) ? x.color : COLOR_NIVEL_NUEVO,
      icono: typeof x?.icono === 'string' && x.icono.trim() ? x.icono.trim() : '·',
      beneficios: beneficios || null,
      activo: x?.activo !== false,
    });
  }
  return { ok: true, niveles: out };
}

/** El color de un nivel nuevo (el estudio lo cambia luego si quiere): un neutro que se lee en claro y oscuro. */
export const COLOR_NIVEL_NUEVO = '#8B7355';

/** Cuánto de lo reciente se quedó sin lista para que valga la pena avisar (sin medir: un punto de partida). */
export const UMBRAL_AVISO_SIN_LISTA = 0.25;
