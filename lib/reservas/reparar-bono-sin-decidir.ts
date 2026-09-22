// ─────────────────────────────────────────────────────────────────────────────
// D-5 (auditoría 22-sep): si el descuento de bono falla al confirmar una
// plaza, la reserva se queda CONFIRMADA para siempre con
// `bono_consumo_rastreado = true` y `bono_decidido_en = NULL` — y nadie lo
// repara. `reservar_plaza` envuelve la llamada a `consumir_bono_interno` en
// su propio BEGIN/EXCEPTION (D-1) precisamente para que un rechazo defensivo
// no tumbe una reserva ya válida por lo demás; el precio de esa decisión es
// que un fallo real (no uno de los "no debería pasar nunca" que valida
// `bonoConsumible` en TS) también se traga en silencio.
//
// `completarConfirmacionTrasReintento` (lib/db/supabase-data-admin.ts) ya
// sabe cerrar exactamente esta decisión — es el mismo camino que usa un
// reintento normal de aprobar una pendiente o aceptar una oferta, idempotente
// por reserva. Solo faltaba alguien que lo llamara de forma PROACTIVA en vez
// de esperar a que la socia reintentara algo.
//
// Barrido global (bucket A, sin fan-out por estudio), mismo patrón que
// `expirarReservasPendientes` (lib/reservas-pendientes/expirar.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { completarConfirmacionTrasReintento } from '@/lib/db/supabase-data-admin';
import { exigirLectura } from '@/lib/exigir-lectura';
import { fetchAllRows } from '@/lib/supabase-data';

// El descuento en `reservar_plaza` es SÍNCRONO, dentro de la misma
// transacción que confirma la plaza — así que una fila más reciente que esta
// ventana puede ser una petición todavía en vuelo (o su propia transacción
// aún sin comitear cuando se hizo la lectura), no una rota de verdad.
const VENTANA_GRACIA_MINUTOS = 5;

export type ResumenReparacionBonos = {
  candidatas: number;
  reparadas: number;
  /** Ids de reserva que, tras el reintento, SIGUEN sin decisión — para alertar. */
  siguenSinDecidir: string[];
};

export async function repararBonosSinDecidir(): Promise<ResumenReparacionBonos> {
  const admin = getSupabaseAdmin();
  if (!admin) return { candidatas: 0, reparadas: 0, siguenSinDecidir: [] };

  const corte = new Date(Date.now() - VENTANA_GRACIA_MINUTOS * 60 * 1000).toISOString();
  const { data: candidatas, error } = await fetchAllRows<{ id: string; studio_id: string }>(
    '(global)', 'reservas',
    (from, to) => admin
      .from('reservas')
      .select('id, studio_id')
      .in('estado', ['CONFIRMADA', 'ASISTIDA'])
      .eq('bono_consumo_rastreado', true)
      .is('bono_decidido_en', null)
      .lt('creado_en', corte)
      .range(from, to),
  );
  exigirLectura(error, 'leyendo reservas con bono sin decidir');
  if (!candidatas.length) return { candidatas: 0, reparadas: 0, siguenSinDecidir: [] };

  for (const r of candidatas) {
    await completarConfirmacionTrasReintento(admin, { studioId: r.studio_id, reservaId: r.id });
  }

  // `completarConfirmacionTrasReintento` no devuelve resultado (sus otros dos
  // llamantes no lo necesitan) — se relee para saber qué se cerró de verdad.
  const { data: siguenRotas, error: errRelectura } = await admin
    .from('reservas').select('id')
    .in('id', candidatas.map((c) => c.id))
    .is('bono_decidido_en', null);
  exigirLectura(errRelectura, 'releyendo reservas tras el reintento de bono');

  const siguenSinDecidir = (siguenRotas ?? []).map((r) => r.id as string);
  return { candidatas: candidatas.length, reparadas: candidatas.length - siguenSinDecidir.length, siguenSinDecidir };
}
