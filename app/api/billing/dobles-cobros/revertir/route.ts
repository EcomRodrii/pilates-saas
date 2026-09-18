/**
 * POST /api/billing/dobles-cobros/revertir
 * 
 * Revierte un doble cobro detectado:
 * 1. Crea un crédito de bono O hace un refund en Stripe
 * 2. Marca como RESUELTO en la tabla dobles_cobros_detectados
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseClient, getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVerEstudio } from '@/lib/permisos-reglas';
import {
  crearCreditoAlSocio,
  crearRefundEnStripe,
  marcarDobleCobroResuelto,
} from '@/lib/billing/revertir-doble-cobro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const sesion = await getSupabaseClient();
    if (!sesion?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      dobleCobroId,
      tipo,
      notas,
    } = body;

    if (!dobleCobroId || !['credito', 'refund'].includes(tipo)) {
      return NextResponse.json(
        { error: 'Parámetros inválidos: dobleCobroId y tipo (credito|refund) requeridos' },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Servicio no configurado' }, { status: 500 });
    }

    const { data: dobleCobroDB, error: readError } = await admin
      .from('dobles_cobros_detectados')
      .select(
        `
        id,
        studio_id,
        recibo_id,
        importe_centimos,
        estado,
        payment_intent_ids,
        metadata
      `,
      )
      .eq('id', dobleCobroId)
      .single();

    if (readError || !dobleCobroDB) {
      return NextResponse.json({ error: 'Doble cobro no encontrado' }, { status: 404 });
    }

    const perm = await puedeVerEstudio(sesion.user.id, dobleCobroDB.studio_id);
    if (!perm || !perm.puedeMoverDinero) {
      return NextResponse.json({ error: 'No tienes permiso para resolver dobles cobros' }, { status: 403 });
    }

    if (dobleCobroDB.estado === 'RESUELTO') {
      return NextResponse.json(
        { error: 'Este doble cobro ya está resuelto' },
        { status: 400 },
      );
    }

    const { data: recibo, error: reciboError } = await admin
      .from('recibos')
      .select('socio_id')
      .eq('id', dobleCobroDB.recibo_id)
      .eq('studio_id', dobleCobroDB.studio_id)
      .single();

    if (reciboError || !recibo) {
      return NextResponse.json(
        { error: 'Recibo no encontrado o no pertenece a este estudio' },
        { status: 404 },
      );
    }

    const socioId = recibo.socio_id;
    let creditoId: string | undefined;
    let refundId: string | undefined;
    let error: string | undefined;

    if (tipo === 'credito') {
      const resultado = await crearCreditoAlSocio(admin, {
        studioId: dobleCobroDB.studio_id,
        socioId,
        importeCentimos: dobleCobroDB.importe_centimos,
        motivo: 'Doble cobro detectado',
      });

      if (resultado.error) {
        error = resultado.error;
      } else {
        creditoId = resultado.creditoId;
      }
    } else if (tipo === 'refund') {
      const paymentIntentId = Array.isArray(dobleCobroDB.payment_intent_ids)
        ? dobleCobroDB.payment_intent_ids[0]
        : dobleCobroDB.payment_intent_ids;

      if (!paymentIntentId) {
        error = 'No hay payment_intent_id para crear refund';
      } else {
        const resultado = await crearRefundEnStripe(stripe, {
          paymentIntentId,
          importeCentimos: dobleCobroDB.importe_centimos,
          metadata: {
            doble_cobro_detectado_id: dobleCobroId,
            studio_id: dobleCobroDB.studio_id,
            socio_id: socioId,
          },
        });

        if (resultado.error) {
          error = resultado.error;
        } else {
          refundId = resultado.refundId;
        }
      }
    }

    if (error) {
      return NextResponse.json(
        { ok: false, error, dobleCobroId },
        { status: 400 },
      );
    }

    const markResult = await marcarDobleCobroResuelto(admin, {
      dobleCobroId,
      tipo: tipo as 'credito' | 'refund',
      creditoId,
      refundId,
      notas,
      revisadoPor: sesion.user.email ?? sesion.user.id,
    });

    if (!markResult.ok) {
      return NextResponse.json(
        { ok: false, error: markResult.error, dobleCobroId },
        { status: 500 },
      );
    }

    const importeEur = dobleCobroDB.importe_centimos / 100;
    const mensajeFinalizacion =
      tipo === 'credito'
        ? `Crédito de €${importeEur.toFixed(2)} creado para la socia`
        : `Refund de €${importeEur.toFixed(2)} en proceso en Stripe`;

    return NextResponse.json({
      ok: true,
      dobleCobroId,
      tipo,
      importeEur,
      creditoId,
      refundId,
      mensaje: mensajeFinalizacion,
    });
  } catch (err) {
    console.error('[revertir doble cobro]', err);
    return NextResponse.json(
      { error: 'Error al revertir doble cobro', details: err instanceof Error ? err.message : undefined },
      { status: 500 },
    );
  }
}
