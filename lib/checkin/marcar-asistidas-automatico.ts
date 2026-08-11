// ─────────────────────────────────────────────────────────────────────────────
// Check-in QR opcional (migr 20260809020328): el estudio con
// `studios.requiere_checkin_qr = false` confía en que quien reserva viene, así
// que aquí es donde se cumple esa promesa — sin este barrido, una reserva
// CONFIRMADA se quedaría así para siempre porque nadie va a escanear nada.
//
// Por qué al TERMINAR la clase y no al confirmar la reserva: marcarla
// ASISTIDA en el momento de reservar rompería la cancelación normal (que
// opera sobre CONFIRMADA) y daría créditos/racha/referido por una clase que
// aún no ha ocurrido. Esperar a que la clase termine evita las dos cosas.
//
// Reutiliza `checkinPublico` tal cual (mismo camino que el escáner y el
// código de 6 caracteres): idempotente, ya comprueba `estado === 'CONFIRMADA'`
// por su cuenta — dos ejecuciones solapadas no duplican nada.
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A,
// barrido sin estado por ítem). Ventana de búsqueda de 2h hacia atrás (no
// solo "desde la última ejecución"): si un tick se retrasa o falla, el
// siguiente sigue encontrando las sesiones que se quedaron sin marcar.
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { checkinPublico } from '@/lib/db/supabase-data-admin';
import { fetchAllRows } from '@/lib/supabase-data';

const VENTANA_MS = 2 * 3600_000;

export async function marcarAsistidasAutomaticamente(): Promise<{ sesiones: number; reservasElegibles?: number; marcadas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { sesiones: 0, marcadas: 0 };
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_MS).toISOString();

  // Paginado: query global (todos los estudios) y PostgREST corta a 1.000
  // filas en silencio. Una reserva truncada aquí se queda SIN marcar como
  // asistida, así que después el barrido de no-shows la da por ausente.
  const { data: sesiones } = await fetchAllRows<{ id: string; studio_id: string }>(
    '(global)', 'sesiones',
    (from, to) => admin
      .from('sesiones')
      .select('id, studio_id')
      .eq('cancelada', false)
      .gt('fin', desde)
      .lte('fin', ahora.toISOString())
      .range(from, to),
  );
  if (!sesiones.length) return { sesiones: 0, marcadas: 0 };

  const studioIds = [...new Set(sesiones.map(s => s.studio_id))];
  const { data: studios } = await fetchAllRows<{ id: string; requiere_checkin_qr: boolean | null }>(
    '(global)', 'studios',
    (from, to) => admin.from('studios').select('id, requiere_checkin_qr').in('id', studioIds).range(from, to),
  );
  const sinCheckinQr = new Set(
    studios.filter(s => s.requiere_checkin_qr === false).map(s => s.id),
  );
  if (!sinCheckinQr.size) return { sesiones: sesiones.length, marcadas: 0 };

  const sesionIdsElegibles = sesiones
    .filter(s => sinCheckinQr.has(s.studio_id))
    .map(s => s.id);
  if (!sesionIdsElegibles.length) return { sesiones: sesiones.length, marcadas: 0 };

  const { data: reservas } = await fetchAllRows<{ id: string; studio_id: string }>(
    '(global)', 'reservas',
    (from, to) => admin
      .from('reservas')
      .select('id, studio_id')
      .in('sesion_id', sesionIdsElegibles)
      .eq('estado', 'CONFIRMADA')
      .range(from, to),
  );

  let marcadas = 0;
  for (const r of reservas) {
    const res = await checkinPublico({ studioId: r.studio_id, reservaId: r.id });
    if ('ok' in res) marcadas++;
  }
  return { sesiones: sesiones.length, reservasElegibles: reservas.length, marcadas };
}
