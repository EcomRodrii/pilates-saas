import type { SupabaseClient } from '@supabase/supabase-js';

// 44ª pasada de auditoría, hallazgo H-2. Cuando `procesarReembolsoDeUnRecibo`
// (lib/billing/procesar-reembolso.ts) marca DEVUELTO un recibo, este helper
// comprueba si ese recibo era el de una penalización ya cobrada y, si lo era,
// marca la penalización REEMBOLSADA y avisa a cualquier liquidación
// CONFIRMADA que ya la hubiera repartido — nunca a una PAGADA (ajuste
// manual, no automático). Sin `import 'server-only'` a propósito: se importa
// dinámicamente desde procesar-reembolso.ts, que también se ejecuta bajo
// `node --test` (mismo criterio que ../notifications/emit.ts, importado
// desde el mismo sitio).

export async function marcarPenalizacionReembolsada(
  admin: SupabaseClient, studioId: string, reciboId: string,
): Promise<void> {
  // Compare-and-set: solo una penalización COBRADA de verdad transiciona —
  // un reintento del webhook/cron sobre el mismo recibo no la reprocesa.
  const { data: pen, error } = await admin.from('penalizaciones')
    .update({ estado: 'REEMBOLSADA' })
    .eq('studio_id', studioId).eq('recibo_id', reciboId).eq('estado', 'COBRADA')
    .select('reserva_id, importe, procesada_en').maybeSingle();
  if (error) {
    console.error('[liquidacion] no se pudo marcar penalización reembolsada', reciboId, error.message);
    return;
  }
  if (!pen?.reserva_id) return; // este recibo no era de una penalización cobrada

  const { data: reserva } = await admin.from('reservas').select('sesion_id')
    .eq('id', pen.reserva_id as string).maybeSingle();
  const sesionId = (reserva?.sesion_id as string | null) ?? null;
  if (!sesionId) return;

  const { data: sesion } = await admin.from('sesiones').select('instructor_id')
    .eq('id', sesionId).maybeSingle();
  const instructorId = (sesion?.instructor_id as string | null) ?? null;
  if (!instructorId) return;

  // Mismo criterio que generarLiquidacionBorrador: el periodo de una
  // penalización es el mes en que se COBRÓ, no el de la clase.
  const procesadaEn = pen.procesada_en as string | null;
  if (!procesadaEn) return;
  const fecha = new Date(procesadaEn);
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth() + 1;

  await admin.from('liquidaciones_instructoras')
    .update({
      requiere_revision: true,
      revision_motivo: `Una penalización de ${Number(pen.importe).toFixed(2)}€ ya repartida aquí se ha reembolsado a la socia.`,
    })
    .eq('studio_id', studioId).eq('instructor_id', instructorId)
    .eq('periodo_anio', anio).eq('periodo_mes', mes).eq('estado', 'CONFIRMADA');
}
