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

  await pedirRevisionLiquidacionPenalizacion(admin, studioId, pen as PenalizacionRepartida,
    `Una penalización de ${Number(pen.importe).toFixed(2)}€ ya repartida aquí se ha reembolsado a la socia.`);
}

export interface PenalizacionRepartida { reserva_id: string; importe: number | string | null; procesada_en: string | null }

/**
 * Marca para revisión la liquidación CONFIRMADA que ya repartió esta
 * penalización (nunca una PAGADA: eso es un ajuste manual). `pen` son los datos
 * de cuando estaba COBRADA: su `procesada_en` decide el periodo. `false` solo si
 * la escritura de la liquidación dio error; sin instructora o sin periodo no hay
 * nada que revisar.
 */
export async function pedirRevisionLiquidacionPenalizacion(
  admin: SupabaseClient, studioId: string, pen: PenalizacionRepartida, motivo: string,
): Promise<boolean> {
  const { data: reserva } = await admin.from('reservas').select('sesion_id')
    .eq('id', pen.reserva_id).maybeSingle();
  const sesionId = (reserva?.sesion_id as string | null) ?? null;
  if (!sesionId) return true;

  const { data: sesion } = await admin.from('sesiones').select('instructor_id')
    .eq('id', sesionId).maybeSingle();
  const instructorId = (sesion?.instructor_id as string | null) ?? null;
  if (!instructorId) return true;

  // Mismo criterio que generarLiquidacionBorrador: el periodo de una
  // penalización es el mes en que se COBRÓ, no el de la clase.
  if (!pen.procesada_en) return true;
  const fecha = new Date(pen.procesada_en);
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth() + 1;

  const { error } = await admin.from('liquidaciones_instructoras')
    .update({ requiere_revision: true, revision_motivo: motivo })
    .eq('studio_id', studioId).eq('instructor_id', instructorId)
    .eq('periodo_anio', anio).eq('periodo_mes', mes).eq('estado', 'CONFIRMADA');
  if (error) console.error('[liquidacion] no se pudo pedir la revisión de la liquidación', studioId, error.message);
  return !error;
}
