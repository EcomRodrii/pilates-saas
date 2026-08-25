import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularRendimientoInstructoras, type RendimientoInstructora } from './rendimiento-instructoras.ts';

// Capa de datos server-only para el informe de rendimiento de instructoras
// (fila 17 del informe estratégico). Separada de lib/supabase-data.ts (god
// file, no trocear) por el mismo motivo que lib/equipo/liquidacion-datos.ts:
// funcionalidad nueva y acotada.

const MS_DIA = 86400000;
const VENTANA_DIAS = 90;

export async function obtenerRendimientoInstructoras(
  admin: SupabaseClient, studioId: string, now: Date,
): Promise<RendimientoInstructora[]> {
  const desde = new Date(now.getTime() - VENTANA_DIAS * MS_DIA).toISOString();

  const [{ data: instructoresRow }, { data: sesionesRow }, { data: primerasSesionesRow }] = await Promise.all([
    admin.from('instructores').select('id, nombre').eq('studio_id', studioId).eq('activo', true).eq('rol', 'INSTRUCTOR'),
    admin.from('sesiones').select('id, instructor_id, inicio').eq('studio_id', studioId).gte('inicio', desde),
    // Fecha de la sesión más antigua de cada instructor (histórico completo,
    // no acotado a la ventana) — para el filtro "lleva ≥60 días en el equipo".
    admin.from('sesiones').select('instructor_id, inicio').eq('studio_id', studioId).not('instructor_id', 'is', null).order('inicio', { ascending: true }),
  ]);

  const instructores = (instructoresRow ?? []).map(r => ({ id: r.id as string, nombre: r.nombre as string }));
  if (instructores.length === 0) return [];

  const sesiones = (sesionesRow ?? []).map(r => ({
    id: r.id as string, instructorId: r.instructor_id as string | null, inicio: r.inicio as string,
  }));

  const primeraSesionPorInstructor = new Map<string, string>();
  for (const r of primerasSesionesRow ?? []) {
    const insId = r.instructor_id as string;
    if (!primeraSesionPorInstructor.has(insId)) primeraSesionPorInstructor.set(insId, r.inicio as string);
  }

  const sesionIds = sesiones.map(s => s.id);
  const [{ data: reservasRow }, { data: sociosRow }] = await Promise.all([
    sesionIds.length > 0
      ? admin.from('reservas').select('socio_id, sesion_id, creado_en').eq('studio_id', studioId).eq('estado', 'ASISTIDA').in('sesion_id', sesionIds)
      : Promise.resolve({ data: [] as { socio_id: string | null; sesion_id: string; creado_en: string }[] }),
    admin.from('socios').select('id, fecha_alta, referido_por').eq('studio_id', studioId),
  ]);

  const asistencias = (reservasRow ?? [])
    .filter((r): r is { socio_id: string; sesion_id: string; creado_en: string } => !!r.socio_id)
    .map(r => ({ socioId: r.socio_id, sesionId: r.sesion_id, creadoEn: r.creado_en }));

  const socios = (sociosRow ?? []).map(r => ({
    id: r.id as string, fechaAlta: r.fecha_alta as string, referidoPor: r.referido_por as string | null,
  }));

  return calcularRendimientoInstructoras({
    instructores, sesiones, asistencias, socios, now, ventanaDias: VENTANA_DIAS, primeraSesionPorInstructor,
  });
}
