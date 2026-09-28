// El historial de accesos: qué pasó cada vez que alguien leyó un QR de alumna.
//
// Lee `accesos_escaneos` con service-role, SIEMPRE acotado al estudio de quien
// pregunta (la ruta lo saca de su sesión), y resuelve los nombres que la tabla no
// guarda a propósito: la alumna (de su ficha), la clase (tipo, sala, hora) y
// quién escaneó (su ficha del equipo; la tabla guarda uid y rol, nunca nombres).
//
// Dos preguntas, una función: «¿quién intentó entrar este día?» (Control de
// acceso) y «¿cuándo ha entrado esta alumna?» (su ficha).

import type { SupabaseClient } from '@supabase/supabase-js';
import { COLS_SESION, detallar, type ClaseDetalle, type FilaSesion } from '@/lib/acceso/escanear-servidor';
import type { MotivoAcceso, Veredicto } from '@/lib/acceso/evaluar-acceso';
import { finDelDiaEstudio, inicioDelDiaEstudio } from '@/lib/utils';

export interface FilaHistorial {
  id: number;
  ocurridoEn: string;
  resultado: Veredicto;
  motivo: MotivoAcceso;
  /** La decisión tomada tras un 🟠, si esta fila es eso. */
  decision: 'DEJAR_PASAR' | 'APROBAR' | 'NO_PERMITIR' | null;
  origen: 'PANEL' | 'APP_INSTRUCTORA';
  asistenciaMarcada: boolean;
  alumna: { id: string; nombre: string } | null;
  clase: Pick<ClaseDetalle, 'nombre' | 'inicio' | 'sala'> | null;
  /** Quién escaneó: su nombre en el equipo o, si no hay ficha, su rol. */
  quien: string;
}

const ROL_LEGIBLE: Record<string, string> = {
  PROPIETARIO: 'Propietaria', MANAGER: 'Gerencia', RECEPCION: 'Recepción', INSTRUCTOR: 'Instructora',
};

/** Tope por consulta: un día de un estudio grande cabe de sobra; la ficha pide menos. */
const LIMITE_MAX = 200;

export async function historialDeAccesos(
  admin: SupabaseClient,
  studioId: string,
  filtro: { socioId: string } | { dia: string },
  limite = 100,
): Promise<FilaHistorial[]> {
  let q = admin.from('accesos_escaneos')
    .select('id, ocurrido_en, resultado, motivo, decision, origen, asistencia_marcada, socio_id, sesion_id, actor_uid, actor_rol')
    .eq('studio_id', studioId)
    .order('ocurrido_en', { ascending: false })
    .limit(Math.min(Math.max(limite, 1), LIMITE_MAX));
  if ('socioId' in filtro) q = q.eq('socio_id', filtro.socioId);
  else q = q.gte('ocurrido_en', inicioDelDiaEstudio(filtro.dia)).lt('ocurrido_en', finDelDiaEstudio(filtro.dia));
  const { data, error } = await q;
  if (error) throw error;
  const filas = (data ?? []) as {
    id: number; ocurrido_en: string; resultado: Veredicto; motivo: MotivoAcceso; decision: FilaHistorial['decision'];
    origen: FilaHistorial['origen']; asistencia_marcada: boolean; socio_id: string | null; sesion_id: string | null;
    actor_uid: string; actor_rol: string;
  }[];
  if (filas.length === 0) return [];

  const unicos = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const socioIds = unicos(filas.map(f => f.socio_id));
  const sesionIds = unicos(filas.map(f => f.sesion_id));
  const actorUids = unicos(filas.map(f => f.actor_uid));

  const [socias, sesiones, equipo] = await Promise.all([
    socioIds.length
      ? admin.from('socios').select('id, nombre, apellidos').eq('studio_id', studioId).in('id', socioIds)
        .then(({ data: d }) => new Map(((d ?? []) as { id: string; nombre: string; apellidos: string | null }[])
          .map(s => [s.id, [s.nombre, s.apellidos].filter(Boolean).join(' ')])))
      : Promise.resolve(new Map<string, string>()),
    sesionIds.length
      ? admin.from('sesiones').select(COLS_SESION).eq('studio_id', studioId).in('id', sesionIds)
        .then(async ({ data: d }) => detallar(admin, studioId, (d ?? []) as FilaSesion[]))
      : Promise.resolve(new Map<string, ClaseDetalle>()),
    actorUids.length
      ? admin.from('instructores').select('auth_user_id, nombre').eq('studio_id', studioId).in('auth_user_id', actorUids)
        .then(({ data: d }) => new Map(((d ?? []) as { auth_user_id: string; nombre: string }[]).map(i => [i.auth_user_id, i.nombre])))
      : Promise.resolve(new Map<string, string>()),
  ]);

  return filas.map(f => {
    const clase = f.sesion_id ? sesiones.get(f.sesion_id) : undefined;
    return {
      id: f.id,
      ocurridoEn: f.ocurrido_en,
      resultado: f.resultado,
      motivo: f.motivo,
      decision: f.decision,
      origen: f.origen,
      asistenciaMarcada: f.asistencia_marcada,
      // Una socia suprimida ya no está (anonimizar_socio borra sus filas); una
      // sin nombre resuelto se enseña sin él, nunca con el id.
      alumna: f.socio_id ? { id: f.socio_id, nombre: socias.get(f.socio_id) || 'Alumna' } : null,
      clase: clase ? { nombre: clase.nombre, inicio: clase.inicio, sala: clase.sala } : null,
      quien: equipo.get(f.actor_uid) ?? ROL_LEGIBLE[f.actor_rol] ?? 'Equipo',
    };
  });
}
