import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { contextoCobroDe, proveedorPara } from '@/lib/pos/terminal';
import { confirmarCobroRecibo } from '@/lib/billing/confirmar-cobro';
import type { EstadoPagoPOS } from '@/lib/pos/tipos';
import type { MetodoPago } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Ha pasado ya la tarjeta? Lo pregunta el mostrador y lo responde STRIPE.
//
// Nada de lo que devuelve esta ruta sale de lo que diga el navegador. Llega un
// id de recibo; el servidor lee el PaymentIntent y decide.
//
// ─── Dos comprobaciones, y las dos importan ──────────────────────────────────
//
// 1. **La metadata.** La referencia del cobro vive en `recibos.cobro_mostrador_pi`,
//    y `recibos` tiene GRANT de UPDATE a `authenticated` — un REVOKE por columna
//    NO resta de un grant de tabla, así que el cliente puede escribirla. Sin
//    comprobar que el PaymentIntent dice ser de ESTE recibo y de ESTE estudio,
//    se podría apuntar un recibo al cobro que ya pagó otro del mismo importe y
//    cerrar los dos con un solo pago.
//
// 2. **El importe.** Lo que Stripe dice haber cobrado tiene que ser lo que pone
//    el recibo. Es el mismo guardia que `IMPORTE_NO_COINCIDE` en las ventas.
//
// Si alguna falla NO se cierra nada y se avisa: un recibo cerrado por error es
// dinero que el estudio cree tener.
//
// El cierre en sí lo hace `confirmarCobroRecibo` —el punto único que comparten
// el webhook y el conciliador—, no una copia local.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as
    { reciboId?: unknown; metodo?: unknown; accion?: unknown } | null;
  const reciboId = typeof body?.reciboId === 'string' ? body.reciboId : '';
  const metodo = String(body?.metodo ?? 'DATAFONO') as MetodoPago;
  const accion = body?.accion === 'cancelar' ? 'cancelar' : 'consultar';
  if (!reciboId) return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });

  const { data: recibo } = await admin.from('recibos')
    .select('id, importe, estado, cobro_mostrador_pi')
    .eq('id', reciboId).eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!recibo) return NextResponse.json({ error: 'No encontramos ese recibo' }, { status: 404 });

  const responder = (pagoEstado: EstadoPagoPOS, extra: Record<string, unknown> = {}) =>
    NextResponse.json({ reciboId, estado: recibo.estado, pagoEstado, importe: Number(recibo.importe), ...extra });

  // Ya cerrado por el otro camino (el webhook llegó antes).
  if (recibo.estado === 'COBRADO') return responder('PAGADO', { cobrado: true });

  if (!recibo.cobro_mostrador_pi) {
    return responder('ERROR', { motivo: 'Ese cobro no llegó a iniciarse.' });
  }

  const ctx = await contextoCobroDe(admin, sesion.studioId);
  if (!ctx.ok) {
    // No se puede PREGUNTAR. Eso no es «no pagado»: no se toca nada y el
    // mostrador ve que seguimos sin saberlo.
    return responder('PROCESANDO', { aviso: ctx.motivo });
  }

  const prov = proveedorPara(metodo, { readerId: ctx.readerId, origen: req.nextUrl.origin });

  try {
    if (accion === 'cancelar') await prov.cancelar(ctx.ctx, recibo.cobro_mostrador_pi);

    const est = await prov.consultar(ctx.ctx, recibo.cobro_mostrador_pi);

    if (est.estado === 'PAGADO') {
      // ── Comprobación 1: ¿este cobro es de ESTE recibo? ──────────────────
      const meta = est.metadata ?? {};
      if (meta.reciboId !== reciboId || meta.studioId !== sesion.studioId) {
        Sentry.captureMessage('[pos/recibo] PaymentIntent que no corresponde al recibo', {
          level: 'error', tags: { area: 'cobros' },
          extra: { reciboId, studioId: sesion.studioId, pi: recibo.cobro_mostrador_pi, meta },
        });
        return responder('ERROR', {
          motivo: 'Ese cobro no corresponde a este recibo. No lo damos por bueno; revísalo.',
        });
      }

      // ── Comprobación 2: ¿el importe es el del recibo? ───────────────────
      const esperado = Math.round(Number(recibo.importe) * 100);
      if (est.importeCentimos != null && est.importeCentimos !== esperado) {
        Sentry.captureMessage('[pos/recibo] el importe cobrado no coincide con el recibo', {
          level: 'error', tags: { area: 'cobros' },
          extra: { reciboId, esperado, cobrado: est.importeCentimos },
        });
        return responder('ERROR', {
          motivo: `Se han cobrado ${(est.importeCentimos / 100).toFixed(2)} € pero el recibo son ${Number(recibo.importe).toFixed(2)} €. No lo damos por bueno; revísalo.`,
        });
      }

      const res = await confirmarCobroRecibo(admin, {
        studioId: sesion.studioId,
        reciboId,
        // DATAFONO no existe en el CHECK de `recibos.metodo_cobro` (es de la
        // migración 0100, anterior al TPV): un cobro por datáfono es una
        // tarjeta, y así se registra.
        metodoCobro: metodo === 'DATAFONO' ? 'TARJETA' : metodo,
        paymentIntentId: recibo.cobro_mostrador_pi,
        fuente: 'tpv',
      });
      if (!res.ok) {
        return errorInterno('[pos/recibo] cobro bueno sin poder cerrarlo', res.error,
          'El cobro salió bien pero no hemos podido cerrarlo. Avísanos antes de volver a cobrar.');
      }

      // El dinero pasó por el mostrador: que cuadre el arqueo. Idempotente por
      // id derivado del recibo, así que el webhook llegando también no duplica.
      await admin.rpc('apuntar_cobro_en_caja', {
        p_studio_id: sesion.studioId, p_recibo_id: reciboId,
        p_por: sesion.userId, p_por_nombre: sesion.nombre,
      });

      await admin.from('recibos').update({ cobro_mostrador_pi: null })
        .eq('id', reciboId).eq('studio_id', sesion.studioId);

      return responder('PAGADO', { cobrado: true, yaEstaba: !res.actualizado });
    }

    if (est.estado === 'PROCESANDO' || est.estado === 'PENDIENTE') {
      return responder(est.estado);
    }

    // RECHAZADO / CANCELADO / EXPIRADO / ERROR. El recibo NO se toca: sigue
    // pendiente, que es la verdad. Solo se suelta la referencia para que el
    // siguiente intento empiece limpio.
    await admin.from('recibos').update({ cobro_mostrador_pi: null })
      .eq('id', reciboId).eq('studio_id', sesion.studioId);
    return responder(est.estado, { motivo: est.error ?? null });
  } catch (e) {
    return errorInterno('[pos/recibo] excepción al confirmar', e, 'No hemos podido comprobar el cobro.');
  }
}
