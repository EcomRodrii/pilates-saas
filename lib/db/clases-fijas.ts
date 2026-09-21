import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, mapPlazaFija, mapSesion } from '@/lib/supabase-data';
import { construirHorario, type TarjetaHorario } from '@/lib/horario-fijo';
import { hoyEnEstudio, uid } from '@/lib/utils';
import { fechaDMY } from '@/lib/series-renovacion';
import { HORIZONTE_MATERIALIZAR_DIAS } from '@/lib/plazas-fijas-slot';
import { superaLimiteSemanal } from '@/lib/plazas-fijas-reglas';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import {
  DURACIONES_POR_DEFECTO, MAX_DESCRIPCION, MAX_FRANJAS, MAX_NOMBRE, estadoOferta, etiquetaDuracion, franjasYaCubiertas,
  normalizarDuraciones, plazasLibresDeClaseFija, programadaHasta, resolverFranjas, textoFranja, vigenciaHastaDeDuracion,
  type CatalogoClasesFijas, type EstadoOferta, type FranjaResuelta, type OfertaAlumna, type OfertaStaff,
} from '@/lib/clases-fijas-reglas';
import { TEXTOS_PLAZA_FIJA_ALUMNA, validarPlazaFijaDesdeSesion, type ResultadoPeticionAlumna } from '@/lib/db/supabase-data-admin';
import type { RowPlazasFijas, RowSesiones } from '@/lib/db-types';

// Clases fijas del estudio (migr clases_fijas_del_estudio): el estudio arma una
// OFERTA con nombre a partir de clases que ya se repiten, la alumna la pide con la
// duración que elige y el estudio la aprueba a mano. Aprobar da una plaza fija por
// cada franja (`plazas_fijas`), hasta la fecha elegida: el motor de siempre las
// reserva, y esta capa NO reserva nada por su cuenta.
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
  franjas: { id: string; serieId: string; diaSemana: number }[];
}

type FilaOferta = { id: string; nombre: string; descripcion: string | null; activa: boolean; duraciones_meses: number[]; plazas: number | null };
type FilaFranja = { id: string; clase_fija_id: string; serie_id: string; dia_semana: number };

/** Las ofertas del estudio (las activas, o todas) con sus franjas definidas. */
export async function cargarOfertas(
  admin: SupabaseClient, studioId: string, opts: { soloActivas?: boolean; ids?: string[] } = {},
): Promise<OfertaDef[]> {
  let q = admin.from('clases_fijas').select('id, nombre, descripcion, activa, duraciones_meses, plazas')
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
    duracionesMeses: f.duraciones_meses, plazas: f.plazas,
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

async function nombresDe(admin: SupabaseClient, studioId: string, franjas: FranjaResuelta[]) {
  const ids = (col: (f: FranjaResuelta) => string | null) => [...new Set(franjas.map(col).filter((x): x is string => !!x))];
  const pide = (tabla: string, lista: string[], cols: string) => lista.length
    ? admin.from(tabla).select(cols).eq('studio_id', studioId).in('id', lista)
    : Promise.resolve({ data: [] as unknown[], error: null });
  const [tipos, salas, instrs] = await Promise.all([
    pide('tipos_clase', ids(f => f.tipoClaseId), 'id, nombre'),
    pide('salas', ids(f => f.salaId), 'id, nombre'),
    pide('instructores', ids(f => f.instructorId), 'id, nombre'),
  ]);
  for (const r of [tipos, salas, instrs]) if (r.error) throw new Error(r.error.message);
  const mapa = (d: unknown[]) => new Map((d as { id: string; nombre: string }[]).map(x => [x.id, x.nombre]));
  return { tipos: mapa(tipos.data ?? []), salas: mapa(salas.data ?? []), instructores: mapa(instrs.data ?? []) };
}

/**
 * Las clases fijas que el estudio ofrece hoy, ya resueltas contra su horario. Es lo
 * mismo para cualquier visitante; con `socioId` (un JWT ya verificado) añade SUS
 * peticiones pendientes. Sin ofertas activas no hace ninguna consulta más.
 */
export async function catalogoClasesFijas(admin: SupabaseClient, studioId: string, socioId: string | null): Promise<CatalogoClasesFijas> {
  const defs = await cargarOfertas(admin, studioId, { soloActivas: true });
  if (defs.length === 0) return { ofertas: [], pedidas: [] };
  const resueltas = await resolverOfertas(admin, studioId, defs);
  const nombres = await nombresDe(admin, studioId, resueltas.flatMap(o => o.franjasResueltas));
  const hoy = hoyEnEstudio();

  const ofertas = resueltas.filter((o): o is OfertaResuelta & { estado: OfertaAlumna['estado'] } => o.estado !== 'CERRADA').map((o): OfertaAlumna => ({
    id: o.id, nombre: o.nombre, descripcion: o.descripcion, estado: o.estado, plazasLibres: o.plazasLibres,
    duraciones: o.duracionesMeses.map(meses => ({ meses, etiqueta: etiquetaDuracion(meses), hasta: vigenciaHastaDeDuracion(hoy, meses) })),
    franjas: o.franjasResueltas.map(f => ({
      diaSemana: f.diaSemana, hora: f.hora, tipoClaseId: f.tipoClaseId, salaId: f.salaId,
      tipo: nombres.tipos.get(f.tipoClaseId) ?? 'Clase',
      sala: nombres.salas.get(f.salaId) ?? '',
      instructora: f.instructorId ? nombres.instructores.get(f.instructorId) ?? null : null,
    })).sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7) || a.hora.localeCompare(b.hora)),
    programadaHasta: o.programadaHasta,
  }));

  let pedidas: CatalogoClasesFijas['pedidas'] = [];
  if (socioId) {
    const { data, error } = await admin.from('solicitudes_plaza_fija')
      .select('id, clase_fija_id, duracion_meses, vigencia_hasta_propuesta')
      .eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'PENDIENTE').eq('tipo', 'CREAR_CLASE_FIJA');
    if (error) throw new Error(error.message);
    pedidas = (data ?? []).map(r => ({
      claseFijaId: r.clase_fija_id as string, solicitudId: r.id as string,
      duracionMeses: r.duracion_meses as number, hasta: r.vigencia_hasta_propuesta as string,
    }));
  }
  return { ofertas, pedidas };
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
    }, TEXTOS_PLAZA_FIJA_ALUMNA);
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

export async function solicitarClaseFijaAlumna(
  admin: SupabaseClient, p: { studioId: string; socioId: string; claseFijaId: string; duracionMeses: number },
): Promise<ResultadoPeticionAlumna> {
  const oferta = await ofertaResuelta(admin, p.studioId, p.claseFijaId);
  if (!oferta || !oferta.activa) return { error: 'Esta clase fija ya no está disponible.', status: 404 };
  if (!oferta.duracionesMeses.includes(p.duracionMeses)) return { error: 'Esa duración no está disponible para esta clase fija.', status: 400 };
  if (oferta.estado === 'COMPLETA') return { error: 'Esta clase fija está completa.', status: 409 };

  const hoy = hoyEnEstudio();
  const hasta = vigenciaHastaDeDuracion(hoy, p.duracionMeses);
  const c = await comprobarClaseFija(admin, { studioId: p.studioId, socioId: p.socioId, oferta, hasta, hoy });
  if ('error' in c) return c;

  const { data, error } = await admin.from('solicitudes_plaza_fija').insert({
    studio_id: p.studioId, socio_id: p.socioId, tipo: 'CREAR_CLASE_FIJA', clase_fija_id: oferta.id,
    duracion_meses: p.duracionMeses, vigencia_hasta_propuesta: hasta, supera_limite: !!c.exceso,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { error: 'Ya has pedido esta clase fija: tu estudio te contestará.', status: 409 };
    throw new Error(error.message);
  }
  const { emitirPeticionPlazaFija } = await import('@/lib/notifications/emit');
  await emitirPeticionPlazaFija(admin, {
    studioId: p.studioId, solicitudId: data.id, socioId: p.socioId,
    peticion: `pide la clase fija «${oferta.nombre}» durante ${etiquetaDuracion(p.duracionMeses)}${c.exceso ? `, y pasaría del límite de ${c.exceso.limite} por semana de su cuota` : ''}`,
  });
  return { ok: true, solicitudId: data.id };
}

// ─── Aprobarla ────────────────────────────────────────────────────────────────

export interface PlazaClaseFijaNueva {
  id: string; studio_id: string; socio_id: string; dia_semana: number; hora_inicio: string; sala_id: string;
  tipo_clase_id: string | null; spot_id: null; vigencia_desde: string; vigencia_hasta: string; estado: 'ACTIVA';
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
    filas: c.nuevas.map(({ v }): PlazaClaseFijaNueva => ({
      id: `pf-${uid()}`, studio_id: p.studioId, socio_id: p.socioId, dia_semana: v.dow, hora_inicio: v.horaInicio,
      sala_id: v.salaId, tipo_clase_id: v.tipoClaseId, spot_id: null, vigencia_desde: hoy, vigencia_hasta: p.vigenciaHasta as string,
      estado: 'ACTIVA',
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
  const { error } = await admin.from('plazas_fijas').insert(filas);
  if (error) {
    // El índice único de franja cubre la carrera de dos aprobaciones a la vez.
    if (error.code === '23505') return { error: 'Ya tiene una plaza fija en alguno de esos horarios. Recarga la página.' };
    capturarExcepcion(new Error(error.message), { tags: { area: 'clases-fijas' }, extra: { plazas: filas.length } });
    return { error: 'No se han podido guardar las plazas de la clase fija. Inténtalo de nuevo.' };
  }
  let creadas = 0;
  for (const f of filas) {
    const { data, error: errMotor } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: HORIZONTE_MATERIALIZAR_DIAS, p_plaza_id: f.id });
    if (errMotor) capturarExcepcion(new Error(errMotor.message), { tags: { area: 'clases-fijas' }, extra: { plazaId: f.id } });
    else creadas += (data as number | null) ?? 0;
  }
  return { ok: true, plazaIds: filas.map(f => f.id), creadas };
}

export const respuestaClaseFijaAprobada = (nombre: string, hasta: string, primeraReservada: boolean) =>
  `Tu estudio te ha dado la clase fija «${nombre}» hasta el ${fechaDMY(hasta)}.${primeraReservada ? ' Ya tienes reservada la próxima clase.' : ''}`;

/** El nombre de una oferta, para las respuestas a la alumna (rechazos incluidos). */
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

// ─── Lo que hace el estudio: crear y editar ofertas ──────────────────────────

export interface DatosOferta {
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  duracionesMeses: number[];
  plazas: number | null;
  franjas: { serieId: string; diaSemana: number }[];
}

/** Lo que llega en el body de una ruta → datos válidos, o el texto de por qué no (400). */
export function validarDatosOferta(b: Record<string, unknown> | null, parcial: boolean): { ok: true; datos: Partial<DatosOferta> } | { error: string } {
  if (!b) return { error: 'Faltan los datos de la clase fija.' };
  const datos: Partial<DatosOferta> = {};
  if (!parcial || 'nombre' in b) {
    const nombre = typeof b.nombre === 'string' ? Array.from(b.nombre.trim()).join('') : '';
    if (!nombre) return { error: 'Ponle un nombre a la clase fija.' };
    if (Array.from(nombre).length > MAX_NOMBRE) return { error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.` };
    datos.nombre = nombre;
  }
  if (!parcial || 'descripcion' in b) {
    const d = typeof b.descripcion === 'string' ? b.descripcion.trim() : '';
    if (Array.from(d).length > MAX_DESCRIPCION) return { error: `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.` };
    datos.descripcion = d || null;
  }
  if ('activa' in b) {
    if (typeof b.activa !== 'boolean') return { error: 'Dato «activa» no válido.' };
    datos.activa = b.activa;
  }
  if (!parcial || 'duracionesMeses' in b) {
    const dur = b.duracionesMeses === undefined && !parcial ? DURACIONES_POR_DEFECTO : normalizarDuraciones(b.duracionesMeses);
    if (!dur) return { error: 'Elige entre 1 y 6 duraciones de las que se ofrecen (de 1 mes a 2 años).' };
    datos.duracionesMeses = dur;
  }
  if (!parcial || 'plazas' in b) {
    const t = b.plazas;
    if (t !== null && t !== undefined && (typeof t !== 'number' || !Number.isInteger(t) || t < 1 || t > 200)) {
      return { error: 'El tope de plazas tiene que ser un número entre 1 y 200, o vacío para usar el aforo de la clase.' };
    }
    datos.plazas = (t as number | null | undefined) ?? null;
  }
  if (!parcial || 'franjas' in b) {
    const fr = b.franjas;
    if (!Array.isArray(fr) || fr.length < 1) return { error: 'Elige al menos una clase que se repita.' };
    if (fr.length > MAX_FRANJAS) return { error: `Como mucho ${MAX_FRANJAS} clases por clase fija.` };
    const vistas = new Set<string>();
    const lista: { serieId: string; diaSemana: number }[] = [];
    for (const x of fr) {
      const o = x as { serieId?: unknown; diaSemana?: unknown } | null;
      if (typeof o?.serieId !== 'string' || !o.serieId || typeof o.diaSemana !== 'number' || !Number.isInteger(o.diaSemana) || o.diaSemana < 0 || o.diaSemana > 6) {
        return { error: 'Una de las clases elegidas no es válida.' };
      }
      const k = `${o.serieId}|${o.diaSemana}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      lista.push({ serieId: o.serieId, diaSemana: o.diaSemana });
    }
    datos.franjas = lista;
  }
  return { ok: true, datos };
}

export type ResultadoGuardarOferta = { ok: true; id: string } | { error: string; status: number };

/**
 * Crea (sin `id`) o edita una oferta. Cada franja tiene que existir HOY en el
 * horario (una clase que se repite): guardar una que no existe dejaría una oferta
 * que nadie puede pedir. Editar reemplaza las franjas; cerrarla (`activa: false`)
 * no toca las plazas ya concedidas.
 */
export async function guardarOferta(
  admin: SupabaseClient, p: { studioId: string; id?: string; datos: Partial<DatosOferta> },
): Promise<ResultadoGuardarOferta> {
  const { studioId, datos } = p;
  if (datos.franjas) {
    const tarjetas = await tarjetasDeSeries(admin, studioId, [...new Set(datos.franjas.map(f => f.serieId))]);
    const faltan = datos.franjas.filter(f => !tarjetas.some(t => t.serieId === f.serieId && t.diaSemana === f.diaSemana));
    if (faltan.length > 0) return { error: 'Alguna de las clases elegidas ya no se repite en el horario. Recarga y elígelas de nuevo.', status: 409 };
  }

  let id = p.id;
  const fila: Record<string, unknown> = { actualizada_en: new Date().toISOString() };
  if (datos.nombre !== undefined) fila.nombre = datos.nombre;
  if (datos.descripcion !== undefined) fila.descripcion = datos.descripcion;
  if (datos.activa !== undefined) fila.activa = datos.activa;
  if (datos.duracionesMeses !== undefined) fila.duraciones_meses = datos.duracionesMeses;
  if (datos.plazas !== undefined) fila.plazas = datos.plazas;

  if (id) {
    const { data, error } = await admin.from('clases_fijas').update(fila).eq('id', id).eq('studio_id', studioId).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: 'Clase fija no encontrada.', status: 404 };
  } else {
    const { data, error } = await admin.from('clases_fijas').insert({ ...fila, studio_id: studioId }).select('id').single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }

  if (datos.franjas) {
    const { data: actuales, error: errAct } = await admin.from('clases_fijas_franjas')
      .select('id, serie_id, dia_semana').eq('clase_fija_id', id).eq('studio_id', studioId);
    if (errAct) throw new Error(errAct.message);
    const clave = (s: string, d: number) => `${s}|${d}`;
    const quedan = new Set(datos.franjas.map(f => clave(f.serieId, f.diaSemana)));
    const yaEstan = new Set((actuales ?? []).map(a => clave(a.serie_id as string, a.dia_semana as number)));
    const sobran = (actuales ?? []).filter(a => !quedan.has(clave(a.serie_id as string, a.dia_semana as number))).map(a => a.id as string);
    const nuevas = datos.franjas.filter(f => !yaEstan.has(clave(f.serieId, f.diaSemana)))
      .map(f => ({ clase_fija_id: id, studio_id: studioId, serie_id: f.serieId, dia_semana: f.diaSemana }));
    if (nuevas.length > 0) {
      const { error } = await admin.from('clases_fijas_franjas').insert(nuevas);
      if (error) throw new Error(error.message);
    }
    if (sobran.length > 0) {
      const { error } = await admin.from('clases_fijas_franjas').delete().in('id', sobran).eq('studio_id', studioId);
      if (error) throw new Error(error.message);
    }
  }
  return { ok: true, id: id as string };
}

/** Todas las ofertas del estudio (también las cerradas) para su pantalla de gestión. */
export async function listarOfertasStaff(admin: SupabaseClient, studioId: string): Promise<OfertaStaff[]> {
  const defs = await cargarOfertas(admin, studioId);
  if (defs.length === 0) return [];
  const [resueltas, pend] = await Promise.all([
    resolverOfertas(admin, studioId, defs),
    admin.from('solicitudes_plaza_fija').select('clase_fija_id')
      .eq('studio_id', studioId).eq('estado', 'PENDIENTE').eq('tipo', 'CREAR_CLASE_FIJA').limit(500),
  ]);
  if (pend.error) throw new Error(pend.error.message);
  const porOferta = new Map<string, number>();
  for (const r of pend.data ?? []) porOferta.set(r.clase_fija_id as string, (porOferta.get(r.clase_fija_id as string) ?? 0) + 1);
  return resueltas.map(o => ({
    id: o.id, nombre: o.nombre, descripcion: o.descripcion, activa: o.activa,
    duracionesMeses: o.duracionesMeses, plazas: o.plazas,
    franjas: o.franjas.map(f => ({
      serieId: f.serieId, diaSemana: f.diaSemana,
      resuelta: o.franjasResueltas.some(r => r.serieId === f.serieId && r.diaSemana === f.diaSemana),
    })),
    estado: o.estado, plazasLibres: o.plazasLibres, programadaHasta: o.programadaHasta,
    pendientes: porOferta.get(o.id) ?? 0,
  }));
}
