import type { SupabaseClient } from '@supabase/supabase-js';
import { hoyEnEstudio, instanteEnEstudio, uid } from '../utils.ts';

// Control horario de la instructora: jornadas (entrada → salida).
//
// Todo corre con service-role, que se salta la RLS, así que CADA consulta va
// acotada a mano a `studio_id` + `instructor_id`. La instructora y el estudio
// salen de la sesión verificada en la ruta, nunca del body; y salir NO recibe el
// id de la jornada: cierra LA abierta de quien llama, así que no hay nada ajeno
// que apuntar.
//
// La garantía de «una sola jornada abierta» es el índice único parcial
// `work_sessions_una_abierta`; el código solo la explota (doble clic = misma
// jornada), no la sustituye.

export interface ContextoFichaje { studioId: string; instructorId: string; userId: string }

export interface JornadaAbierta { id: string; checkInAt: string; requiereRevision: boolean }
export interface ProximaClase { id: string; nombre: string; inicio: string; fin: string }
export interface EstadoFichaje {
  abierta: JornadaAbierta | null;
  proxima: ProximaClase | null;
  ventanaMinutos: number;
  /** Lo ya cerrado hoy (día del estudio). La abierta, si la hay, se suma en pantalla con su cronómetro. */
  hoy: { minutosCerrados: number; jornadasCerradas: number };
}

const HORAS_LIMITE_POR_DEFECTO = 12;
const VENTANA_POR_DEFECTO = 10;

async function jornadaAbierta(admin: SupabaseClient, c: { studioId: string; instructorId: string }) {
  const { data, error } = await admin
    .from('instructor_work_sessions')
    .select('id, check_in_at')
    .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).eq('status', 'OPEN')
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; check_in_at: string } | null;
}

export async function estadoFichaje(
  admin: SupabaseClient, c: { studioId: string; instructorId: string }, ahora = new Date(),
): Promise<EstadoFichaje> {
  const inicioHoy = instanteEnEstudio(hoyEnEstudio(ahora), '00:00') ?? ahora.toISOString();
  const [abierta, config, clases, cerradasHoy] = await Promise.all([
    jornadaAbierta(admin, c),
    admin.from('studio_config_tiempo').select('check_in_window_minutes, open_session_limit_hours')
      .eq('studio_id', c.studioId).maybeSingle(),
    admin.from('sesiones').select('id, inicio, fin, tipos_clase(nombre)')
      .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId)
      .neq('cancelada', true).gte('fin', ahora.toISOString())
      .order('inicio', { ascending: true }).limit(1),
    admin.from('instructor_work_sessions').select('check_in_at, check_out_at')
      .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).eq('status', 'CLOSED')
      .gte('check_in_at', inicioHoy),
  ]);
  if (config.error) throw config.error;
  if (clases.error) throw clases.error;
  if (cerradasHoy.error) throw cerradasHoy.error;
  const filasHoy = (cerradasHoy.data ?? []) as { check_in_at: string; check_out_at: string | null }[];
  const minutosCerrados = filasHoy.reduce(
    (t, j) => t + (j.check_out_at ? Math.round((Date.parse(j.check_out_at) - Date.parse(j.check_in_at)) / 60_000) : 0), 0);

  const cfg = config.data as { check_in_window_minutes: number; open_session_limit_hours: number } | null;
  const limiteHoras = cfg?.open_session_limit_hours ?? HORAS_LIMITE_POR_DEFECTO;
  const fila = (clases.data?.[0] ?? null) as
    { id: string; inicio: string; fin: string; tipos_clase: { nombre: string } | { nombre: string }[] | null } | null;
  const tipo = Array.isArray(fila?.tipos_clase) ? fila?.tipos_clase[0] : fila?.tipos_clase;

  return {
    abierta: abierta
      ? {
        id: abierta.id,
        checkInAt: abierta.check_in_at,
        requiereRevision: ahora.getTime() - Date.parse(abierta.check_in_at) > limiteHoras * 3_600_000,
      }
      : null,
    proxima: fila ? { id: fila.id, nombre: tipo?.nombre ?? 'Clase', inicio: fila.inicio, fin: fila.fin } : null,
    ventanaMinutos: cfg?.check_in_window_minutes ?? VENTANA_POR_DEFECTO,
    hoy: { minutosCerrados, jornadasCerradas: filasHoy.length },
  };
}

export type ResultadoEntrada =
  | { ok: true; yaAbierta: boolean; auditoriaOk: boolean }
  | { ok: false; error: string };

/** Idempotente: con una jornada ya abierta (doble clic, dos pestañas) no crea otra. */
export async function registrarEntrada(
  admin: SupabaseClient, c: ContextoFichaje, ahora = new Date(),
): Promise<ResultadoEntrada> {
  if (await jornadaAbierta(admin, c)) return { ok: true, yaAbierta: true, auditoriaOk: true };

  const id = uid();
  const { error } = await admin.from('instructor_work_sessions').insert({
    id, studio_id: c.studioId, instructor_id: c.instructorId,
    check_in_at: ahora.toISOString(), check_in_method: 'MOBILE', status: 'OPEN', created_by: c.userId,
  });
  if (error) {
    // 23505 = otra petición abrió la jornada entre la lectura y el insert: ganó
    // el índice único, y para quien llama el resultado es el mismo.
    if (error.code === '23505' && await jornadaAbierta(admin, c)) return { ok: true, yaAbierta: true, auditoriaOk: true };
    return { ok: false, error: error.message };
  }

  const { error: errAud } = await admin.from('work_session_audits').insert({
    id: uid(), studio_id: c.studioId, work_session_id: id, action: 'CHECK_IN',
    field_name: 'check_in_at', value_after: ahora.toISOString(), created_by: c.userId,
  });
  return { ok: true, yaAbierta: false, auditoriaOk: !errAud };
}

export type ResultadoSalida =
  | { ok: true; yaCerrada: boolean; minutos: number | null; auditoriaOk: boolean }
  | { ok: false; error: string };

/**
 * Cierra la jornada abierta de quien llama. El UPDATE es condicional
 * (`status = 'OPEN'`): el segundo clic no encuentra nada que cerrar y responde
 * `yaCerrada`, sin una segunda salida.
 */
export async function registrarSalida(
  admin: SupabaseClient, c: ContextoFichaje, ahora = new Date(),
): Promise<ResultadoSalida> {
  const { data, error } = await admin.from('instructor_work_sessions')
    .update({ check_out_at: ahora.toISOString(), check_out_method: 'MOBILE', status: 'CLOSED' })
    .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).eq('status', 'OPEN')
    .select('id, check_in_at');
  if (error) return { ok: false, error: error.message };
  const cerrada = (data ?? [])[0] as { id: string; check_in_at: string } | undefined;
  if (!cerrada) return { ok: true, yaCerrada: true, minutos: null, auditoriaOk: true };

  const { error: errAud } = await admin.from('work_session_audits').insert({
    id: uid(), studio_id: c.studioId, work_session_id: cerrada.id, action: 'CHECK_OUT',
    field_name: 'check_out_at', value_before: null, value_after: ahora.toISOString(), created_by: c.userId,
  });
  return {
    ok: true, yaCerrada: false, auditoriaOk: !errAud,
    minutos: Math.round((ahora.getTime() - Date.parse(cerrada.check_in_at)) / 60_000),
  };
}

export type ResultadoEdicion =
  | { ok: true; cambios: number }
  | { ok: false; status: 400 | 404 | 500; error: string };

const TOLERANCIA_FUTURO_MS = 5 * 60_000;

/**
 * Corrección manual de una jornada por quien gestiona el equipo. El motivo es
 * obligatorio y cada campo cambiado deja su fila de auditoría con el valor
 * anterior y el nuevo. Quién puede llamarla lo decide la ruta.
 */
export async function editarJornada(
  admin: SupabaseClient,
  c: { studioId: string; userId: string },
  p: { id: string; checkInAt?: Date; checkOutAt?: Date; motivo: string },
  ahora = new Date(),
): Promise<ResultadoEdicion> {
  const motivo = p.motivo.trim();
  if (!motivo) return { ok: false, status: 400, error: 'Indica el motivo del cambio' };
  for (const d of [p.checkInAt, p.checkOutAt]) {
    if (d && (Number.isNaN(d.getTime()) || d.getTime() > ahora.getTime() + TOLERANCIA_FUTURO_MS)) {
      return { ok: false, status: 400, error: 'Fecha no válida' };
    }
  }

  const { data, error } = await admin.from('instructor_work_sessions')
    .select('id, check_in_at, check_out_at, status')
    .eq('id', p.id).eq('studio_id', c.studioId).maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  const actual = data as { id: string; check_in_at: string; check_out_at: string | null; status: string } | null;
  if (!actual) return { ok: false, status: 404, error: 'Jornada no encontrada' };

  const entrada = p.checkInAt ?? new Date(actual.check_in_at);
  const salida = p.checkOutAt ?? (actual.check_out_at ? new Date(actual.check_out_at) : null);
  if (salida && salida.getTime() <= entrada.getTime()) {
    return { ok: false, status: 400, error: 'La salida tiene que ser posterior a la entrada' };
  }

  const cambios: { campo: string; antes: string | null; despues: string }[] = [];
  if (p.checkInAt && p.checkInAt.getTime() !== Date.parse(actual.check_in_at)) {
    cambios.push({ campo: 'check_in_at', antes: actual.check_in_at, despues: p.checkInAt.toISOString() });
  }
  if (p.checkOutAt && p.checkOutAt.getTime() !== (actual.check_out_at ? Date.parse(actual.check_out_at) : NaN)) {
    cambios.push({ campo: 'check_out_at', antes: actual.check_out_at, despues: p.checkOutAt.toISOString() });
  }
  if (cambios.length === 0) return { ok: true, cambios: 0 };

  const cierra = actual.status === 'OPEN' && p.checkOutAt !== undefined;
  const nuevoEstado = cierra ? 'CLOSED' : actual.status;
  if (cierra) cambios.push({ campo: 'status', antes: actual.status, despues: 'CLOSED' });

  const { data: filas, error: errUpd } = await admin.from('instructor_work_sessions')
    .update({
      check_in_at: entrada.toISOString(),
      check_out_at: salida ? salida.toISOString() : null,
      status: nuevoEstado,
      edited_at: ahora.toISOString(),
      edited_by: c.userId,
    })
    .eq('id', p.id).eq('studio_id', c.studioId).select('id');
  if (errUpd) return { ok: false, status: 500, error: errUpd.message };
  if (!filas?.length) return { ok: false, status: 404, error: 'Jornada no encontrada' };

  const { error: errAud } = await admin.from('work_session_audits').insert(cambios.map((x) => ({
    id: uid(), studio_id: c.studioId, work_session_id: p.id, action: 'EDITED',
    field_name: x.campo, value_before: x.antes, value_after: x.despues, reason: motivo, created_by: c.userId,
  })));
  if (errAud) return { ok: false, status: 500, error: 'Se guardó el cambio pero no su auditoría' };
  return { ok: true, cambios: cambios.length };
}
