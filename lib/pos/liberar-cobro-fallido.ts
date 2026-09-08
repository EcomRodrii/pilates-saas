import type { SupabaseClient } from '@supabase/supabase-js';

// P-2 (27ª pasada de auditoría): un cobro POS (Bizum o datáfono) que Stripe da
// por RECHAZADO/CANCELADO/EXPIRADO tiene que soltar lo que reservó, aunque
// nadie esté mirando el mostrador. Antes el ÚNICO que anulaba la venta y
// devolvía el stock era el sondeo del navegador
// (`app/api/pos/venta/confirmar`), que muere a los 90s — sin conciliador que
// cubra `ventas_pos`/`recibos` pendientes de un pago que Stripe ya dio por
// fallido. Llamada desde el webhook en `payment_intent.payment_failed`
// (tarjeta/Bizum rechazados) y `checkout.session.expired` (nadie pagó).
//
// El estudio y el tenant se resuelven FUERA de esta función (en el webhook,
// por la cuenta Connect que firma — nunca por la metadata a secas, mismo
// criterio D-3 de la 22ª pasada): aquí solo se actúa, ya con el `studioId`
// verificado.
//
// Idempotente por partida doble:
//   · `fallar_pago_venta_pos` solo actúa sobre PENDIENTE_PAGO — si el
//     mostrador ya la anuló (cancelar() ya expiró la sesión y el sondeo
//     síncrono ya la cerró antes de que este evento llegara), no hace nada de
//     más.
//   · El UPDATE de `recibos` va acotado a la referencia exacta (cuando se
//     conoce) para no pisar un reintento más nuevo que haya llegado entre
//     medias.
export type MetadataCobroPos = { ventaId?: string; reciboId?: string } | undefined;

export async function liberarCobroPosFallido(
  admin: SupabaseClient,
  p: {
    studioId: string;
    metadata: MetadataCobroPos;
    /** El PaymentIntent al que se acota el UPDATE de `recibos`. `null` = sin acotar (venía sin PI resoluble). */
    paymentIntentId: string | null;
    motivo: string;
  },
): Promise<{ tipo: 'venta' | 'recibo' | 'ninguno' }> {
  const ventaId = p.metadata?.ventaId;
  if (ventaId) {
    await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: ventaId, p_studio_id: p.studioId, p_pago_estado: 'ERROR', p_motivo: p.motivo,
    });
    return { tipo: 'venta' };
  }

  const reciboId = p.metadata?.reciboId;
  if (reciboId) {
    const cambios = { cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null };
    if (p.paymentIntentId) {
      await admin.from('recibos').update(cambios)
        .eq('id', reciboId).eq('studio_id', p.studioId).eq('cobro_mostrador_pi', p.paymentIntentId);
    } else {
      await admin.from('recibos').update(cambios)
        .eq('id', reciboId).eq('studio_id', p.studioId);
    }
    return { tipo: 'recibo' };
  }

  return { tipo: 'ninguno' };
}
