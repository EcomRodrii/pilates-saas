// Publica en Urban Sports Club el horario de los estudios que venden allí por
// API. Lo dispara pg_cron (app/api/cron/usc-horario), mismo patrón que
// lib/zoom-sync.ts: barrido de las próximas dos semanas, un fallo puntual no
// para el resto, y nada que se cree allí se queda sin apuntar aquí.
//
// Qué decide qué: `planificarHorarioUsc` (puro, con tests) dice qué llamadas
// hacen falta; esto solo lee de la base de datos, las ejecuta y guarda lo
// enviado. Un estudio entra si tiene USC activa Y en su config el `providerId`
// y el `locationId` que da USC al darle de alta — sin ellos sigue en modo
// manual (apuntar a mano desde la clase), como hasta ahora. Sin contrato o
// suspendido, se le retira todo como si la hubiera apagado (venta-externa.ts).
import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planificarHorarioUsc, nombreTrainerUsc, configUscDe, uscPublicaPorApi, VENTANA_PUBLICACION_DIAS,
  type ConfigUsc, type EventoUscGuardado, type OperacionUsc, type SesionParaUsc,
} from './horario.ts';
import {
  credencialesUsc, crearEventoUsc, editarEventoUsc, cancelarEventoUsc, enviarOcupacionUsc,
  crearTrainerUsc, renombrarTrainerUsc, fechaAltaUsc, type CredencialesUsc,
} from './cliente.ts';
import { descifrarConfigDeFila } from '@/lib/integraciones/config-cifrada-servidor';
import { estudiosSinVentaExterna } from '../venta-externa.ts';

const PLATAFORMA = 'URBAN_SPORTS_CLUB';
/** Tope de llamadas por pasada: el cron tiene 60 s y cada llamada ~0,3-1 s. */
const MAX_LLAMADAS = 60;

export interface ResumenHorarioUsc {
  sinCredenciales?: true;
  estudios: number;
  creados: number;
  editados: number;
  cancelados: number;
  recreados: number;
  ocupaciones: number;
  trainers: number;
  fallidas: number;
  pendientes: number;
}

async function todas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

interface FilaSesion {
  id: string; inicio: string; fin: string; cancelada: boolean | null; aforo_maximo: number;
  instructor_id: string | null; tipo_clase_id: string | null;
  tipos_clase: { nombre: string; descripcion: string | null; ventana_cancelacion_horas: number | null } | null;
}

async function cargarEstudio(admin: SupabaseClient, studioId: string, ahora: number) {
  const desde = new Date(ahora).toISOString();
  const hasta = new Date(ahora + VENTANA_PUBLICACION_DIAS * 86_400_000).toISOString();
  const COLS = 'id, inicio, fin, cancelada, aforo_maximo, instructor_id, tipo_clase_id, tipos_clase(nombre, descripcion, ventana_cancelacion_horas)';

  const [estudio, eventos, cupos, trainers] = await Promise.all([
    admin.from('studios').select('cancelacion_ventana_horas').eq('id', studioId).maybeSingle(),
    admin.from('plataforma_eventos')
      .select('sesion_id, evento_externo_id, estado_sync, huella_fija, huella, ocupadas_enviadas')
      .eq('studio_id', studioId).eq('plataforma', PLATAFORMA),
    admin.from('plataforma_cupos').select('tipo_clase_id, sesion_id, plazas').eq('studio_id', studioId).eq('plataforma', PLATAFORMA),
    admin.from('plataforma_instructoras').select('instructor_id, id_externo').eq('studio_id', studioId).eq('plataforma', PLATAFORMA),
  ]);
  for (const r of [estudio, eventos, cupos, trainers]) if (r.error) throw new Error(r.error.message);

  const enVentana = await todas<FilaSesion>((a, b) => admin.from('sesiones').select(COLS)
    .eq('studio_id', studioId).gte('inicio', desde).lte('inicio', hasta).order('inicio').range(a, b) as never);

  // Las sesiones de eventos vivos que caen fuera de la ventana (ya empezadas o
  // movidas lejos) TAMBIÉN se cargan: si no, el planificador las daría por
  // borradas y cancelaría en USC una clase que sigue existiendo.
  const vistas = new Set(enVentana.map(s => s.id));
  const faltan = (eventos.data ?? [])
    .filter(e => e.estado_sync !== 'CANCELADO' && e.sesion_id && !vistas.has(e.sesion_id))
    .map(e => e.sesion_id as string);
  const fuera: FilaSesion[] = [];
  for (let i = 0; i < faltan.length; i += 200) {
    const { data, error } = await admin.from('sesiones').select(COLS).in('id', faltan.slice(i, i + 200));
    if (error) throw new Error(error.message);
    fuera.push(...((data ?? []) as unknown as FilaSesion[]));
  }
  const filas = [...enVentana, ...fuera];

  const ocupadas = new Map<string, number>();
  const ids = filas.map(s => s.id);
  for (let i = 0; i < ids.length; i += 200) {
    const trozo = ids.slice(i, i + 200);
    const reservas = await todas<{ sesion_id: string }>((a, b) => admin.from('reservas').select('sesion_id')
      .in('sesion_id', trozo).in('estado', ['CONFIRMADA', 'ASISTIDA']).neq('origen', PLATAFORMA).range(a, b) as never);
    for (const r of reservas) ocupadas.set(r.sesion_id, (ocupadas.get(r.sesion_id) ?? 0) + 1);
  }

  const cupoSesion = new Map<string, number>();
  const cupoTipo = new Map<string, number>();
  for (const c of cupos.data ?? []) {
    if (c.sesion_id) cupoSesion.set(c.sesion_id, c.plazas);
    else if (c.tipo_clase_id) cupoTipo.set(c.tipo_clase_id, c.plazas);
  }
  const ventanaEstudio = (estudio.data as { cancelacion_ventana_horas?: number | null } | null)?.cancelacion_ventana_horas ?? null;

  const sesiones: SesionParaUsc[] = filas.map(s => ({
    id: s.id,
    inicio: s.inicio,
    fin: s.fin,
    cancelada: s.cancelada === true,
    aforo: s.aforo_maximo,
    nombre: s.tipos_clase?.nombre ?? 'Clase',
    descripcion: s.tipos_clase?.descripcion ?? null,
    instructorId: s.instructor_id,
    cancelacionHoras: s.tipos_clase?.ventana_cancelacion_horas ?? ventanaEstudio,
    cupo: cupoSesion.get(s.id) ?? (s.tipo_clase_id ? cupoTipo.get(s.tipo_clase_id) : undefined) ?? null,
    ocupadasFueraDeUsc: ocupadas.get(s.id) ?? 0,
  }));

  const guardados: EventoUscGuardado[] = (eventos.data ?? []).map(e => ({
    sesionId: e.sesion_id,
    eventoId: e.evento_externo_id,
    cancelado: e.estado_sync === 'CANCELADO',
    huellaFija: e.huella_fija,
    huella: e.huella,
    ocupadasEnviadas: e.ocupadas_enviadas,
  }));

  return {
    sesiones, guardados,
    trainers: new Map((trainers.data ?? []).map(t => [t.instructor_id as string, t.id_externo as string])),
  };
}

/** Crea en USC las instructoras que van a salir en eventos y aún no existen allí. */
async function asegurarTrainers(
  admin: SupabaseClient, cred: CredencialesUsc, cfg: ConfigUsc, studioId: string,
  sesiones: SesionParaUsc[], trainers: Map<string, string>, presupuesto: { quedan: number }, r: ResumenHorarioUsc,
) {
  const sinMapa = [...new Set(sesiones
    .filter(s => s.instructorId && !trainers.has(s.instructorId) && !s.cancelada && (s.cupo ?? 0) > 0)
    .map(s => s.instructorId as string))];
  if (sinMapa.length === 0) return;
  const { data, error } = await admin.from('instructores').select('id, nombre').in('id', sinMapa);
  if (error) throw new Error(error.message);
  for (const ins of data ?? []) {
    if (presupuesto.quedan <= 0) return;
    presupuesto.quedan--;
    const t = await crearTrainerUsc(cred, cfg.providerId, nombreTrainerUsc(ins.nombre));
    if (!t.ok) { r.fallidas++; continue; }
    const { error: errG } = await admin.from('plataforma_instructoras').upsert(
      { studio_id: studioId, plataforma: PLATAFORMA, instructor_id: ins.id, id_externo: t.valor, nombre_enviado: ins.nombre },
      { onConflict: 'plataforma,studio_id,instructor_id' },
    );
    if (errG) { r.fallidas++; continue; }
    trainers.set(ins.id, t.valor);
    r.trainers++;
  }
}

/**
 * El nombre de la instructora vive también en USC. Si ha cambiado en Tentare
 * —sobre todo al anonimizarla (eliminar a la persona, purgar el estudio)—, se
 * reescribe allí. Por eso `plataforma_instructoras` se CONSERVA en esos dos
 * flujos: sin su id no habría cómo borrar su nombre de USC.
 */
async function renombrarTrainers(
  admin: SupabaseClient, cred: CredencialesUsc, cfg: ConfigUsc, studioId: string,
  presupuesto: { quedan: number }, r: ResumenHorarioUsc,
) {
  const { data, error } = await admin.from('plataforma_instructoras')
    .select('id, id_externo, nombre_enviado, instructores(nombre)')
    .eq('studio_id', studioId).eq('plataforma', PLATAFORMA);
  if (error) throw new Error(error.message);
  for (const fila of (data ?? []) as unknown as { id: string; id_externo: string; nombre_enviado: string | null; instructores: { nombre: string } | null }[]) {
    const nombre = fila.instructores?.nombre;
    if (!nombre || nombre === fila.nombre_enviado) continue;
    if (presupuesto.quedan <= 0) { r.pendientes++; return; }
    presupuesto.quedan--;
    const res = await renombrarTrainerUsc(cred, cfg.providerId, fila.id_externo, nombreTrainerUsc(nombre));
    if (!res.ok) { r.fallidas++; continue; }
    await admin.from('plataforma_instructoras').update({ nombre_enviado: nombre }).eq('id', fila.id);
    r.trainers++;
  }
}

const coste = (op: OperacionUsc) => (op.tipo === 'recrear' ? 3 : op.tipo === 'crear' ? 2 : 1);

async function ejecutar(
  admin: SupabaseClient, cred: CredencialesUsc, cfg: ConfigUsc, studioId: string, op: OperacionUsc, r: ResumenHorarioUsc,
) {
  const ahoraIso = new Date().toISOString();
  const marcarError = async (eventoId: string, error: string) => {
    r.fallidas++;
    await admin.from('plataforma_eventos').update({ error: error.slice(0, 500) })
      .eq('plataforma', PLATAFORMA).eq('evento_externo_id', eventoId);
  };

  if (op.tipo === 'cancelar') {
    const res = await cancelarEventoUsc(cred, cfg.providerId, op.eventoId);
    if (!res.ok) return marcarError(op.eventoId, res.error);
    await admin.from('plataforma_eventos').update({ estado_sync: 'CANCELADO', error: null, sincronizado_en: ahoraIso })
      .eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.eventoId);
    r.cancelados++;
    return;
  }

  if (op.tipo === 'editar') {
    const res = await editarEventoUsc(cred, cfg.providerId, op.eventoId, op.cambios);
    if (!res.ok) return marcarError(op.eventoId, res.error);
    await admin.from('plataforma_eventos').update({ huella: op.huella, error: null, sincronizado_en: ahoraIso })
      .eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.eventoId);
    r.editados++;
    return;
  }

  if (op.tipo === 'ocupacion') {
    const res = await enviarOcupacionUsc(cred, cfg.providerId, op.eventoId, op.bookingCount);
    if (!res.ok) return marcarError(op.eventoId, res.error);
    await admin.from('plataforma_eventos').update({ ocupadas_enviadas: op.bookingCount, error: null })
      .eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.eventoId);
    r.ocupaciones++;
    return;
  }

  // crear / recrear
  if (op.tipo === 'recrear') {
    const res = await cancelarEventoUsc(cred, cfg.providerId, op.eventoAnterior);
    if (!res.ok) return marcarError(op.eventoAnterior, res.error);
    // Cancelado allí: si lo de abajo falla, la fila ya no puede decir que vive.
    await admin.from('plataforma_eventos').update({ estado_sync: 'CANCELADO', sincronizado_en: ahoraIso })
      .eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.eventoAnterior);
  }
  const creado = await crearEventoUsc(cred, op.cuerpo, op.claveIdempotencia);
  if (!creado.ok) {
    r.fallidas++;
    Sentry.captureMessage('[usc-horario] no se pudo crear el evento', { level: 'warning', extra: { studioId, sesionId: op.sesionId, error: creado.error } });
    return;
  }
  let ocupadasEnviadas: number | null = 0;
  if (op.ocupadas > 0) {
    const o = await enviarOcupacionUsc(cred, cfg.providerId, creado.valor, op.ocupadas);
    ocupadasEnviadas = o.ok ? op.ocupadas : null; // null = la próxima pasada lo reintenta
  }
  const { error } = await admin.from('plataforma_eventos').upsert({
    studio_id: studioId, plataforma: PLATAFORMA, sesion_id: op.sesionId, evento_externo_id: creado.valor,
    estado_sync: 'SINCRONIZADO', huella_fija: op.huellaFija, huella: op.huella, ocupadas_enviadas: ocupadasEnviadas,
    error: null, sincronizado_en: ahoraIso,
  }, { onConflict: 'plataforma,sesion_id' });
  if (error) {
    // El evento existe en USC y aquí no consta: sin esto, cada pasada crearía
    // otro (mismo motivo que el borrado de la reunión huérfana en zoom-sync).
    await cancelarEventoUsc(cred, cfg.providerId, creado.valor).catch(() => { /* mejor esfuerzo */ });
    r.fallidas++;
    Sentry.captureMessage('[usc-horario] evento creado sin poder guardarlo; cancelado', { level: 'error', extra: { studioId, sesionId: op.sesionId, error: error.message } });
    return;
  }
  if (op.tipo === 'recrear') r.recreados++; else r.creados++;
}

/** Estudio que ha dejado de publicar en USC: se cancela allí todo lo vivo. */
async function retirarTodo(
  admin: SupabaseClient, cred: CredencialesUsc, cfg: ConfigUsc, studioId: string,
  presupuesto: { quedan: number }, r: ResumenHorarioUsc,
) {
  const { data, error } = await admin.from('plataforma_eventos')
    .select('sesion_id, evento_externo_id').eq('studio_id', studioId).eq('plataforma', PLATAFORMA).neq('estado_sync', 'CANCELADO');
  if (error) throw new Error(error.message);
  for (const e of data ?? []) {
    if (presupuesto.quedan <= 0) { r.pendientes++; continue; }
    presupuesto.quedan--;
    await ejecutar(admin, cred, cfg, studioId, { tipo: 'cancelar', sesionId: e.sesion_id, eventoId: e.evento_externo_id }, r);
  }
}

export async function sincronizarHorarioUsc(admin: SupabaseClient, ahora: number = Date.now()): Promise<ResumenHorarioUsc> {
  const r: ResumenHorarioUsc = { estudios: 0, creados: 0, editados: 0, cancelados: 0, recreados: 0, ocupaciones: 0, trainers: 0, fallidas: 0, pendientes: 0 };
  const cred = credencialesUsc();
  if (!cred) return { ...r, sinCredenciales: true };

  // También las APAGADAS o en manual: lo que publicaron sigue vivo en la app
  // de USC hasta que se cancela allí, y solo se puede cancelar con sus IDs.
  const { data: integraciones, error } = await admin.from('integraciones')
    .select('studio_id, activo, config').eq('tipo', PLATAFORMA);
  if (error) throw new Error(error.message);
  // Sin contrato o suspendido: como apagada (lib/plataformas/venta-externa.ts).
  const sinVenta = await estudiosSinVentaExterna(admin, (integraciones ?? []).map(i => i.studio_id as string), ahora);

  const presupuesto = { quedan: MAX_LLAMADAS };
  for (const intg of integraciones ?? []) {
    const config = descifrarConfigDeFila(intg.studio_id, PLATAFORMA, intg.config);
    const cfg = configUscDe(config);
    if (!cfg) continue; // nunca conectada por API
    try {
      // Primero los nombres: si la instructora se ha anonimizado, su nombre
      // tiene que salir de USC aunque el estudio ya no publique nada.
      await renombrarTrainers(admin, cred, cfg, intg.studio_id, presupuesto, r);
      if (!intg.activo || !uscPublicaPorApi(config) || sinVenta.has(intg.studio_id)) {
        await retirarTodo(admin, cred, cfg, intg.studio_id, presupuesto, r);
        continue;
      }
      r.estudios++;
      if (presupuesto.quedan <= 0) { r.pendientes++; continue; }
      presupuesto.quedan--;
      const alta = await fechaAltaUsc(cred, cfg.providerId);
      if (!alta.ok) {
        r.fallidas++;
        Sentry.captureMessage('[usc-horario] USC no reconoce el proveedor del estudio', { level: 'warning', extra: { studioId: intg.studio_id, error: alta.error } });
        continue;
      }
      const datos = await cargarEstudio(admin, intg.studio_id, ahora);
      await asegurarTrainers(admin, cred, cfg, intg.studio_id, datos.sesiones, datos.trainers, presupuesto, r);
      const ops = planificarHorarioUsc({
        sesiones: datos.sesiones, eventos: datos.guardados, config: cfg,
        trainerPorInstructora: datos.trainers, ahora, noAntesDe: alta.valor,
      });
      for (const op of ops) {
        if (presupuesto.quedan < coste(op)) { r.pendientes++; continue; }
        presupuesto.quedan -= coste(op);
        try {
          await ejecutar(admin, cred, cfg, intg.studio_id, op, r);
        } catch (e) {
          r.fallidas++;
          console.error('[usc-horario] fallo en operación', op.tipo, op.sesionId, e);
        }
      }
    } catch (e) {
      r.fallidas++;
      Sentry.captureException(e, { tags: { cron: 'usc-horario' }, extra: { studioId: intg.studio_id } });
    }
  }
  return r;
}
