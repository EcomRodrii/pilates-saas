// ─────────────────────────────────────────────────────────────────────────────
// Fase 2a (aprobación manual de reserva): ninguna reserva puede seguir
// PENDIENTE_APROBACION una vez empezada su clase. La regla de negocio en sí
// vive en la RPC `resolver_reserva_pendiente` (una aprobación tardía siempre
// vuelve CANCELADA, pase lo que pase con este barrido) — esto es solo el
// aviso proactivo a la socia.
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A,
// barrido sin estado por ítem). La corrección no depende de este barrido (la
// guardia está en la RPC), pero el AVISO a la socia sí.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { expirarReservaPendiente } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

export async function expirarReservasPendientes(): Promise<{ expiradas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { expiradas: 0 };
  // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
  // filas en silencio.
  const { data: reservas } = await fetchAllRows<{ id: string; studio_id: string; sesion_id: string; socio_id: string | null }>(
    '(global)', 'reservas',
    (from, to) => admin
      .from('reservas')
      .select('id, studio_id, sesion_id, socio_id')
      .eq('estado', 'PENDIENTE_APROBACION')
      .range(from, to),
  );
  if (!reservas.length) return { expiradas: 0 };
  const { data: sesiones } = await fetchAllRows<{ id: string; inicio: string }>(
    '(global)', 'sesiones',
    (from, to) => admin
      .from('sesiones')
      .select('id, inicio')
      .in('id', [...new Set(reservas.map((r) => r.sesion_id))])
      .range(from, to),
  );
  const inicioById = new Map(sesiones.map((s) => [s.id, s.inicio]));
  const ahora = Date.now();
  let expiradas = 0;
  for (const r of reservas) {
    if (!r.socio_id) continue;
    const inicio = inicioById.get(r.sesion_id);
    if (!inicio || new Date(inicio).getTime() > ahora) continue;
    await expirarReservaPendiente({
      studioId: r.studio_id,
      reservaId: r.id,
      sesionId: r.sesion_id,
      socioId: r.socio_id,
    });
    expiradas++;
  }
  return { expiradas };
}
