import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, hidratarTiposDePlanes, mapPlanTarifa, mapPlazaFija, mapSesion, mapSuscripcion } from '@/lib/supabase-data';
import { construirHorario, type TarjetaHorario } from '@/lib/horario-fijo';
import { hoyEnEstudio, uid } from '@/lib/utils';
import { fechaDMY } from '@/lib/series-renovacion';
import { HORIZONTE_MATERIALIZAR_DIAS } from '@/lib/plazas-fijas-slot';
import { cuotaParaPlazaFija, superaLimiteSemanal } from '@/lib/plazas-fijas-reglas';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { mapLimit } from '@/lib/concurrency';
import { conCacheCatalogo } from '@/lib/cache/catalogo-estudio';
import {
  cupoDeFranja, estadoOferta, franjasYaCubiertas,
  nuevaVigenciaAmpliar, plazasLibresDeClaseFija, plazasVencidasQueEstorban, programadaHasta, resolverFranjas, textoFranja,
  type CatalogoClasesFijas, type EstadoOferta, type FranjaResuelta, type FranjaSuelta,
} from '@/lib/clases-fijas-reglas';
import { TEXTOS_PLAZA_FIJA_ALUMNA, validarPlazaFijaDesdeSesion } from '@/lib/db/supabase-data-admin';
import type { RowPlazasFijas, RowSesiones } from '@/lib/db-types';

// Clases fijas del estudio. Hoy sirve el catálogo de las clases que se repiten (lo que la
// alumna puede hacer su clase fija, una a una, desde la ficha de la clase).
//
// ⚠️ Las clases fijas con nombre (OFERTAS, migr clases_fijas_del_estudio) se retiraron el
// 4-oct-2026: ni se crean, ni se ofrecen, ni se piden. Lo que queda de ellas aquí es solo
// lo que necesita una petición que ya estuviera pendiente para aprobarse o ampliarse desde
// la bandeja, y el nombre para el aviso de fin de las plazas que dieron.
//
// ⚠️ Service-role: las tablas no tienen políticas RLS y todo pasa por aquí. Las
// rutas comprueban el rol y sacan el estudio de la sesión (staff) o de un JWT
// verificado (alumna); nada de lo que llega en el body decide de quién es un dato.
//
// «Una plaza es de quien la tiene»: las reglas de FONDO —cuota que la cubra,
// autorización del tipo de clase, duplicada, sitio— son las de dar una plaza fija
// desde el panel (`validarPlazaFijaDesdeSesion`), una sola copia. Aquí solo se
// repiten por cada franja y se suman.

export interface OfertaDef {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  duracionesMeses: number[];
  plazas: number | null;
  /** Sin pasar por la bandeja: se resuelve al pedirla si cabe y su cuota no lo impide. */
  aprobacionAutomatica: boolean;
  franjas: { id: string; serieId: string; diaSemana: number }[];
}

type FilaOferta = {
  id: string; nombre: string; descripcion: string | null; activa: boolean; duraciones_meses: number[]; plazas: number | null;
  aprobacion_automatica: boolean;
};
type FilaFranja = { id: string; clase_fija_id: string; serie_id: string; dia_semana: number };

/** Las ofertas del estudio (las activas, o todas) con sus franjas definidas. */
export async function cargarOfertas(
  admin: SupabaseClient, studioId: string, opts: { soloActivas?: boolean; ids?: string[] } = {},
): Promise<OfertaDef[]> {
  let q = admin.from('clases_fijas').select('id, nombre, descripcion, activa, duraciones_meses, plazas, aprobacion_automatica')
    .eq('studio_id', studioId).order('creada_en', { ascending: true }).order('id').limit(200);
  if (opts.soloActivas) q = q.eq('activa', true);
  if (opts.ids) q = q.in('id', opts.ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as FilaOferta[];
  if (filas.length === 0) return [];
  const { data: fr, error: errFr } = await admin.from('clases_fijas_franjas')
    .select('id, clase_fija_id, serie_id, dia_semana')
    .eq('studio_id', studioId).in('clase_fija_id', filas.map(f => f.id)).order('dia_semana').order('id');
  if (errFr) throw new Error(errFr.message);
  const franjas = (fr ?? []) as unknown as FilaFranja[];
  return filas.map(f => ({
    id: f.id, nombre: f.nombre, descripcion: f.descripcion, activa: f.activa,
    duracionesMeses: f.duraciones_meses, plazas: f.plazas, aprobacionAutomatica: f.aprobacion_automatica,
    franjas: franjas.filter(x => x.clase_fija_id === f.id).map(x => ({ id: x.id, serieId: x.serie_id, diaSemana: x.dia_semana })),
  }));
}

/** El horario vivo de las series que usan las ofertas: una tarjeta por serie y día (lo mismo que la vista «Horario»). */
async function tarjetasDeSeries(admin: SupabaseClient, studioId: string, serieIds: string[]): Promise<TarjetaHorario[]> {
  if (serieIds.length === 0) return [];
  const ahora = new Date();
  const [sesiones, plazas] = await Promise.all([
    fetchAllRows<RowSesiones>(studioId, 'sesiones', (from, to) => admin.from('sesiones')
      .select('*').eq('studio_id', studioId).in('serie_id', serieIds).gte('inicio', ahora.toISOString())
      .order('inicio').order('id').range(from, to)),
    fetchAllRows<RowPlazasFijas>(studioId, 'plazas_fijas', (from, to) => admin.from('plazas_fijas')
      .select('*').eq('studio_id', studioId).in('estado', ['ACTIVA', 'PAUSADA']).order('id').range(from, to)),
  ]);
  for (const r of [sesiones, plazas]) if (r.error) throw new Error(r.error.message);
  return construirHorario(sesiones.data.map(mapSesion), [], plazas.data.map(mapPlazaFija), ahora.getTime())
    .dias.flatMap(d => d.tarjetas);
}

/** El horario vivo de TODAS las series del estudio (no solo las de una oferta): una tarjeta por serie y día. */
async function tarjetasDeTodoElHorario(admin: SupabaseClient, studioId: string): Promise<TarjetaHorario[]> {
  const ahora = new Date();
  const [sesiones, plazas] = await Promise.all([
    fetchAllRows<RowSesiones>(studioId, 'sesiones', (from, to) => admin.from('sesiones')
      .select('*').eq('studio_id', studioId).not('serie_id', 'is', null).gte('inicio', ahora.toISOString())
      .order('inicio').order('id').range(from, to)),
    fetchAllRows<RowPlazasFijas>(studioId, 'plazas_fijas', (from, to) => admin.from('plazas_fijas')
      .select('*').eq('studio_id', studioId).in('estado', ['ACTIVA', 'PAUSADA']).order('id').range(from, to)),
  ]);
  for (const r of [sesiones, plazas]) if (r.error) throw new Error(r.error.message);
  return construirHorario(sesiones.data.map(mapSesion), [], plazas.data.map(mapPlazaFija), ahora.getTime())
    .dias.flatMap(d => d.tarjetas);
}

export interface OfertaResuelta extends OfertaDef {
  franjasResueltas: FranjaResuelta[];
  estado: EstadoOferta;
  plazasLibres: number | null;
  programadaHasta: string | null;
}

export async function resolverOfertas(admin: SupabaseClient, studioId: string, ofertas: OfertaDef[]): Promise<OfertaResuelta[]> {
  const series = [...new Set(ofertas.flatMap(o => o.franjas.map(f => f.serieId)))];
  const tarjetas = await tarjetasDeSeries(admin, studioId, series);
  return ofertas.map(o => {
    const franjasResueltas = resolverFranjas(o.franjas, tarjetas);
    return {
      ...o, franjasResueltas,
      estado: estadoOferta({ activa: o.activa, franjasDefinidas: o.franjas.length, franjas: franjasResueltas, tope: o.plazas }),
      plazasLibres: plazasLibresDeClaseFija(franjasResueltas, o.plazas),
      programadaHasta: programadaHasta(franjasResueltas),
    };
  });
}

// ─── Lo que ve la alumna ──────────────────────────────────────────────────────

type FranjaConIds = Pick<FranjaResuelta, 'tipoClaseId' | 'salaId' | 'instructorId'>;

async function nombresDe(admin: SupabaseClient, studioId: string, franjas: FranjaConIds[]) {
  const ids = (col: (f: FranjaConIds) => string | null) => [...new Set(franjas.map(col).filter((x): x is string => !!x))];
  const pide = (tabla: string, lista: string[], cols: string) => lista.length
    ? admin.from(tabla).select(cols).eq('studio_id', studioId).in('id', lista)
    : Promise.resolve({ data: [] as unknown[], error: null });
  const [tipos, salas, instrs] = await Promise.all([
    pide('tipos_clase', ids(f => f.tipoClaseId), 'id, nombre, logo_url, color, archivado_en'),
    pide('salas', ids(f => f.salaId), 'id, nombre'),
    pide('instructores', ids(f => f.instructorId), 'id, nombre'),
  ]);
  for (const r of [tipos, salas, instrs]) if (r.error) throw new Error(r.error.message);
  const mapa = (d: unknown[]) => new Map((d as { id: string; nombre: string }[]).map(x => [x.id, x.nombre]));
  const filasTipos = (tipos.data ?? []) as { id: string; logo_url: string | null; color: string | null; archivado_en: string | null }[];
  const logos = new Map(filasTipos.map(x => [x.id, x.logo_url]));
  const colores = new Map(filasTipos.map(x => [x.id, x.color]));
  const archivados = new Set(filasTipos.filter(x => x.archivado_en).map(x => x.id));
  return { tipos: mapa(tipos.data ?? []), salas: mapa(salas.data ?? []), instructores: mapa(instrs.data ?? []), logos, colores, archivados };
}

/**
 * Las clases que la alumna puede hacer suyas cada semana: TODAS las que se
 * repiten en el horario, una a una. Es lo mismo para cualquier visitante.
 *
 * ⚠️ Sin clases fijas con nombre (retiradas el 4-oct-2026, decisión del
 * fundador tras las quejas del único estudio de pago: «clase fija» significaba
 * tres cosas y había cuatro caminos para pedir lo mismo). Las ofertas que
 * existían siguen en la base de datos y las plazas que dieron funcionan igual,
 * pero ya no se ofrecen: sus clases salen aquí como cualquier otra, y `ofertas`
 * y `pedidas` van vacíos para los clientes que aún los lean.
 *
 * `puedePedirPlazaFija` (el ajuste del estudio, `plaza_fija_solicitar_desde_app`)
 * gobierna si se ofrece: sin él no se calcula nada.
 */
export async function catalogoClasesFijas(
  admin: SupabaseClient, studioId: string, _socioId: string | null, puedePedirPlazaFija: boolean,
): Promise<CatalogoClasesFijas> {
  // Lo que ve cualquier visitante (sin PII) va en la caché corta de catálogos.
  const sueltas = puedePedirPlazaFija
    ? await conCacheCatalogo(claveSueltasClasesFijas(studioId), () => franjasSueltas(admin, studioId), TTL_CLASES_FIJAS_MS)
    : [];
  return { ofertas: [], sueltas, pedidas: [] };
}

const TTL_CLASES_FIJAS_MS = 15_000;
const claveSueltasClasesFijas = (studioId: string) => `clases-fijas-sueltas:${studioId}`;

/** Las clases que ya se repiten, una por franja (serie y día de la semana). */
async function franjasSueltas(admin: SupabaseClient, studioId: string): Promise<FranjaSuelta[]> {
  const sueltas = await tarjetasDeTodoElHorario(admin, studioId);
  if (sueltas.length === 0) return [];
  const nombres = await nombresDe(admin, studioId, sueltas);
  // Una clase de un tipo archivado no se ofrece como plaza fija: su serie ya no
  // se renueva (lib/series/avisos-cron.ts), así que la plaza se quedaría sin
  // clases en cuanto pasen las que tiene.
  return sueltas.filter(t => !nombres.archivados.has(t.tipoClaseId)).map((t): FranjaSuelta => ({
    serieId: t.serieId, diaSemana: t.diaSemana, hora: t.hora, tipoClaseId: t.tipoClaseId, salaId: t.salaId, instructorId: t.instructorId,
    tipo: nombres.tipos.get(t.tipoClaseId) ?? 'Clase',
    sala: nombres.salas.get(t.salaId) ?? '',
    instructora: t.instructorId ? nombres.instructores.get(t.instructorId) ?? null : null,
    logoUrl: nombres.logos.get(t.tipoClaseId) ?? null,
    color: nombres.colores.get(t.tipoClaseId) ?? null,
    proximaSesionId: t.proximaSesionId, ultimaFecha: t.ultimaFecha,
  })).sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7) || a.hora.localeCompare(b.hora));
}

// ─── Pedirla ──────────────────────────────────────────────────────────────────

/** Lo que hay que comprobar y guardar por cada franja que la alumna aún no tiene. */
interface FranjaAValidar { franja: FranjaResuelta; v: Extract<Awaited<ReturnType<typeof validarPlazaFijaDesdeSesion>>, { ok: true }> }

/**
 * Las comprobaciones de dar la clase fija entera, sin escribir nada: las comparten
 * pedirla (la alumna) y aprobarla (el estudio, que vuelve a pasar todas las reglas
 * EN ESE MOMENTO y no en el de pedirla).
 *
 * Las franjas que la alumna ya tiene no se vuelven a dar: pedir una oferta de la que
 * ya cubre una parte solo añade lo que le falta.
 */
async function comprobarClaseFija(
  admin: SupabaseClient,
  p: { studioId: string; socioId: string; oferta: OfertaResuelta; hasta: string; hoy: string },
): Promise<
  | { ok: true; nuevas: FranjaAValidar[]; exceso: { limite: number } | null }
  | { error: string; status: number }
> {
  const { oferta } = p;
  if (oferta.estado === 'SIN_CLASES') return { error: 'Ahora no hay clases programadas en el horario de esta clase fija.', status: 409 };

  const { data: suyasRows, error: errSuyas } = await admin.from('plazas_fijas').select('*')
    .eq('studio_id', p.studioId).eq('socio_id', p.socioId).in('estado', ['ACTIVA', 'PAUSADA']);
  if (errSuyas) throw new Error(errSuyas.message);
  const cubiertas = new Set(franjasYaCubiertas(oferta.franjasResueltas, (suyasRows ?? []).map(r => mapPlazaFija(r as RowPlazasFijas)), p.hoy));
  const pendientes = oferta.franjasResueltas.filter(f => !cubiertas.has(f));
  if (pendientes.length === 0) return { error: 'Ya tienes esta clase fija.', status: 409 };

  const varias = oferta.franjasResueltas.length > 1;
  const validadas: FranjaAValidar[] = [];
  for (const franja of pendientes) {
    const v = await validarPlazaFijaDesdeSesion(admin, {
      studioId: p.studioId, socioId: p.socioId,
      datos: { sesionId: franja.proximaSesionId, spotId: null, vigenciaDesde: p.hoy, vigenciaHasta: p.hasta },
    }, TEXTOS_PLAZA_FIJA_ALUMNA, { ignorarVencidas: true });
    if (!v.ok) {
      // Con varias franjas, el error tiene que decir de cuál habla.
      const error = varias ? `${textoFranja(franja.diaSemana, franja.hora)}: ${v.error}` : v.error;
      return { error, status: v.error === 'Clase no encontrada' ? 409 : 400 };
    }
    validadas.push({ franja, v });
  }
  // El límite semanal se cuenta con TODAS las plazas nuevas a la vez: cada franja
  // por separado cabría, y las tres juntas no.
  const primera = validadas[0].v;
  const exceso = superaLimiteSemanal(primera.cuota, primera.activas + validadas.length - 1);
  return { ok: true, nuevas: validadas, exceso };
}

async function ofertaResuelta(admin: SupabaseClient, studioId: string, id: string): Promise<OfertaResuelta | null> {
  const [def] = await cargarOfertas(admin, studioId, { ids: [id] });
  return def ? (await resolverOfertas(admin, studioId, [def]))[0] : null;
}

// ─── Aprobarla ────────────────────────────────────────────────────────────────

export interface PlazaClaseFijaNueva {
  id: string; studio_id: string; socio_id: string; dia_semana: number; hora_inicio: string; sala_id: string;
  tipo_clase_id: string | null; spot_id: null; vigencia_desde: string; vigencia_hasta: string; estado: 'ACTIVA';
  clase_fija_id: string;
  /** Cuántas caben en esa franja (`cupoDeFranja`: el tope de la oferta, nunca más que el aforo). El tope duro lo comprueba contra esto. */
  cupo: number;
}

export type PreparacionAprobacion =
  | { ok: true; nombre: string; hasta: string; filas: PlazaClaseFijaNueva[]; exceso: { limite: number } | null }
  | { error: string; status: number; codigo?: 'SUPERA_LIMITE' };

/**
 * Vuelve a pasar TODAS las reglas al decidir y devuelve las plazas que se van a dar,
 * sin escribir. Quien llama reclama antes la petición (compare-and-set) y después
 * escribe con `darPlazasDeClaseFija`.
 */
export async function prepararAprobacionClaseFija(
  admin: SupabaseClient,
  p: { studioId: string; socioId: string; claseFijaId: string | null; vigenciaHasta: string | null; confirmarLimite: boolean },
): Promise<PreparacionAprobacion> {
  if (!p.claseFijaId || !p.vigenciaHasta) return { error: 'La petición no tiene clase fija: recházala.', status: 409 };
  const oferta = await ofertaResuelta(admin, p.studioId, p.claseFijaId);
  if (!oferta) return { error: 'Esa clase fija ya no existe: rechaza la petición.', status: 409 };
  const hoy = hoyEnEstudio();
  if (p.vigenciaHasta < hoy) return { error: 'La duración que pidió ya ha pasado: recházala para que la pida otra vez.', status: 409 };

  const c = await comprobarClaseFija(admin, { studioId: p.studioId, socioId: p.socioId, oferta, hasta: p.vigenciaHasta, hoy });
  if ('error' in c) return c;
  if (c.exceso && !p.confirmarLimite) {
    return {
      error: `Su cuota es de ${c.exceso.limite} ${c.exceso.limite === 1 ? 'clase' : 'clases'} por semana y con esta clase fija pasaría.`,
      status: 409, codigo: 'SUPERA_LIMITE',
    };
  }
  return {
    ok: true, nombre: oferta.nombre, hasta: p.vigenciaHasta, exceso: c.exceso,
    filas: c.nuevas.map(({ franja, v }): PlazaClaseFijaNueva => ({
      id: `pf-${uid()}`, studio_id: p.studioId, socio_id: p.socioId, dia_semana: v.dow, hora_inicio: v.horaInicio,
      sala_id: v.salaId, tipo_clase_id: v.tipoClaseId, spot_id: null, vigencia_desde: hoy, vigencia_hasta: p.vigenciaHasta as string,
      estado: 'ACTIVA', clase_fija_id: oferta.id, cupo: cupoDeFranja(franja, oferta.plazas),
    })),
  };
}

/**
 * Da las plazas: UN insert de todas las filas (una sentencia = una transacción, o
 * todas o ninguna) y después el motor de siempre las reserva. Si el insert falla no
 * queda ninguna; si el motor falla, las plazas están y el cron de esta noche las
 * recoge.
 */
export async function darPlazasDeClaseFija(
  admin: SupabaseClient, filas: PlazaClaseFijaNueva[],
): Promise<{ ok: true; plazaIds: string[]; creadas: number } | { error: string }> {
  // Volver a pedir una clase fija que venció es lo normal, y la plaza vencida sigue
  // ocupando su hueco (nadie la pasa a baja): el índice único de franja rechazaría la
  // nueva. Se aparta antes, solo en las franjas que se van a dar. Está muerta: el
  // motor no reserva más allá de su fecha, así que pasarla a baja no cancela nada.
  if (filas.length > 0) {
    const { data: suyas, error: errSuyas } = await admin.from('plazas_fijas')
      .select('id, dia_semana, hora_inicio, sala_id, estado, vigencia_hasta')
      .eq('studio_id', filas[0].studio_id).eq('socio_id', filas[0].socio_id).in('estado', ['ACTIVA', 'PAUSADA']);
    if (errSuyas) {
      capturarExcepcion(new Error(errSuyas.message), { tags: { area: 'clases-fijas' } });
      return { error: 'No se han podido guardar las plazas de la clase fija. Inténtalo de nuevo.' };
    }
    const vencidas = plazasVencidasQueEstorban(
      (suyas ?? []).map(r => ({
        id: r.id as string, diaSemana: r.dia_semana as number, horaInicio: r.hora_inicio as string, salaId: r.sala_id as string,
        tipoClaseId: null, estado: r.estado as string, vigenciaHasta: (r.vigencia_hasta as string | null) ?? null,
      })),
      filas.map(f => ({ diaSemana: f.dia_semana, horaInicio: f.hora_inicio, salaId: f.sala_id })),
      filas[0].vigencia_desde,
    );
    if (vencidas.length > 0) {
      const { error: errBaja } = await admin.from('plazas_fijas').update({ estado: 'BAJA' })
        .eq('studio_id', filas[0].studio_id).eq('socio_id', filas[0].socio_id).in('id', vencidas);
      if (errBaja) {
        capturarExcepcion(new Error(errBaja.message), { tags: { area: 'clases-fijas' } });
        return { error: 'No se han podido guardar las plazas de la clase fija. Inténtalo de nuevo.' };
      }
    }
  }
  // El tope duro: bajo un lock por oferta, recuenta la ocupación real de cada franja
  // y solo inserta si TODAS caben (todo o nada) — cierra la carrera que un `.insert`
  // directo desde aquí dejaba abierta entre dos aprobaciones de la MISMA oferta a la
  // vez (una manual y una automática, o dos peticiones distintas resueltas juntas).
  const { data, error } = await admin.rpc('dar_plazas_clase_fija', {
    p_studio_id: filas[0].studio_id, p_clase_fija_id: filas[0].clase_fija_id, p_filas: filas,
  });
  if (error) {
    // El índice único de franja sigue cubriendo, además, el caso de un sitio de mano.
    if (error.code === '23505') return { error: 'Ya tiene una plaza fija en alguno de esos horarios. Recarga la página.' };
    capturarExcepcion(new Error(error.message), { tags: { area: 'clases-fijas' }, extra: { plazas: filas.length } });
    return { error: 'No se han podido guardar las plazas de la clase fija. Inténtalo de nuevo.' };
  }
  if (!(data as { ok: boolean } | null)?.ok) {
    return { error: 'Esta clase fija se ha llenado justo ahora: recházala o vuelve a intentarlo.' };
  }
  // En paralelo acotado y no en serie: una clase fija son hasta 12 plazas, y esto va
  // dentro de la petición de aprobar. Un fallo del motor no la tumba (el cron la recoge).
  const hechas = await mapLimit(filas, 4, async (f) => {
    const { data, error: errMotor } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: HORIZONTE_MATERIALIZAR_DIAS, p_plaza_id: f.id });
    if (errMotor) {
      capturarExcepcion(new Error(errMotor.message), { tags: { area: 'clases-fijas' }, extra: { plazaId: f.id } });
      return 0;
    }
    return (data as number | null) ?? 0;
  });
  const creadas = hechas.reduce((n, x) => n + x, 0);
  return { ok: true, plazaIds: filas.map(f => f.id), creadas };
}

export const respuestaClaseFijaAprobada = (nombre: string, hasta: string, primeraReservada: boolean) =>
  `Tu estudio te ha dado la clase fija «${nombre}» hasta el ${fechaDMY(hasta)}.${primeraReservada ? ' Ya tienes reservada la próxima clase.' : ''}`;

// ─── Ampliarla ────────────────────────────────────────────────────────────────
//
// Para cuando ya la tiene y quiere más tiempo antes de que venza. A diferencia de
// pedirla, no crea franjas nuevas: no compite por plaza (no pasa por el tope duro)
// y no comprueba duplicada ni sitio —ya los tiene—. Sí revuelve a revalidar que
// sigue teniendo derecho: cuota que la cubra y, si el tipo la exige, autorización.

export interface FilaAmpliar { id: string; vigenciaHasta: string }

export type PreparacionAmpliar =
  | { ok: true; nombre: string; hasta: string; filas: FilaAmpliar[] }
  | { error: string; status: number };

/**
 * Revalida que sigue teniendo derecho a esta clase fija (la misma regla que dársela,
 * sin duplicada ni sitio) y calcula la vigencia nueva por franja —`nuevaVigenciaAmpliar`,
 * nunca acorta lo que ya tenía—. Sin escribir nada: la comparten pedir ampliarla y
 * aprobarlo, que revalida TODO otra vez en el momento de decidir.
 */
export async function prepararAmpliarClaseFija(
  admin: SupabaseClient,
  p: { studioId: string; socioId: string; claseFijaId: string | null; duracionMeses: number | null },
): Promise<PreparacionAmpliar> {
  if (!p.claseFijaId || !p.duracionMeses) return { error: 'La petición no tiene clase fija: recházala.', status: 409 };
  const oferta = await ofertaResuelta(admin, p.studioId, p.claseFijaId);
  if (!oferta) return { error: 'Esa clase fija ya no existe: rechaza la petición.', status: 409 };
  if (!oferta.duracionesMeses.includes(p.duracionMeses)) return { error: 'Esa duración ya no está disponible para esta clase fija.', status: 400 };
  if (oferta.franjasResueltas.length === 0) return { error: 'Ahora no hay clases programadas en el horario de esta clase fija.', status: 409 };

  const hoy = hoyEnEstudio();
  const { data: suyasRows, error: errSuyas } = await admin.from('plazas_fijas').select('*')
    .eq('studio_id', p.studioId).eq('socio_id', p.socioId).in('estado', ['ACTIVA', 'PAUSADA']);
  if (errSuyas) throw new Error(errSuyas.message);
  const suyas = (suyasRows ?? []).map(r => mapPlazaFija(r as RowPlazasFijas));

  const cubridoras = oferta.franjasResueltas.map(f => suyas.find(pf =>
    (pf.estado === 'ACTIVA' || pf.estado === 'PAUSADA') && (!pf.vigenciaHasta || pf.vigenciaHasta >= hoy)
    && pf.diaSemana === f.diaSemana && pf.horaInicio.slice(0, 5) === f.hora && pf.salaId === f.salaId
    && (!pf.tipoClaseId || pf.tipoClaseId === f.tipoClaseId)));
  if (cubridoras.some(c => !c)) return { error: 'No tienes esta clase fija: pídela primero.', status: 404 };

  // Cuota y autorización, una vez por cada tipo de clase distinto entre sus franjas
  // (sus franjas pueden ser de tipos distintos, con cuotas distintas).
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', p.studioId).eq('socio_id', p.socioId).eq('estado', 'ACTIVA'),
    admin.from('planes_tarifa').select('*').eq('studio_id', p.studioId),
  ]);
  const planes = await hidratarTiposDePlanes(admin as never, p.studioId, (planRows ?? []).map(mapPlanTarifa));
  const suscripciones = (susRows ?? []).map(mapSuscripcion);
  for (const tipoClaseId of new Set(oferta.franjasResueltas.map(f => f.tipoClaseId))) {
    if (!cuotaParaPlazaFija(p.socioId, suscripciones, planes, hoy, tipoClaseId)) {
      return { error: 'Ya no tienes una cuota activa que incluya esta clase fija.', status: 409 };
    }
    const { data: tipo } = await admin.from('tipos_clase').select('requiere_autorizacion').eq('id', tipoClaseId).eq('studio_id', p.studioId).maybeSingle();
    if (tipo?.requiere_autorizacion) {
      const { data: permiso } = await admin.from('socio_tipos_clase_autorizados').select('tipo_clase_id')
        .eq('studio_id', p.studioId).eq('socio_id', p.socioId).eq('tipo_clase_id', tipoClaseId).maybeSingle();
      if (!permiso) return { error: 'Esta clase necesita que el estudio te dé acceso: escríbeles y te la abren.', status: 409 };
    }
  }

  const hastaPorFranja = cubridoras.map(c => nuevaVigenciaAmpliar(c!.vigenciaHasta, hoy, p.duracionMeses as number));
  return {
    ok: true, nombre: oferta.nombre, hasta: [...hastaPorFranja].sort().at(-1) ?? hoy,
    filas: cubridoras.map((c, i) => ({ id: c!.id, vigenciaHasta: hastaPorFranja[i] })),
  };
}

/** Extiende `vigencia_hasta`: sin capacidad en juego, sin RPC ni lock — un `update` por fila. */
export async function aplicarAmpliarClaseFija(
  admin: SupabaseClient, p: { studioId: string; socioId: string; filas: FilaAmpliar[] },
): Promise<{ ok: true } | { error: string }> {
  for (const f of p.filas) {
    // `studio_id`/`socio_id` no hacen falta para localizar la fila (el id ya la
    // identifica), pero acotan la escritura por defensa en profundidad — mismo
    // criterio que el resto de escrituras de `plazas_fijas` en este fichero.
    const { error } = await admin.from('plazas_fijas').update({ vigencia_hasta: f.vigenciaHasta })
      .eq('id', f.id).eq('studio_id', p.studioId).eq('socio_id', p.socioId);
    if (error) {
      capturarExcepcion(new Error(error.message), { tags: { area: 'clases-fijas' }, extra: { plazaId: f.id } });
      return { error: 'No se ha podido ampliar la clase fija. Inténtalo de nuevo.' };
    }
  }
  return { ok: true };
}

export const respuestaClaseFijaAmpliada = (nombre: string, hasta: string) =>
  `Tu estudio te ha ampliado la clase fija «${nombre}» hasta el ${fechaDMY(hasta)}.`;

export async function nombreDeOferta(admin: SupabaseClient, studioId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await admin.from('clases_fijas').select('nombre').eq('id', id).eq('studio_id', studioId).maybeSingle();
  return (data?.nombre as string | undefined) ?? null;
}

/** Para la bandeja: nombre y estado de las ofertas de las peticiones pendientes. */
export async function resumenOfertasPendientes(
  admin: SupabaseClient, studioId: string, ids: string[],
): Promise<Map<string, { nombre: string; estado: EstadoOferta; plazasLibres: number | null }>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const defs = await cargarOfertas(admin, studioId, { ids: unicos });
  const resueltas = await resolverOfertas(admin, studioId, defs);
  return new Map(resueltas.map(o => [o.id, { nombre: o.nombre, estado: o.estado, plazasLibres: o.plazasLibres }]));
}
