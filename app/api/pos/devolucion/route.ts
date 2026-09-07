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

  // ── 1. Calcular cuánto toca devolver, SIN escribir todavía ───────────────
  // Se hace en una transacción que se deshace, para saber el importe exacto
  // antes de mover dinero en Stripe. La RPC es la única que sabe prorratear el
  // descuento y el redondeo por línea; recalcularlo aquí sería una segunda
  // implementación que se desviaría.
  const { data: previo, error: errPrevio } = await admin.rpc('devolver_venta_pos', {
    p_devolucion_id: devolucionId, p_venta_id: ventaId, p_studio_id: sesion.studioId,
    p_lineas: lineas, p_motivo: motivo, p_caja_id: caja?.id ?? null,
    p_por: sesion.userId, p_por_nombre: sesion.nombre,
  });

  if (errPrevio) {
    const codigo = codigoDeErrorPg(errPrevio.message);
    const frase = mensajeErrorVenta(codigo);
    if (codigo && frase !== 'No se ha podido completar la operación. Inténtalo de nuevo.') {
      return NextResponse.json({ error: frase, codigo }, { status: 409 });
    }
    return errorInterno('pos:devolucion', errPrevio, 'No se ha podido registrar la devolución.');
  }

  const fila = Array.isArray(previo) ? previo[0] : previo;
  const importe = Number(fila?.r_importe_devuelto ?? 0);
  const esTotal = fila?.r_es_total === true;

  // ── 2. Dinero de vuelta ──────────────────────────────────────────────────
  const porStripe = Boolean(venta.stripe_payment_intent_id)
    && (venta.metodo_pago === 'DATAFONO' || venta.metodo_pago === 'BIZUM' || venta.metodo_pago === 'TARJETA');

  if (porStripe && importe > 0) {
    const ctx = await contextoCobroDe(admin, sesion.studioId);
    if (!ctx.ok) {
      // El libro ya se escribió arriba. No se puede devolver el dinero ahora
      // mismo, y hay que decirlo con claridad en vez de fingir que salió bien.
      Sentry.captureMessage('[pos] devolución registrada sin poder reembolsar en Stripe', {
        level: 'error', tags: { area: 'cobros' },
        extra: { ventaId, importe, motivo: ctx.motivo },
      });
      return NextResponse.json({
        error: `Hemos apuntado la devolución de ${importe.toFixed(2)} €, pero no hemos podido devolver el dinero: ${ctx.motivo}`,
        importe, esTotal, dineroDevuelto: false,
      }, { status: 502 });
    }
    try {
      await ctx.ctx.stripe.refunds.create({
        payment_intent: venta.stripe_payment_intent_id!,
        amount: Math.round(importe * 100),
        // Un doble clic no puede devolver dos veces. La clave lleva el id de la
        // devolución, que es distinto en cada parcial legítima.
        metadata: { studioId: sesion.studioId, ventaId, devolucionId, origen: 'pos_devolucion' },
      }, { stripeAccount: ctx.ctx.stripeAccount, idempotencyKey: `pos-devol-${devolucionId}` });
    } catch (err) {
      const msg = err instanceof Stripe.errors.StripeError ? err.message : String(err);
      Sentry.captureException(err instanceof Error ? err : new Error('Fallo al reembolsar venta POS'), {
        level: 'error', tags: { area: 'cobros' },
        extra: { ventaId, devolucionId, importe, studioId: sesion.studioId },
      });
      return NextResponse.json({
        error: `Hemos apuntado la devolución de ${importe.toFixed(2)} €, pero Stripe no la ha completado: ${msg}`,
        importe, esTotal, dineroDevuelto: false,
      }, { status: 502 });
    }
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
