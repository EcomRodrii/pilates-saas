import type { SupabaseClient } from '@supabase/supabase-js';
import { instanteEnEstudio } from '../utils.ts';
import { puedeGestionarFichaDe } from '../permisos-reglas.ts';
import type { Rol } from '../types';

// Lo que ve quien gestiona el equipo en «Equipo → Tiempo trabajado»: las
// jornadas del mes, su auditoría y los totales por instructora.
//
// Service-role, así que todo va acotado a mano al estudio de la sesión y, además,
// a las instructoras cuya ficha puede gestionar quien pregunta (una gerente no ve
// las horas de la propietaria ni de otra gerente). Ese filtro lo decide la ruta.

export interface JornadaEquipo {
  id: string;
  instructorId: string;
  checkInAt: string;
  checkOutAt: string | null;
  status: 'OPEN' | 'CLOSED' | 'PENDING_REVIEW';
  /** Solo de las cerradas: una abierta aún no tiene duración. */
  minutos: number | null;
  requiereRevision: boolean;
  corregida: boolean;
}

export interface CambioJornada {
  accion: 'CHECK_IN' | 'CHECK_OUT' | 'EDITED';
  campo: string | null;
  antes: string | null;
  despues: string | null;
  motivo: string | null;
  en: string;
  /** Nombre de quien lo hizo, o null si ya no se puede saber. */
  por: string | null;
}

export interface ResumenInstructora {
  instructorId: string;
  minutos: number;
  jornadas: number;
  abiertas: number;
  aRevisar: number;
}

export const HORAS_LIMITE_POR_DEFECTO = 12;

/** Las fichas cuyas horas puede ver y corregir quien pregunta (mismo criterio que tarifas y liquidaciones). */
export function instructorasGestionables(rolActor: Rol, rolPorInstructor: ReadonlyMap<string, Rol>): string[] {
  return [...rolPorInstructor].filter(([, rol]) => puedeGestionarFichaDe(rolActor, rol)).map(([id]) => id);
}

/**
 * El mes en hora del estudio, como instantes UTC [desde, hasta). Con UTC a secas,
 * una jornada que empieza a las 00:30 del día 1 en Madrid caería en el mes anterior.
 */
export function rangoMesEstudio(anio: number, mes: number): { desde: string; hasta: string } | null {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return null;
  const sig = mes === 12 ? { a: anio + 1, m: 1 } : { a: anio, m: mes + 1 };
  const desde = instanteEnEstudio(`${anio}-${String(mes).padStart(2, '0')}-01`, '00:00');
  const hasta = instanteEnEstudio(`${sig.a}-${String(sig.m).padStart(2, '0')}-01`, '00:00');
  return desde && hasta ? { desde, hasta } : null;
}

interface FilaJornada {
  id: string; instructor_id: string; check_in_at: string; check_out_at: string | null;
  status: JornadaEquipo['status']; edited_at: string | null;
}

export function aJornadaEquipo(f: FilaJornada, ahora: Date, limiteHoras: number): JornadaEquipo {
  const entrada = Date.parse(f.check_in_at);
  const salida = f.check_out_at ? Date.parse(f.check_out_at) : null;
  return {
    id: f.id,
    instructorId: f.instructor_id,
    checkInAt: f.check_in_at,
    checkOutAt: f.check_out_at,
    status: f.status,
    minutos: salida != null ? Math.round((salida - entrada) / 60_000) : null,
    requiereRevision: f.status === 'PENDING_REVIEW'
      || (f.status === 'OPEN' && ahora.getTime() - entrada > limiteHoras * 3_600_000),
    corregida: f.edited_at != null,
  };
}

/** Totales por instructora. Una jornada cuenta en el mes en que empezó. */
export function resumirPorInstructora(jornadas: readonly JornadaEquipo[]): ResumenInstructora[] {
  const porId = new Map<string, ResumenInstructora>();
  for (const j of jornadas) {
    const r = porId.get(j.instructorId) ?? { instructorId: j.instructorId, minutos: 0, jornadas: 0, abiertas: 0, aRevisar: 0 };
    r.jornadas++;
    if (j.minutos != null) r.minutos += j.minutos;
    if (j.status === 'OPEN') r.abiertas++;
    if (j.requiereRevision) r.aRevisar++;
    porId.set(j.instructorId, r);
  }
  return [...porId.values()];
}

export async function listarJornadasEquipo(
  admin: SupabaseClient,
  p: { studioId: string; desde: string; hasta: string; instructorIds: readonly string[] },
  ahora = new Date(),
): Promise<{ jornadas: JornadaEquipo[]; cambios: Record<string, CambioJornada[]> }> {
  if (p.instructorIds.length === 0) return { jornadas: [], cambios: {} };

  const [filas, config] = await Promise.all([
    admin.from('instructor_work_sessions')
      .select('id, instructor_id, check_in_at, check_out_at, status, edited_at')
      .eq('studio_id', p.studioId).in('instructor_id', [...p.instructorIds])
      .gte('check_in_at', p.desde).lt('check_in_at', p.hasta)
      .order('check_in_at', { ascending: false }),
    admin.from('studio_config_tiempo').select('open_session_limit_hours').eq('studio_id', p.studioId).maybeSingle(),
  ]);
  if (filas.error) throw filas.error;
  if (config.error) throw config.error;
  const limite = (config.data as { open_session_limit_hours: number } | null)?.open_session_limit_hours ?? HORAS_LIMITE_POR_DEFECTO;
  const jornadas = ((filas.data ?? []) as FilaJornada[]).map((f) => aJornadaEquipo(f, ahora, limite));
  if (jornadas.length === 0) return { jornadas, cambios: {} };

  const { data: auds, error: errAud } = await admin.from('work_session_audits')
    .select('work_session_id, action, field_name, value_before, value_after, reason, created_at, created_by')
    .eq('studio_id', p.studioId).in('work_session_id', jornadas.map((j) => j.id))
    .order('created_at', { ascending: true });
  if (errAud) throw errAud;
  const filasAud = (auds ?? []) as {
    work_session_id: string; action: CambioJornada['accion']; field_name: string | null;
    value_before: string | null; value_after: string | null; reason: string | null; created_at: string; created_by: string;
  }[];

  const nombres = await nombresPorCuenta(admin, p.studioId, [...new Set(filasAud.map((a) => a.created_by))]);
  const cambios: Record<string, CambioJornada[]> = {};
  for (const a of filasAud) {
    (cambios[a.work_session_id] ??= []).push({
      accion: a.action, campo: a.field_name, antes: a.value_before, despues: a.value_after,
      motivo: a.reason, en: a.created_at, por: nombres.get(a.created_by) ?? null,
    });
  }
  return { jornadas, cambios };
}

/** Cuenta de Auth → nombre visible, solo dentro de este estudio. */
export async function nombresPorCuenta(admin: SupabaseClient, studioId: string, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (ids.length === 0) return m;
  const [equipo, estudio] = await Promise.all([
    admin.from('instructores').select('auth_user_id, nombre').eq('studio_id', studioId).in('auth_user_id', ids),
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
  ]);
  for (const f of (equipo.data ?? []) as { auth_user_id: string; nombre: string | null }[]) {
    if (f.nombre) m.set(f.auth_user_id, f.nombre);
  }
  const duena = (estudio.data as { owner_auth_user_id: string | null } | null)?.owner_auth_user_id;
  if (duena && ids.includes(duena) && !m.has(duena)) m.set(duena, 'Propietaria');
  return m;
}
