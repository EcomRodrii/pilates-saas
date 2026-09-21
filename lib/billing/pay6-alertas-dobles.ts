import { SupabaseClient } from '@supabase/supabase-js';

export async function emitirAlertaDobleCobroDetectado(
  admin: SupabaseClient,
  params: {
    studioId: string;
    reciboId: string;
    paymentIntentIds: string[];
    tipo: 'multiple_intent_ids' | 'multiples_por_timestamp';
  }
): Promise<void> {
  try {
    // Insertar alerta de doble cobro
    await admin
      .from('dobles_cobros_detectados')
      .insert({
        studio_id: params.studioId,
        recibo_id: params.reciboId,
        payment_intent_ids: params.paymentIntentIds,
        tipo: params.tipo,
        estado: 'DETECTADA',
        notas: `Detectado: ${params.paymentIntentIds.length} payment_intent_ids distintos`,
      });

    // Emitir evento de notificación (reutilizar infraestructura existente)
    const { data: notification } = await admin
      .from('notifications')
      .insert({
        studio_id: params.studioId,
        tipo_evento: 'DOBLE_COBRO_DETECTADO',
        categoria: 'alertas',
        canales: ['PUSH'], // Solo push, no email aún
        destinatarios_rol: 'PROPIETARIO',
        payload: {
          recibo_id: params.reciboId,
          intents: params.paymentIntentIds,
          detalle: `Posible doble cobro: ${params.paymentIntentIds.length} intentos en el mismo recibo`,
        },
      })
      .select('id')
      .single();

    if (!notification) {
      console.warn(
        `[PAY-6] No se creó notificación de doble cobro para recibo ${params.reciboId}`
      );
    }
  } catch (err) {
    // Log pero no falla la cadena
    console.error('[PAY-6] Error emitiendo alerta de doble cobro:', err);
  }
}
