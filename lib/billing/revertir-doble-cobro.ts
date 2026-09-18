/**
 * PAY-8: Lógica de reversión de dobles cobros
 * 
 * Opciones:
 * 1. Crear crédito (suma a sus bonos como suscripción nueva)
 * 2. Reembolso a tarjeta (dispara Stripe refund)
 * 
 * Ambos caminos actualizan dobles_cobros_detectados a RESUELTO
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export interface DatosReversion {
  dobleCobroId: string;
  studioId: string;
  socioId: string;
  reciboId: string;
  importeCentimos: number;
  paymentIntentId: string;
  tipo: 'credito' | 'refund';
  notas?: string;
  revisadoPor: string;
}

export interface ResultadoReversion {
  ok: boolean;
  dobleCobroId: string;
  tipo: string;
  importeEur: number;
  mensaje: string;
  refundId?: string;
  creditoId?: string;
  error?: string;
}

/**
 * Crear un crédito de bono para la socia
 * Inserta una suscripción de tipo BONO con un único session y la cantidad
 */
export async function crearCreditoAlSocio(
  admin: SupabaseClient,
  params: {
    studioId: string;
    socioId: string;
    importeCentimos: number;
    motivo: string;
  },
): Promise<{ creditoId: string; error?: string }> {
  const { studioId, socioId, importeCentimos, motivo } = params;
  const importeEur = importeCentimos / 100;

  try {
    // Obtener un plan de bono del estudio (o el primero disponible)
    // El crédito será una suscripción de tipo BONO con sesiones = importe/precio_clase
    // Para simplificar, usamos sesiones = 1 y solo se podrá usar para 1 clase (aproximadamente)
    const { data: plan, error: planError } = await admin
      .from('planes_tarifa')
      .select('id, precio_default, studio_id')
      .eq('studio_id', studioId)
      .eq('tipo', 'BONO')
      .limit(1)
      .single();

    if (planError || !plan) {
      return {
        creditoId: '',
        error: `No hay plan de bono disponible para crear crédito: ${planError?.message}`,
      };
    }

    // Calcular sesiones: importeEur / precio_default, redondeando a la baja
    const sesiones = Math.floor(importeEur / (plan.precio_default || 30));
    if (sesiones < 1) {
      return {
        creditoId: '',
        error: `Importe insuficiente para 1 sesión (min ${plan.precio_default || 30} EUR)`,
      };
    }

    // Insertar suscripción de crédito
    const { data: suscripcion, error } = await admin
      .from('suscripciones')
      .insert({
        studio_id: studioId,
        socio_id: socioId,
        plan_id: plan.id,
        estado: 'activa',
        subscription_status: 'active', // Stripe field, pero en este caso es crédito local
        sesiones_restantes: sesiones,
        // Sin fecha de vencimiento (válido para siempre)
        creado_en: new Date().toISOString(),
        notas: `Crédito por ${motivo} - ${importeEur} EUR`,
      })
      .select('id')
      .single();

    if (error || !suscripcion) {
      return {
        creditoId: '',
        error: `Error al crear crédito: ${error?.message}`,
      };
    }

    return { creditoId: suscripcion.id };
  } catch (err) {
    return {
      creditoId: '',
      error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Crear refund en Stripe
 */
export async function crearRefundEnStripe(
  stripe: Stripe,
  params: {
    paymentIntentId: string;
    importeCentimos: number;
    metadata: Record<string, string>;
  },
): Promise<{ refundId: string; error?: string }> {
  const { paymentIntentId, importeCentimos, metadata } = params;

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: importeCentimos, // ya está en centimos
      metadata,
    });

    return { refundId: refund.id };
  } catch (err) {
    return {
      refundId: '',
      error: `Error Stripe: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Marcar doble cobro como resuelto
 */
export async function marcarDobleCobroResuelto(
  admin: SupabaseClient,
  params: {
    dobleCobroId: string;
    tipo: 'credito' | 'refund';
    creditoId?: string;
    refundId?: string;
    notas?: string;
    revisadoPor: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { dobleCobroId, tipo, creditoId, refundId, notas, revisadoPor } = params;

  try {
    const payload: Record<string, unknown> = {
      estado: 'RESUELTO',
      resuelto_en: new Date().toISOString(),
      revisado_por: revisadoPor,
      actualizado_en: new Date().toISOString(),
    };

    if (notas) {
      payload.notas = notas;
    }

    if (tipo === 'credito' && creditoId) {
      payload.metadata = {
        tipo_resolucion: 'credito',
        credito_id: creditoId,
      };
    } else if (tipo === 'refund' && refundId) {
      payload.metadata = {
        tipo_resolucion: 'refund',
        refund_id: refundId,
      };
    }

    const { error } = await admin
      .from('dobles_cobros_detectados')
      .update(payload)
      .eq('id', dobleCobroId);

    if (error) {
      return { ok: false, error: `Error al actualizar: ${error.message}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
