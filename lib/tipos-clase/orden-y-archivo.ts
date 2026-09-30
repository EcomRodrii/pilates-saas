// Tipos de clase: en qué orden los ve la alumna, qué pantalla enseña los
// archivados y qué pasa al archivar uno.
//
// La REGLA («un tipo archivado no programa clases nuevas») vive en la base de
// datos, como trigger en `sesiones` (migr 20260930215125): hay demasiadas vías
// que crean clases para confiarla a los selectores. Esto es lo que decide qué
// ve cada pantalla, en un solo sitio, para que no diverjan:
//
//   · Para PROGRAMAR (Nueva clase, clase fija, editar una clase, la app de la
//     instructora): solo activos — `tiposParaProgramar`. Al editar una clase ya
//     programada, también el tipo que ya tiene.
//   · Lo que ve la ALUMNA y lo que se CONFIGURA sobre ella (chips del horario,
//     «Así lo vive tu alumna», las reglas por tipo): los activos y los
//     archivados a los que aún les quedan clases — `tiposConVida`. Esas clases
//     siguen en pie y se pueden reservar; esconder su tipo las dejaría sin
//     filtro ni reglas a la vista.
//   · Informes, fichas, exportación, historial: TODOS, sin filtrar. Archivar no
//     reescribe el pasado.

import { fechaCortaEstudio } from '../utils.ts';

/** Lo mínimo de un tipo de clase que hace falta aquí. */
export interface TipoArchivable {
  id: string;
  nombre: string;
  /** `null`/ausente = activo. Con fecha, archivado. */
  archivadoEn?: string | null;
}

export function estaArchivado(t: { archivadoEn?: string | null } | null | undefined): boolean {
  return !!t?.archivadoEn;
}

/** Los que no están archivados: el catálogo que el estudio ofrece hoy. */
export function tiposActivos<T extends TipoArchivable>(tipos: readonly T[]): T[] {
  return tipos.filter(t => !estaArchivado(t));
}

/**
 * Los tipos con los que se puede programar una clase: los activos. Con
 * `actualId` (editar una clase ya programada, o el punto de partida de un
 * duplicado), también ese aunque esté archivado, para que el selector no
 * enseñe otro tipo distinto del que la clase tiene de verdad.
 */
export function tiposParaProgramar<T extends TipoArchivable>(tipos: readonly T[], actualId?: string | null): T[] {
  return tipos.filter(t => !estaArchivado(t) || (!!actualId && t.id === actualId));
}

type SesionMin = { tipoClaseId: string | null; inicio: string; cancelada?: boolean };

/**
 * Activos + archivados a los que aún les quedan clases por dar (no canceladas,
 * que no han empezado). Lo que la alumna todavía puede encontrarse.
 */
export function tiposConVida<T extends TipoArchivable>(
  tipos: readonly T[],
  sesiones: readonly SesionMin[],
  ahora: Date | number = Date.now(),
): T[] {
  const ms = typeof ahora === 'number' ? ahora : ahora.getTime();
  const conClases = new Set<string>();
  for (const s of sesiones) {
    if (s.tipoClaseId && !s.cancelada && Date.parse(s.inicio) > ms) conClases.add(s.tipoClaseId);
  }
  return tipos.filter(t => !estaArchivado(t) || conClases.has(t.id));
}

// ─── Qué pasa al archivar uno ────────────────────────────────────────────────

type SesionImpacto = SesionMin & { id: string; serieId?: string | null };
type ReservaImpacto = { sesionId: string; socioId: string; estado: string };
type PlanImpacto = { nombre: string; activo: boolean; tiposClaseIds?: readonly string[] | null };

export interface ImpactoArchivar {
  /** Clases suyas que aún no han empezado y no están canceladas. */
  clasesFuturas: number;
  /** Inicio (ISO) de la última de esas clases. */
  ultimaClase: string | null;
  /** Alumnas distintas con plaza (o esperando) en esas clases. */
  alumnas: number;
  /** Clases que se repiten con fechas por delante: dejan de renovarse. */
  series: number;
  /** Planes a la venta que, sin este tipo, no sirven para ningún otro activo. */
  planesSoloDeEste: string[];
}

// Quien tiene sitio o lo está esperando: todas se quedan con su clase, pero a
// todas les afecta que sea la última de su tipo.
const ESTADOS_APUNTADA = new Set(['CONFIRMADA', 'PENDIENTE_APROBACION', 'LISTA_ESPERA']);

/**
 * Lo que la propietaria tiene que saber ANTES de archivar, contado con lo que
 * el panel tiene cargado (todas las clases y reservas del estudio).
 */
export function impactoDeArchivar(p: {
  tipoId: string;
  tipos: readonly TipoArchivable[];
  sesiones: readonly SesionImpacto[];
  reservas: readonly ReservaImpacto[];
  planes: readonly PlanImpacto[];
  ahora?: Date | number;
}): ImpactoArchivar {
  const ms = typeof p.ahora === 'number' ? p.ahora : (p.ahora ?? new Date()).getTime();
  const futuras = p.sesiones.filter(s => s.tipoClaseId === p.tipoId && !s.cancelada && Date.parse(s.inicio) > ms);
  const ids = new Set(futuras.map(s => s.id));
  const alumnas = new Set(p.reservas.filter(r => ids.has(r.sesionId) && ESTADOS_APUNTADA.has(r.estado)).map(r => r.socioId));
  const ultimaClase = futuras.reduce<string | null>((max, s) => (max === null || Date.parse(s.inicio) > Date.parse(max) ? s.inicio : max), null);
  const series = new Set(futuras.map(s => s.serieId).filter((x): x is string => !!x));

  // Un plan con clases marcadas que, quitando este, ya no cubre ningún tipo
  // activo. Un plan «para todas» (sin marcar) sigue sirviendo para el resto.
  const activos = new Set(p.tipos.filter(t => !estaArchivado(t) && t.id !== p.tipoId).map(t => t.id));
  const planesSoloDeEste = p.planes
    .filter(pl => pl.activo && (pl.tiposClaseIds?.length ?? 0) > 0 && pl.tiposClaseIds!.includes(p.tipoId)
      && !pl.tiposClaseIds!.some(id => activos.has(id)))
    .map(pl => pl.nombre);

  return { clasesFuturas: futuras.length, ultimaClase, alumnas: alumnas.size, series: series.size, planesSoloDeEste };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function enumerar(nombres: readonly string[]): string {
  const citados = nombres.map(n => `«${n}»`);
  if (citados.length <= 1) return citados.join('');
  if (citados.length > 3) return `${citados.slice(0, 3).join(', ')} y ${citados.length - 3} más`;
  return `${citados.slice(0, -1).join(', ')} y ${citados[citados.length - 1]}`;
}

/**
 * Lo que dice el diálogo de archivar, frase a frase. Solo cifras que el panel
 * sabe de verdad, y en el orden en que le importan: lo que se queda, lo que
 * deja de pasar, y lo que conviene revisar después.
 */
export function frasesImpactoArchivar(i: ImpactoArchivar): string[] {
  const frases: string[] = [];
  if (i.clasesFuturas === 0) {
    frases.push('No tiene clases programadas.');
  } else {
    const ultima = i.ultimaClase ? `, ${i.clasesFuturas === 1 ? 'el' : 'la última el'} ${fechaCortaEstudio(i.ultimaClase)}` : '';
    const quien = i.alumnas === 0 ? 'sin alumnas apuntadas todavía' : `con ${plural(i.alumnas, 'alumna apuntada', 'alumnas apuntadas')}`;
    frases.push(`Tiene ${plural(i.clasesFuturas, 'clase programada', 'clases programadas')}${ultima}, ${quien}. Se quedan como están y se pueden seguir reservando.`);
  }
  if (i.series > 0) {
    frases.push(i.series === 1
      ? 'Su clase que se repite deja de renovarse: termina con la última fecha que ya tiene.'
      : `Sus ${i.series} clases que se repiten dejan de renovarse: terminan con las fechas que ya tienen.`);
  }
  if (i.planesSoloDeEste.length > 0) {
    frases.push(i.planesSoloDeEste.length === 1
      ? `${enumerar(i.planesSoloDeEste)} solo sirve para este tipo: cuando pasen sus clases no servirá para reservar ninguna. Si ya no lo vas a vender, desactívalo en Paquetes.`
      : `${enumerar(i.planesSoloDeEste)} solo sirven para este tipo: cuando pasen sus clases no servirán para reservar ninguna. Si ya no los vas a vender, desactívalos en Paquetes.`);
  }
  return frases;
}

// ─── El orden ────────────────────────────────────────────────────────────────
//
// `tipos_clase.orden` (migr 20260930215125): lo decide el estudio arrastrando
// en Configuración. NULL es «sin colocar» — un tipo nuevo, duplicado, del
// catálogo de la cadena… — y va detrás, por nombre.
//
// ⚠️ Mientras el estudio no haya colocado NINGUNO, no se reordena nada: cada
// pantalla sigue enseñándolos como hasta ahora (el catálogo público, en el
// orden en que llegan de la base de datos; Configuración, por nombre). Sin
// backfill y sin cambios que nadie ha pedido: el orden nuevo aparece con el
// primer arrastre, que coloca a todos a la vez (`cambiosDeOrden`).

export interface TipoOrdenable {
  id: string;
  nombre: string;
  orden?: number | null;
}

/** ¿Ha colocado el estudio alguno? Hasta entonces, nada se reordena. */
export function hayOrdenGuardado(tipos: readonly { orden?: number | null }[]): boolean {
  return tipos.some(t => t.orden != null);
}

/**
 * El orden en que la alumna ve los tipos: el guardado (menor primero) y detrás
 * los «sin colocar», por nombre. A igual `orden` (un tipo recuperado que
 * conservaba el suyo), también por nombre: nunca depende de cómo llegaron.
 * Sin ninguno colocado, los devuelve como llegan (ver arriba).
 */
export function ordenarTipos<T extends TipoOrdenable>(tipos: readonly T[]): T[] {
  if (!hayOrdenGuardado(tipos)) return [...tipos];
  return [...tipos].sort((a, b) => {
    const oa = a.orden ?? null;
    const ob = b.orden ?? null;
    if (oa !== ob) {
      if (oa === null) return 1;
      if (ob === null) return -1;
      return oa - ob;
    }
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

/**
 * Lo que hay que escribir para que los tipos queden como `idsEnOrden`:
 * posiciones 0, 1, 2… y SOLO los que cambian (un PATCH por fila). La primera
 * vez que se ordena, con todos «sin colocar», se colocan todos: si se guardara
 * solo el que se movió, al releer se mezclaría con los NULL por nombre.
 */
export function cambiosDeOrden(
  tipos: readonly TipoOrdenable[],
  idsEnOrden: readonly string[],
): { id: string; orden: number }[] {
  const actual = new Map(tipos.map(t => [t.id, t.orden ?? null]));
  const cambios: { id: string; orden: number }[] = [];
  idsEnOrden.forEach((id, i) => {
    if (actual.has(id) && actual.get(id) !== i) cambios.push({ id, orden: i });
  });
  return cambios;
}
