// ─────────────────────────────────────────────────────────────────────────────
// Fase 2c: cancela automáticamente una sesión si a 2h de su inicio no alcanza
// el mínimo de asistentes configurado (studios/tipos_clase.minimo_asistentes_
// por_clase). El corte es FIJO (no configurable) — a diferencia de
// confirmacion-riesgo (ASK + CORTE, aviso previo), aquí no hay fase de aviso:
// se cancela directo, coherente con que la regla es opt-in (el estudio ya
// sabe lo que implica al activarla).
//
// Cadencia cada 15 min: no es una guardia de seguridad tipo Fase 2a (nadie
// puede "hacer trampa" esperando a que no se alcance el mínimo), así que puede
// ir más holgada que reservas-pendientes.ts (5 min). Con ventana de
// detección de 15 min el desfase máximo sobre el corte de 2h es tolerable —
// más ajustado que los 30 min de confirmacion-riesgo CORTE porque aquí el
// coste de un desfase es mayor: cuanta más gente confirme en esos minutos,
// menos sentido tiene cancelar.
//
// Sin fan-out por estudio: query global de sesiones futuras dentro de las
// próximas 2h, filtro exacto del corte en JS — mismo patrón de doble filtro
// (SQL amplio + JS exacto) que confirmacion-riesgo.ts.
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { heredaOverride, debeCancelarPorMinimoNoAlcanzado } from '@/lib/booking-logic.ts';
import { cancelarSesionPorMinimoNoAlcanzado } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

const DOS_HORAS_MS = 2 * 3600_000;

export const minimoAsistentesDispatcher = inngest.createFunction(
  { id: 'minimo-asistentes-cancelar', triggers: [{ cron: '*/15 * * * *' }] },
  async ({ step }) => {
    return step.run('cancelar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      const ahora = new Date();
      const hasta = new Date(ahora.getTime() + DOS_HORAS_MS).toISOString();

      // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
      // filas en silencio. Una sesión truncada no se revisaría nunca y la clase
      // seguiría en pie sin alcanzar el mínimo — el fallo se vería como "la
      // regla no funciona a veces", que es lo más difícil de diagnosticar.
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

      let canceladas = 0;
      for (const s of sesiones) {
        const minimo = heredaOverride(minimoTipo.get(s.tipo_clase_id as string) ?? null, minimoEstudio.get(s.studio_id as string) ?? 0);
        if (minimo <= 0) continue;
        if (new Date(s.inicio as string).getTime() - ahora.getTime() > DOS_HORAS_MS) continue;

        const { count } = await admin
          .from('reservas').select('id', { count: 'exact', head: true })
          .eq('sesion_id', s.id).eq('estado', 'CONFIRMADA');
        if (debeCancelarPorMinimoNoAlcanzado(count ?? 0, minimo)) {
          await cancelarSesionPorMinimoNoAlcanzado({ studioId: s.studio_id as string, sesionId: s.id as string });
          canceladas++;
        }
      }
      return { revisadas: sesiones.length, canceladas };
    });
  },
);
