import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { uid } from '@/lib/utils';
import { contextoCobroDe } from '@/lib/pos/terminal';
import { revertirCreditosVentaPOS } from '@/lib/pos/venta-servidor';
import { registrarDevolucion } from '@/lib/billing/registrar-devolucion';
import { mensajeErrorVenta, codigoDeErrorPg } from '@/lib/pos/tipos';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Devolver una venta, entera o en parte.
//
// La venta original NUNCA se borra ni se edita: se marca cuánto se ha devuelto
// de cada línea y se deja el rastro. Un registro financiero con factura sellada
// detrás no se borra.
//
// ─── El orden: primero el dinero, después el libro ────────────────────────
// Para cobros con tarjeta/Bizum se reembolsa en Stripe ANTES de tocar nada
// nuestro. Si el reembolso falla, no se ha escrito nada y se puede reintentar
// limpiamente.
//
// Si falla AL REVÉS —Stripe devuelve el dinero y nuestro registro no se
// escribe— NO se responde error: el dinero ya salió y decirle a quien está en
// el mostrador que "no se pudo" le haría intentarlo otra vez y devolver dos
// veces. Se reporta a Sentry y el webhook `charge.refunded` acaba escribiendo
// la fila de `devoluciones` por su cuenta. Es el mismo criterio que ya usa
// /api/reembolsos.
//
// ─── Lo que NO hace ───────────────────────────────────────────────────────
// No emite factura rectificativa. Esa decisión necesita criterio de gestoría
// (qué tipo R1–R5, por sustitución o por diferencia) y ya tiene su sitio en
// /api/facturas/rectificar, con una persona delante.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'pos-devolucion', { max: 20, windowSeconds: 60 });
  if (limitado) return limitado;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede hacer devoluciones' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const ventaId = typeof body?.ventaId === 'string' ? body.ventaId : null;
  if (!ventaId) return NextResponse.json({ error: 'Falta la venta' }, { status: 400 });
  const motivo = typeof body?.motivo === 'string' ? body.motivo.slice(0, 200) : null;

  // Líneas explícitas para una devolución parcial; sin ellas, se devuelve todo
  // lo que quede pendiente.
  let lineas: { lineaId: string; cantidad: number }[] | null = null;
  if (Array.isArray(body?.lineas) && body.lineas.length > 0) {
    lineas = [];
    for (const raw of body.lineas as unknown[]) {
      const l = raw as Record<string, unknown>;
      const lineaId = typeof l?.lineaId === 'string' ? l.lineaId : '';
      const cantidad = Number(l?.cantidad ?? 0);
      if (!lineaId || !Number.isInteger(cantidad) || cantidad <= 0) {
        return NextResponse.json({ error: 'Línea de devolución no válida.' }, { status: 400 });
      }
      lineas.push({ lineaId, cantidad });
    }
  }

  const { data: venta } = await admin.from('ventas_pos')
    .select('id, estado, total, importe_devuelto, metodo_pago, stripe_payment_intent_id, socio_id, numero')
    .eq('id', ventaId).eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!venta) return NextResponse.json({ error: 'No encontramos esa venta' }, { status: 404 });
  if (venta.estado !== 'PAGADA') {
    return NextResponse.json({ error: 'Esa venta no está cobrada, así que no hay nada que devolver.' }, { status: 409 });
  }

  const { data: caja } = await admin.from('cajas')
    .select('id').eq('studio_id', sesion.studioId).eq('estado', 'ABIERTA').maybeSingle();

  const devolucionId = `dev-${uid()}`;
  const porStripe = Boolean(venta.stripe_payment_intent_id)
    && (venta.metodo_pago === 'DATAFONO' || venta.metodo_pago === 'BIZUM' || venta.metodo_pago === 'TARJETA');

  const traducirFallo = (e: { message: string }, contexto: string) => {
    const codigo = codigoDeErrorPg(e.message);
    const frase = mensajeErrorVenta(codigo);
    if (codigo && frase !== 'No se ha podido completar la operación. Inténtalo de nuevo.') {
      return NextResponse.json({ error: frase, codigo }, { status: 409 });
    }
    return errorInterno(contexto, e, 'No se ha podido registrar la devolución.');
  };

  // ── 1. PRE-VUELO: cuánto toca devolver, sin escribir nada ────────────────
  // `p_simular` calcula y vuelve antes de tocar una sola fila. Hace falta el
  // importe exacto ANTES de mover dinero en Stripe, y el prorrateo del
  // descuento y el redondeo por línea viven en la RPC — replicarlos aquí sería
  // una segunda implementación que se desviaría.
  const { data: previo, error: errPrevio } = await admin.rpc('devolver_venta_pos', {
    p_devolucion_id: devolucionId, p_venta_id: ventaId, p_studio_id: sesion.studioId,
    p_lineas: lineas, p_motivo: motivo, p_caja_id: caja?.id ?? null,
    p_por: sesion.userId, p_por_nombre: sesion.nombre, p_simular: true,
  });
  if (errPrevio) return traducirFallo(errPrevio, 'pos:devolucion:previo');

  const filaPrevia = Array.isArray(previo) ? previo[0] : previo;
  const importe = Number(filaPrevia?.r_importe_devuelto ?? 0);

  // ── 2. Dinero de vuelta, ANTES del libro ─────────────────────────────────
  // Este orden importa. Al revés, un fallo de Stripe dejaba a la clienta sin
  // bono y sin dinero, y el reintento era imposible: la segunda llamada chocaba
  // con DEVOLUCION_EXCEDE porque el libro ya se había escrito. Así, si el
  // reembolso no sale, no se ha tocado nada y se puede repetir.
  if (porStripe && importe > 0) {
    const ctx = await contextoCobroDe(admin, sesion.studioId);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.motivo, importe, dineroDevuelto: false }, { status: ctx.status });
    }
    try {
      await ctx.ctx.stripe.refunds.create({
        payment_intent: venta.stripe_payment_intent_id!,
        amount: Math.round(importe * 100),
        metadata: { studioId: sesion.studioId, ventaId, devolucionId, origen: 'pos_devolucion' },
        // Un doble clic no puede devolver dos veces. La clave lleva el id de la
        // devolución, distinto en cada parcial legítima.
      }, { stripeAccount: ctx.ctx.stripeAccount, idempotencyKey: `pos-devol-${devolucionId}` });
    } catch (err) {
      const msg = err instanceof Stripe.errors.StripeError ? err.message : String(err);
      Sentry.captureException(err instanceof Error ? err : new Error('Fallo al reembolsar venta POS'), {
        level: 'error', tags: { area: 'cobros' },
        extra: { ventaId, devolucionId, importe, studioId: sesion.studioId },
      });
      // Nada escrito: se puede reintentar tal cual.
      return NextResponse.json({
        error: `No se ha podido devolver el dinero: ${msg}. No se ha apuntado nada, puedes volver a intentarlo.`,
        importe, dineroDevuelto: false,
      }, { status: 502 });
    }
  }

  // ── 3. El libro: cantidades, stock, bono y caja ──────────────────────────
  const { data: aplicado, error: errAplicar } = await admin.rpc('devolver_venta_pos', {
    p_devolucion_id: devolucionId, p_venta_id: ventaId, p_studio_id: sesion.studioId,
    p_lineas: lineas, p_motivo: motivo, p_caja_id: caja?.id ?? null,
    p_por: sesion.userId, p_por_nombre: sesion.nombre, p_simular: false,
  });
  if (errAplicar) {
    // El dinero YA salió (si era por Stripe). Responder error aquí haría que
    // alguien lo reintentara y devolviera dos veces. Se avisa a gritos y se
    // sigue: el webhook `charge.refunded` acaba escribiendo la fila de
    // `devoluciones` por su cuenta. Mismo criterio que /api/reembolsos.
    Sentry.captureException(new Error('Devolución cobrada en Stripe pero sin registrar en el libro'), {
      level: 'error', tags: { area: 'cobros' },
      extra: { ventaId, devolucionId, importe, studioId: sesion.studioId, detalle: errAplicar.message },
    });
    if (!porStripe) return traducirFallo(errAplicar, 'pos:devolucion');
  }

  const fila = Array.isArray(aplicado) ? aplicado[0] : aplicado;
  const esTotal = fila?.r_es_total === true;

  // ── 4. Fila de auditoría del canal EFECTIVO ──────────────────────────────
  // Para tarjeta y Bizum la escribe el webhook `charge.refunded`
  // (`procesarReembolsoVentaPos`), idempotente por charge. El efectivo no pasa
  // por Stripe, así que si no se escribe aquí «la tabla única de reembolsos de
  // cualquier canal» se queda justo sin ese canal.
  if (!porStripe && importe > 0) {
    await registrarDevolucion(admin, {
      studioId: sesion.studioId,
      ventaPosId: ventaId,
      origen: esTotal ? 'REEMBOLSO_TOTAL' : 'REEMBOLSO_PARCIAL',
      devueltoCentimos: Math.round((Number(venta.importe_devuelto ?? 0) + importe) * 100),
      referencia: `pos-efectivo:${devolucionId}`,
      stripeChargeId: null,
    });
  }

  // ── 3. Créditos de gamificación ──────────────────────────────────────────
  // Solo al devolver la venta ENTERA. Retirar créditos proporcionales a una
  // devolución parcial sería un cálculo que la socia no puede seguir; y comprar
  // y devolver del todo no puede ser una máquina de fabricar créditos.
  let creditosRetirados = 0;
  if (esTotal) {
    creditosRetirados = await revertirCreditosVentaPOS(admin, {
      studioId: sesion.studioId, ventaId, socioId: venta.socio_id ?? null,
    });
  }

  return NextResponse.json({
    ok: true, devolucionId, importe, esTotal,
    dineroDevuelto: true,
    creditosRetirados,
    // El efectivo sale del cajón a mano: el libro ya lo apuntó, pero quien
    // cobra tiene que sacarlo físicamente.
    enEfectivo: !porStripe,
  });
}
