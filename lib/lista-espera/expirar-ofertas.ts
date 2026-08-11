// ─────────────────────────────────────────────────────────────────────────────
// Fase 2b (plazo para aceptar una plaza de lista de espera): ninguna oferta
// puede quedar viva indefinidamente. La regla de negocio ya vive DENTRO de la
// RPC `aceptar_oferta_lista_espera` (nadie puede aceptar tras
// `oferta_expira_en`, pase lo que pase con este barrido) — esto es solo el
// aviso proactivo a la siguiente en la cola.
//
// Piloto de arquitectura (2026-08-11): este barrido salió de Inngest a
// `pg_cron` + `pg_net` (ver migración y `app/api/cron/lista-espera-ofertas-
// expirar/route.ts`) — es un barrido periódico sin estado por ítem ni espera
// durable, así que no necesitaba un motor de workflows para empezar.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { expirarOfertaListaEspera } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

export async function barrerOfertasListaEsperaExpiradas(): Promise<{ expiradas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { expiradas: 0 };
  // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
  // filas en silencio. Una oferta que cayera fuera del corte no expiraría
  // nunca y bloquearía la plaza para la siguiente de la cola.
  const { data: ofertas } = await fetchAllRows<{ id: string; studio_id: string; sesion_id: string | null; socio_id: string | null }>(
    '(global)', 'reservas',
    (from, to) => admin
      .from('reservas')
      .select('id, studio_id, sesion_id, socio_id')
      .eq('estado', 'LISTA_ESPERA')
      .not('oferta_expira_en', 'is', null)
      .lte('oferta_expira_en', new Date().toISOString())
      .range(from, to),
  );
  if (!ofertas.length) return { expiradas: 0 };
  for (const o of ofertas) {
    if (!o.socio_id || !o.sesion_id) continue;
    await expirarOfertaListaEspera({
      studioId: o.studio_id,
      reservaId: o.id,
      sesionId: o.sesion_id,
      socioId: o.socio_id,
    });
  }
  return { expiradas: ofertas.length };
}
