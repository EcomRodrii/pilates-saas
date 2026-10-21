// ─────────────────────────────────────────────────────────────────────────────
// La bienvenida del alta nueva dentro del panel (PR-3 del plan del 21-oct-2026):
// la línea de pasos, en qué pantalla se está y adónde se va, quién la ve, y el
// paso 4 («¿Traes alumnas de otro sitio?»). Lo de «Tu estudio» vive en
// tu-estudio.ts.
//
// Los pasos 1 y 2 (registro y código) son de /crear-estudio. El alta ACABA en el
// 5, «Tu marca» (fundador, 21-oct-2026: «lo de crear la clase durante el
// onboarding, descartado»). Detrás va «Tus primeros pasos», la introducción breve
// de lo que viene, y de ahí al panel: la primera clase se crea allí
// (`ENTRADA_PRIMERA_CLASE`, «Tu primera clase» sobre el Calendario) y el resto lo
// lleva «Pon en marcha tu estudio» del Resumen (TAREAS_ALTA_NUEVA,
// lib/guia/primeros-pasos.ts), tarea a tarea y con «Omitir».
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import { OTRO_SOFTWARE, SIN_SOFTWARE } from '../onboarding/asistente-rapido.ts';

// ── La línea de pasos ────────────────────────────────────────────────────────

export interface PasoDeLaLinea { num: string; nombre: string; opcional: boolean }

/**
 * Los cinco del alta, con su nombre corto. Arriba de cada pantalla: lo hecho en
 * sólido, lo que queda en punteado. La maqueta tenía siete: «Primera clase» y
 * «Publicar» salieron del alta (fundador, 21-oct) y son ahora las dos primeras
 * tareas de «Pon en marcha tu estudio». La misma lista la pinta /crear-estudio.
 */
export const LINEA_DE_PASOS: readonly PasoDeLaLinea[] = [
  { num: '01', nombre: 'Cuenta', opcional: false },
  { num: '02', nombre: 'Código', opcional: false },
  { num: '03', nombre: 'Tu estudio', opcional: false },
  { num: '04', nombre: 'Tus datos', opcional: true },
  { num: '05', nombre: 'Tu marca', opcional: true },
];

/**
 * Las pantallas que viven aquí, en orden. «Tu estudio» son dos; `pasos` es «Tus
 * primeros pasos», la introducción breve de lo que viene en el panel, la última:
 * con el alta ya hecha (la línea, entera).
 */
export const PANTALLAS_ALTA = ['estudio', 'horario', 'importar', 'marca', 'pasos'] as const;
export type PantallaAlta = (typeof PANTALLAS_ALTA)[number];

/** El paso de la línea en que está cada pantalla. «Tus primeros pasos», ya después del último. */
export const PASO_DE_PANTALLA: Readonly<Record<PantallaAlta, number>> = {
  estudio: 3, horario: 3, importar: 4, marca: 5, pasos: 6,
};

/**
 * Lo guardado por las pantallas que ya no están en el alta («Tu primera clase» y
 * «¡Listo!», hasta el 21-oct): quien se quedó en ellas sigue por «Tus primeros
 * pasos», que la lleva a la misma clase en el panel.
 */
const PANTALLAS_RETIRADAS = ['clase', 'publicada'];

/**
 * Lo que dice «Tus primeros pasos»: las tareas que vienen, en el orden y con los
 * nombres de «Pon en marcha tu estudio» (`TAREAS_ALTA_NUEVA`, sin «Crea tu cuenta»,
 * que ya está hecha). Nada que no exista: la primera clase se abre al pulsar
 * «Empezar», y las demás las ofrece la lista del Resumen al terminar cada una.
 */
export const PRIMEROS_PASOS_DEL_ALTA: readonly { titulo: string; que: string; cuanto: string }[] = [
  {
    titulo: 'Crea tu primera clase',
    que: 'Qué clase es, cuándo, quién la da, en qué sala y cuántas caben, y su precio. En un solo formulario, y se crea todo a la vez.',
    cuanto: '≈ 5 min',
  },
  {
    titulo: 'Comparte tu enlace de reservas',
    que: 'Por WhatsApp, en Instagram o con el QR en recepción. Con eso ya te pueden reservar.',
    cuanto: '≈ 2 min',
  },
  {
    titulo: 'Trae a tus alumnas',
    que: 'Impórtalas de tu programa o de tu Excel, o añádelas una a una.',
    cuanto: '≈ 3 min',
  },
  {
    titulo: 'Recibe tu primera reserva',
    que: 'Se marca sola cuando alguien reserve desde tu página.',
    cuanto: 'sola',
  },
];

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
    const p = (JSON.parse(crudo ?? 'null') as { pantalla?: unknown } | null)?.pantalla;
    if (typeof p !== 'string') return 'estudio';
    if ((PANTALLAS_ALTA as readonly string[]).includes(p)) return p as PantallaAlta;
    return PANTALLAS_RETIRADAS.includes(p) ? 'pasos' : 'estudio';
  } catch {
    return 'estudio';
  }
}

export function pantallaParaGuardar(p: PantallaAlta): string {
  return JSON.stringify({ pantalla: p });
}

/**
 * «Tu primera clase», sobre el Calendario: la abren «Empezar» de «Tus primeros
 * pasos», la tarea «Crea tu primera clase» y el correo «Tu cuenta está activa».
 * Con la bienvenida sin terminar (el correo llega antes), la bienvenida sigue
 * donde estaba: la clase va después del alta.
 */
export const ENTRADA_PRIMERA_CLASE = '/calendario?primera=1';

/** ¿Pide esta dirección «Tu primera clase»? (`?primera=1`) */
export function pidePrimeraClase(search: string | null | undefined): boolean {
  return new URLSearchParams(search ?? '').get('primera') === '1';
}

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
