// ─────────────────────────────────────────────────────────────────────────────
// Acceso a datos de salud desde rutas de servidor con service-role (SERVER-ONLY).
//
// Con service-role la RLS no se aplica y `auth.uid()` es NULL, así que las
// funciones SQL de la cerradura (`tiene_consentimiento_salud`,
// `instructora_atiende_socia`) no sirven aquí: la primera se salta el filtro de
// estudio y la segunda devuelve siempre false. Esta es la misma regla escrita
// en TS, con las mismas columnas:
//   · rol clínico (PROPIETARIO/INSTRUCTOR),
//   · la socia es de ESTE estudio y no está borrada,
//   · consentimiento de salud vigente (fecha puesta y `consentimiento_salud_revocado_en` NULL),
//   · y si es INSTRUCTORA, que sea su alumna (±30 días, ver acceso-instructora.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import type { SesionStaff } from '@/lib/auth-server';
import { puedeVerFichaClinica } from '@/lib/permisos-reglas';
import {
  accesoSaludSocia, instructoraAtiendeSocia, mensajeAccesoSalud,
  VENTANA_ALUMNA_DIAS, type ClaseOCitaDeSocia,
} from '@/lib/datos-salud/acceso-instructora';

export type ResultadoAcceso = { ok: true } | { ok: false; status: number; error: string };

const DIA_MS = 24 * 60 * 60 * 1000;

const NO_AUTORIZADO: ResultadoAcceso = { ok: false, status: 403, error: 'No tienes permiso para ver datos de salud.' };
const SIN_SERVIDOR: ResultadoAcceso = { ok: false, status: 500, error: 'No se ha podido comprobar el acceso a los datos de salud.' };

/** La ficha de `instructores` de esta persona en la sede de la sesión. */
export async function instructorIdDeSesion(admin: SupabaseClient, sesion: SesionStaff): Promise<string | null> {
  const { data, error } = await admin.from('instructores').select('id')
    .eq('auth_user_id', sesion.userId)
    .eq('studio_id', sesion.studioId)
    // Mismo criterio que `current_instructor_id()`: solo una baja explícita revoca.
    .neq('activo', false)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Reservas y citas de la socia con esa instructora dentro de la ventana. `null`
 * si alguna consulta falla: quien llama lo trata como «no» (falla cerrado).
 */
async function filasDeSociaConInstructora(
  admin: SupabaseClient, studioId: string, instructorId: string, socioId: string, ahora: Date,
): Promise<ClaseOCitaDeSocia[] | null> {
  const desde = new Date(ahora.getTime() - VENTANA_ALUMNA_DIAS * DIA_MS).toISOString();
  const hasta = new Date(ahora.getTime() + VENTANA_ALUMNA_DIAS * DIA_MS).toISOString();

  // Dos pasos y no un embed: no depende de que PostgREST conozca la FK.
  const [ses, cit] = await Promise.all([
    admin.from('sesiones').select('id, inicio, cancelada, instructor_id')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .gte('inicio', desde).lte('inicio', hasta),
    admin.from('citas').select('inicio, estado, instructor_id')
      .eq('studio_id', studioId).eq('instructor_id', instructorId).eq('socio_id', socioId)
      .gte('inicio', desde).lte('inicio', hasta),
  ]);
  if (ses.error || cit.error) return null;

  const sesiones = new Map((ses.data ?? []).map(s => [s.id as string, s]));
  const filas: ClaseOCitaDeSocia[] = (cit.data ?? []).map(c => ({
    inicio: c.inicio as string, estado: c.estado as string, instructorId: c.instructor_id as string | null,
  }));

  if (sesiones.size > 0) {
    const { data: reservas, error } = await admin.from('reservas').select('sesion_id, estado')
      .eq('studio_id', studioId).eq('socio_id', socioId).in('sesion_id', [...sesiones.keys()]);
    if (error) return null;
    for (const r of reservas ?? []) {
      const s = sesiones.get(r.sesion_id as string);
      if (!s) continue;
      filas.push({
        inicio: s.inicio as string,
        estado: r.estado as string,
        instructorId: s.instructor_id as string | null,
        cancelada: s.cancelada as boolean | null,
      });
    }
  }
  return filas;
}

/**
 * ¿Puede esta sesión de staff tocar la salud de esta socia?
 *
 * `exigirConsentimiento: false` solo para REGISTRAR o REVOCAR el propio
 * consentimiento (sin él vigente no habría forma de darlo).
 */
export async function comprobarAccesoSaludSocia(
  sesion: SesionStaff,
  socioId: string,
  opciones: { exigirConsentimiento: boolean },
  ahora: Date = new Date(),
): Promise<ResultadoAcceso> {
  if (!puedeVerFichaClinica(sesion.rol)) return NO_AUTORIZADO;
  if (typeof socioId !== 'string' || !socioId) return { ok: false, status: 400, error: 'Falta la clienta.' };
  const admin = getSupabaseAdmin();
  if (!admin) return SIN_SERVIDOR;

  const { data: socio, error } = await admin.from('socios')
    .select('consentimiento_salud_fecha, consentimiento_salud_revocado_en')
    .eq('id', socioId)
    .eq('studio_id', sesion.studioId)
    .is('borrado_en', null)
    .maybeSingle();
  if (error) return SIN_SERVIDOR;
  if (!socio) return { ok: false, status: 404, error: 'No encontramos a esta clienta en tu estudio.' };

  if (opciones.exigirConsentimiento
    && (!socio.consentimiento_salud_fecha || socio.consentimiento_salud_revocado_en)) {
    return { ok: false, status: 403, error: 'Registra primero el consentimiento de salud de esta clienta.' };
  }

  let atiende = false;
  if (sesion.rol === 'INSTRUCTOR') {
    const instructorId = await instructorIdDeSesion(admin, sesion);
    const filas = instructorId
      ? await filasDeSociaConInstructora(admin, sesion.studioId, instructorId, socioId, ahora)
      : null;
    atiende = filas ? instructoraAtiendeSocia(filas, instructorId, ahora) : false;
  }
  const acceso = accesoSaludSocia(sesion.rol, atiende);
  if (acceso !== 'PERMITIDO') return { ok: false, status: 403, error: mensajeAccesoSalud(acceso)! };
  return { ok: true };
}

/**
 * Para el resumen de salud de UNA clase: la propietaria, cualquier clase de su
 * estudio; la instructora, solo las que imparte ella (sus alumnas por
 * definición).
 */
export async function comprobarAccesoSaludClase(sesion: SesionStaff, sesionId: unknown): Promise<ResultadoAcceso> {
  if (!puedeVerFichaClinica(sesion.rol)) return NO_AUTORIZADO;
  if (typeof sesionId !== 'string' || !sesionId) return { ok: false, status: 400, error: 'Falta la clase.' };
  const admin = getSupabaseAdmin();
  if (!admin) return SIN_SERVIDOR;

  const { data: clase, error } = await admin.from('sesiones').select('instructor_id')
    .eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (error) return SIN_SERVIDOR;
  if (!clase) return { ok: false, status: 404, error: 'No encontramos esa clase en tu estudio.' };
  if (sesion.rol === 'PROPIETARIO') return { ok: true };

  const instructorId = await instructorIdDeSesion(admin, sesion);
  if (!instructorId || clase.instructor_id !== instructorId) {
    return { ok: false, status: 403, error: 'Solo puedes preparar con IA las clases que impartes tú.' };
  }
  return { ok: true };
}
