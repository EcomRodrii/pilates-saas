// ─────────────────────────────────────────────────────────────────────────────
// Fase 2c: cancela automáticamente una sesión si a 2h de su inicio no alcanza
// el mínimo de asistentes configurado (studios/tipos_clase.minimo_asistentes_
// por_clase). El corte es FIJO (no configurable) — a diferencia de
// confirmacion-riesgo (ASK + CORTE, aviso previo), aquí no hay fase de aviso:
// se cancela directo, coherente con que la regla es opt-in.
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A,
// barrido sin estado por ítem). Cadencia (15 min): más ajustada que
// confirmacion-riesgo CORTE (30 min) porque aquí el coste de un desfase es
// mayor: cuanta más gente confirme en esos minutos, menos sentido tiene
// cancelar.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { heredaOverride, debeCancelarPorMinimoNoAlcanzado } from '@/lib/booking-logic.ts';
import { cancelarSesionPorMinimoNoAlcanzado } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

const DOS_HORAS_MS = 2 * 3600_000;

export async function cancelarSesionesPorMinimoNoAlcanzado(): Promise<{ revisadas: number; canceladas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { revisadas: 0, canceladas: 0 };
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + DOS_HORAS_MS).toISOString();

  // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
  // filas en silencio. Una sesión truncada no se revisaría nunca.
  const { data: sesiones } = await fetchAllRows<{ id: string; studio_id: string; tipo_clase_id: string | null; inicio: string }>(
    '(global)', 'sesiones',
    (from, to) => admin
      .from('sesiones')
      .select('id, studio_id, tipo_clase_id, inicio')
      .eq('cancelada', false)
      .gt('inicio', ahora.toISOString())
      .lte('inicio', hasta)
      .range(from, to),
  );
  if (!sesiones.length) return { revisadas: 0, canceladas: 0 };

  const studioIds = [...new Set(sesiones.map(s => s.studio_id))];
  const { data: studios } = await fetchAllRows<{ id: string; minimo_asistentes_por_clase: number }>(
    '(global)', 'studios',
    (from, to) => admin.from('studios').select('id, minimo_asistentes_por_clase').in('id', studioIds).range(from, to),
  );
  const minimoEstudio = new Map(studios.map(s => [s.id, s.minimo_asistentes_por_clase]));

  const tipoIds = [...new Set(sesiones.map(s => s.tipo_clase_id as string).filter(Boolean))];
  const { data: tipos } = tipoIds.length
    ? await fetchAllRows<{ id: string; minimo_asistentes_por_clase: number | null }>(
        '(global)', 'tipos_clase',
        (from, to) => admin.from('tipos_clase').select('id, minimo_asistentes_por_clase').in('id', tipoIds).range(from, to),
      )
    : { data: [] as { id: string; minimo_asistentes_por_clase: number | null }[] };
  const minimoTipo = new Map(tipos.map(t => [t.id, t.minimo_asistentes_por_clase]));

  const aRevisar = sesiones
    .map(s => ({
      s,
      minimo: heredaOverride(minimoTipo.get(s.tipo_clase_id as string) ?? null, minimoEstudio.get(s.studio_id) ?? 0),
    }))
    .filter(({ s, minimo }) => minimo > 0 && new Date(s.inicio).getTime() - ahora.getTime() <= DOS_HORAS_MS);
  if (!aRevisar.length) return { revisadas: sesiones.length, canceladas: 0 };

  const { data: confirmadas } = await fetchAllRows<{ sesion_id: string }>(
    '(global)', 'reservas',
    (from, to) => admin.from('reservas').select('sesion_id')
      .in('sesion_id', aRevisar.map(({ s }) => s.id))
      .eq('estado', 'CONFIRMADA').range(from, to),
  );
  const confirmadasPorSesion = new Map<string, number>();
  for (const r of confirmadas) {
    confirmadasPorSesion.set(r.sesion_id, (confirmadasPorSesion.get(r.sesion_id) ?? 0) + 1);
  }

  let canceladas = 0;
  for (const { s, minimo } of aRevisar) {
    if (debeCancelarPorMinimoNoAlcanzado(confirmadasPorSesion.get(s.id) ?? 0, minimo)) {
      await cancelarSesionPorMinimoNoAlcanzado({ studioId: s.studio_id, sesionId: s.id });
      canceladas++;
    }
  }
  return { revisadas: sesiones.length, canceladas };
}
