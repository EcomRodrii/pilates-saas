// ─────────────────────────────────────────────────────────────────────────────
// La bienvenida del alta nueva dentro del panel (PR-3 del plan del 21-oct-2026):
// la línea de siete pasos, en qué pantalla se está y adónde se va, quién la ve,
// y el paso 4 («¿Traes alumnas de otro sitio?»). Lo de «Tu estudio» vive en
// tu-estudio.ts.
//
// Los pasos 1 y 2 (registro y código) son de /crear-estudio; el 6 y el 7
// (primera clase y publicar) llegan con el PR-4. Mientras tanto, después del 5
// y con «Saltar a mi primera clase» se va al Calendario con «Nueva clase»
// abierto (`?nueva=1`, lo que ya existe): no se inventa una pantalla.
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import { OTRO_SOFTWARE, SIN_SOFTWARE } from '../onboarding/asistente-rapido.ts';

// ── La línea de pasos ────────────────────────────────────────────────────────

export interface PasoDeLaLinea { num: string; nombre: string; opcional: boolean }

/** Los siete de la maqueta, con su nombre corto. Arriba de cada pantalla: lo hecho en sólido, lo que queda en punteado. */
export const LINEA_DE_PASOS: readonly PasoDeLaLinea[] = [
  { num: '01', nombre: 'Cuenta', opcional: false },
  { num: '02', nombre: 'Código', opcional: false },
  { num: '03', nombre: 'Tu estudio', opcional: false },
  { num: '04', nombre: 'Tus datos', opcional: true },
  { num: '05', nombre: 'Tu marca', opcional: true },
  { num: '06', nombre: 'Primera clase', opcional: false },
  { num: '07', nombre: 'Publicar', opcional: true },
];

/** Las pantallas que viven aquí, en orden. «Tu estudio» son dos. */
export const PANTALLAS_ALTA = ['estudio', 'horario', 'importar', 'marca'] as const;
export type PantallaAlta = (typeof PANTALLAS_ALTA)[number];

/** El paso de la línea (1-7) en que está cada pantalla. */
export const PASO_DE_PANTALLA: Readonly<Record<PantallaAlta, number>> = { estudio: 3, horario: 3, importar: 4, marca: 5 };

export function siguientePantalla(p: PantallaAlta): PantallaAlta | null {
  return PANTALLAS_ALTA[PANTALLAS_ALTA.indexOf(p) + 1] ?? null;
}

export function anteriorPantalla(p: PantallaAlta): PantallaAlta | null {
  const i = PANTALLAS_ALTA.indexOf(p);
  return i > 0 ? PANTALLAS_ALTA[i - 1] : null;
}

/**
 * Reanudar: en qué pantalla se quedó, guardado en ESTE navegador (sin columna
 * nueva en `studios`, decisión C3 del plan). Lo escrito ya está en la base de
 * datos —cada pantalla guarda al pulsar «Siguiente»— y vuelve de ahí; esto solo
 * dice dónde seguir. Lo que no se entienda, a la primera.
 */
export const clavePantallaAlta = (studioId: string) => `tentare-alta-nueva:${studioId}`;

export function leerPantallaGuardada(crudo: string | null | undefined): PantallaAlta {
  try {
    const v = JSON.parse(crudo ?? 'null') as { pantalla?: unknown } | null;
    const p = v?.pantalla;
    return typeof p === 'string' && (PANTALLAS_ALTA as readonly string[]).includes(p) ? (p as PantallaAlta) : 'estudio';
  } catch {
    return 'estudio';
  }
}

export function pantallaParaGuardar(p: PantallaAlta): string {
  return JSON.stringify({ pantalla: p });
}

/** Mientras llegan los pasos 6 y 7 (PR-4): el Calendario, con «Nueva clase» abierto para hoy. */
export const DESTINO_PRIMERA_CLASE = '/calendario?nueva=1';

// ── Quién la ve ──────────────────────────────────────────────────────────────

/** `altas_estudio.version` de quien se registró con el alta nueva (la de prueba incluida). */
export const VERSIONES_ALTA_NUEVA = ['v2', 'v2_prueba'] as const;

/**
 * ¿Nació este estudio del alta nueva? Su registro ya no le preguntó lo que la
 * bienvenida de siempre da por hecho, así que ve la nueva aunque `ALTA_NUEVA`
 * esté apagado. Una sede de cadena NO: la crea `/api/cadena/sedes` después,
 * desde el panel de una dueña que ya pasó por su alta, y sigue con la
 * bienvenida de siempre salvo que `ALTA_NUEVA` la encienda.
 */
export function nacioConAltaNueva(version: string | null | undefined, cadenaId: string | null | undefined): boolean {
  return !cadenaId && !!version && (VERSIONES_ALTA_NUEVA as readonly string[]).includes(version);
}

/**
 * Las pantallas del panel a las que se puede ir sin salir del alta: las tres
 * formas de traer datos que ya existen. Se pintan en un marco con la vuelta al
 * alta (components/alta-nueva/marco-ruta-alta.tsx); cualquier otra ruta sigue
 * enseñando la bienvenida hasta que se termina o se sale con «Prefiero ir a mi
 * panel».
 */
export const RUTAS_DEL_ALTA = ['/migracion', '/clientas/importar', '/calendario/importar'] as const;

export function esRutaDelAlta(pathname: string | null | undefined): boolean {
  const p = (pathname ?? '').replace(/\/+$/, '');
  return RUTAS_DEL_ALTA.some(r => p === r || p.startsWith(`${r}/`));
}

// ── Paso 4: «¿Con qué lo llevas ahora?» ─────────────────────────────────────

export type Origen = 'programa' | 'hoja' | 'papel' | 'cero';

export const ORIGENES: readonly { id: Origen; etiqueta: string }[] = [
  { id: 'programa', etiqueta: 'Otro programa' },
  { id: 'hoja', etiqueta: 'Excel o Google Sheets' },
  { id: 'papel', etiqueta: 'Papel o libreta' },
  { id: 'cero', etiqueta: 'Empiezo de cero' },
];

/**
 * Los programas que se le ofrecen. `valor` es lo que se guarda en
 * `onb_software_anterior`, con la misma grafía que el asistente de siempre
 * (`OPCIONES_SOFTWARE`): /interno los cuenta juntos.
 */
export const PROGRAMAS: readonly { valor: string; etiqueta: string }[] = [
  { valor: 'Momence', etiqueta: 'Momence' },
  { valor: 'TIMP', etiqueta: 'TIMP' },
  { valor: 'Eversports', etiqueta: 'Eversports' },
  { valor: 'Bsport', etiqueta: 'bsport' },
  { valor: 'Mindbody', etiqueta: 'Mindbody' },
  { valor: 'Glofox', etiqueta: 'Glofox' },
  { valor: OTRO_SOFTWARE, etiqueta: 'Otro' },
];

/**
 * Los únicos que se dicen RECONOCIDOS: los que tienen un export con sus
 * columnas reales que el clasificador de la Migración Mágica lee solo, sin IA
 * (ejemplos de Momence y Eversports en lib/migracion/ejemplos.ts, Mindbody en
 * mindbody-saldos.test.ts; lo comprueba tu-estudio.test.ts). TIMP solo tiene un
 * ejemplo «con las convenciones del sector» (no publica sus cabeceras), y bsport
 * y Glofox ninguno: decir que se reconocen sería prometer.
 */
export const PROGRAMAS_RECONOCIDOS = ['Momence', 'Eversports', 'Mindbody'] as const;

export const PAPEL = 'Papel o libreta';
export const HOJA = 'Excel o Google Sheets';

/** Lo que se guarda en `onb_software_anterior`. */
export function softwareAnteriorDe(origen: Origen, programa: string): string {
  if (origen === 'cero') return SIN_SOFTWARE;
  if (origen === 'hoja') return HOJA;
  if (origen === 'papel') return PAPEL;
  return PROGRAMAS.find(p => p.valor.toLowerCase() === programa.trim().toLowerCase())?.valor ?? OTRO_SOFTWARE;
}

/**
 * Al revés, para volver al paso con lo contestado (aquí o en la bienvenida de
 * siempre: «Bonsai» o «Lorari» no están en esta lista y salen como «Otro»).
 */
export function origenDeSoftware(valor: string | null | undefined): { origen: Origen; programa: string } | null {
  const v = (valor ?? '').trim();
  if (!v) return null;
  if (v === SIN_SOFTWARE) return { origen: 'cero', programa: PROGRAMAS[0].valor };
  if (v === HOJA) return { origen: 'hoja', programa: PROGRAMAS[0].valor };
  if (v === PAPEL) return { origen: 'papel', programa: PROGRAMAS[0].valor };
  const p = PROGRAMAS.find(x => x.valor.toLowerCase() === v.toLowerCase());
  return { origen: 'programa', programa: p?.valor ?? OTRO_SOFTWARE };
}

/** Las tres formas de traer datos que ya existen. */
export type Via = 'programa' | 'magia' | 'plantilla';

const VIA_DE_ORIGEN: Readonly<Record<Exclude<Origen, 'cero'>, Via>> = { programa: 'programa', hoja: 'magia', papel: 'plantilla' };

/** La que le toca por lo que contestó, o `null` si aún no ha contestado o empieza de cero. */
export function viaRecomendada(origen: Origen | null): Via | null {
  return origen && origen !== 'cero' ? VIA_DE_ORIGEN[origen] : null;
}

/** La suya primero; el resto, en el orden de siempre. */
export function ordenDeVias(origen: Origen | null): Via[] {
  const base: Via[] = ['programa', 'magia', 'plantilla'];
  const suya = viaRecomendada(origen);
  return suya ? [suya, ...base.filter(v => v !== suya)] : base;
}

/**
 * «Qué exportar de tu programa». Sin rutas de menú de cada programa (decisión D2
 * del fundador: no están verificadas, y cambian): lo que es verdad en todos.
 */
export function queExportar(programa: string): string {
  const reconocido = (PROGRAMAS_RECONOCIDOS as readonly string[]).includes(programa);
  const nombre = programa === OTRO_SOFTWARE ? 'tu programa' : PROGRAMAS.find(p => p.valor === programa)?.etiqueta ?? 'tu programa';
  return reconocido
    ? `Busca en ${nombre} la opción de exportar tus clientas a CSV o Excel (y, si la tiene, sus bonos y cuotas). Sus columnas las reconocemos solas.`
    : `Busca en ${nombre} la opción de exportar tus clientas a CSV o Excel. Si alguna columna no la reconocemos, eliges tú qué es cada una antes de importar nada.`;
}

/** «Momence, Eversports y Mindbody», para la frase de la tarjeta. */
export function listaReconocidos(): string {
  const l = [...PROGRAMAS_RECONOCIDOS];
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l.join('');
}
