import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fallarWebhookEvent, reclamarOperacion } from '@/lib/webhook-idempotencia';
import {
  centimosDevueltosSumup, centimosSinPropina, decidirDevolucionSumup, ErrorSumup, leerReferenciaSumup, tieneContracargo,
} from './sumup.ts';
import { cuentaSumupDelEstudio } from './cobro-del-estudio.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Devolver en SumUp (parte o toda) una venta de la Caja cobrada con su datáfono.
//
// Con Stripe, una clave de idempotencia impide devolver dos veces y su aviso
// `charge.refunded` repara el libro si el apunte falla. SumUp no tiene ninguna de
// las dos cosas, así que aquí se hacen a mano:
//
//  · CANDADO por venta y por lo devuelto hasta ahora (`sumup-devol:<venta>:<céntimos>`,
//    la tabla que reclama los avisos), que falla CERRADO: dos toques a la vez no
//    devuelven dos veces. Lo suelta quien llama: completado al apuntar, fallido si
//    no se movió dinero (o si salió y el apunte falló: el reintento lo concilia).
//  · Antes de devolver, lo que SumUp tiene YA devuelto frente a lo apuntado
//    (`decidirDevolucionSumup`). Si un intento NUESTRO anterior devolvió y no se
//    apuntó, ahora solo se apunta; si lo devolvieron desde la app de SumUp, solo se
//    apunta cuando quien está en el mostrador lo confirma («Apuntar sin devolver»).
//  · Sin los eventos de la transacción, o con un contracargo, no se toca nada.
//
// ⚠️ Límite conocido: una devolución que SumUp deja PENDIENTE y después FALLA queda
// apuntada como devuelta (se cuenta al pedirla, que es lo seguro para no repetirla).
// Nadie la vuelve a mirar: si pasa, se corrige a mano.
//
// La ruta (/api/pos/devolucion) comprueba el rol; aquí se da por hecho.
// ─────────────────────────────────────────────────────────────────────────────

const EXPIRA_CANDADO_SEGUNDOS = 15 * 60;

/** La venta YA estaba devuelta en SumUp y aquí no: se puede apuntar sin devolver (`soloApuntar`). */
export const CODIGO_SUMUP_YA_DEVUELTO = 'SUMUP_YA_DEVUELTO';

export type DevolucionSumup =
  | { ok: true; transaccionId: string; yaEstaba: boolean; candado: string }
  | { ok: false; status: number; error: string; codigo?: string };

const euros = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`;

export async function devolverEnSumup(admin: SupabaseClient, p: {
  studioId: string;
  ventaId: string;
  /** La referencia guardada de la venta (`sumup:<epoch>:<client_transaction_id>`). */
  referencia: string;
  /** Total de la venta, en céntimos: lo que cobró SumUp sin propina. Si no cuadra, no es esta transacción. */
  totalVenta: number;
  /** Lo que el libro de la venta tiene ya devuelto, en céntimos. */
  devueltoLibro: number;
  /** Lo que se va a devolver ahora (lo calculó el pre-vuelo del libro), en céntimos. */
  pedido: number;
  /** Confirmado en el mostrador: ya estaba devuelto en SumUp, solo apuntarlo. */
  soloApuntar?: boolean;
}): Promise<DevolucionSumup> {
  const ref = leerReferenciaSumup(p.referencia);
  if (!ref) return { ok: false, status: 409, error: 'No encontramos el cobro de SumUp de esta venta. Revísalo en la app de SumUp.' };

  const cuenta = await cuentaSumupDelEstudio(p.studioId);
  if (!cuenta.ok) {
    return {
      ok: false, status: 409,
      error: 'La cuenta de SumUp del estudio no está conectada (o hay que volver a conectarla), así que no se puede devolver desde aquí. Hazlo desde la app de SumUp. No se ha apuntado nada.',
    };
  }
  const { cliente, merchantCode } = cuenta;

  const candado = `sumup-devol:${p.ventaId}:${p.devueltoLibro}`;
  const reclamo = await reclamarOperacion(admin, candado, 'sumup.devolucion', EXPIRA_CANDADO_SEGUNDOS);
  if (reclamo.estado === 'error') {
    return { ok: false, status: 503, error: 'No hemos podido comprobar si hay otra devolución en marcha. No se ha devuelto nada: inténtalo en un momento.' };
  }
  if (reclamo.estado === 'ocupada') {
    return {
      ok: false, status: 409,
      error: 'Ya hay una devolución de esta venta en marcha, y puede que el dinero ya haya salido. No la devuelvas desde la app de SumUp: espera unos minutos y vuelve a abrirla.',
    };
  }
  const soltar = async (r: { status: number; error: string; codigo?: string }) => {
    await fallarWebhookEvent(admin, candado);
    return { ok: false as const, ...r };
  };

  let t;
  try {
    t = await cliente.buscarTransaccion(merchantCode, ref.clientTransactionId);
  } catch (err) {
    console.error('[sumup:devolucion:leer]', err instanceof Error ? err.message : err);
    return soltar({ status: 502, error: 'SumUp no responde ahora mismo. No se ha devuelto nada: inténtalo en un momento.' });
  }
  if (!t) return soltar({ status: 409, error: 'SumUp no encuentra este cobro. Revísalo en la app de SumUp.' });
  if (t.currency !== 'EUR' || (t.status !== 'SUCCESSFUL' && t.status !== 'REFUNDED')) {
    return soltar({ status: 409, error: 'Este cobro no se puede devolver en SumUp en su estado actual. Revísalo en la app de SumUp.' });
  }
  if (tieneContracargo(t)) {
    return soltar({ status: 409, error: 'Este cobro tiene una reclamación del banco (contracargo) en SumUp: no se devuelve desde aquí. Revísalo en la app de SumUp.' });
  }
  if (centimosSinPropina(t) !== p.totalVenta) {
    Sentry.captureMessage('[pos/sumup] la transacción no cuadra con el total de la venta', {
      level: 'warning', tags: { area: 'cobros', proveedor: 'sumup' },
      extra: { studioId: p.studioId, ventaId: p.ventaId, cobrado: centimosSinPropina(t), totalVenta: p.totalVenta },
    });
    return soltar({ status: 409, error: 'El cobro de SumUp no coincide con el total de esta venta. Revísalo en la app de SumUp.' });
  }
  const devueltoSumup = centimosDevueltosSumup(t);
  if (devueltoSumup === null) {
    return soltar({ status: 502, error: 'SumUp no nos dice cuánto lleva devuelto este cobro, así que no devolvemos nada a ciegas. Inténtalo en un momento.' });
  }

  const decision = decidirDevolucionSumup({
    cobrado: Math.round(t.amount * 100), devueltoSegunSumup: devueltoSumup, devueltoSegunLibro: p.devueltoLibro, pedido: p.pedido,
  });

  if (decision.tipo === 'ya-devuelta') {
    // Un intento nuestro (la clave ya existía) o confirmado en el mostrador: se apunta.
    if (reclamo.previa || p.soloApuntar) return { ok: true, transaccionId: t.id, yaEstaba: true, candado };
    return soltar({
      status: 409, codigo: CODIGO_SUMUP_YA_DEVUELTO,
      error: `En SumUp ya constan devueltos ${euros(p.pedido)} de esta venta que aquí no están apuntados (¿se devolvió desde la app de SumUp?). Si es esta misma devolución, apúntala sin devolver nada más.`,
    });
  }
  if (p.soloApuntar) {
    return soltar({ status: 409, error: 'Lo devuelto en SumUp ya no coincide con esta devolución. Vuelve a abrir la venta.' });
  }
  if (decision.tipo === 'no') {
    if (decision.motivo === 'excede') return soltar({ status: 409, error: 'Esa devolución supera lo que queda por devolver de este cobro en SumUp.' });
    Sentry.captureMessage('[pos/sumup] devolución que no cuadra con SumUp', {
      level: 'warning', tags: { area: 'cobros', proveedor: 'sumup' },
      extra: { studioId: p.studioId, ventaId: p.ventaId, devueltoSumup, devueltoLibro: p.devueltoLibro, pedido: p.pedido },
    });
    return soltar({
      status: 409,
      error: `En SumUp esta venta tiene devueltos ${euros(devueltoSumup)} y aquí constan ${euros(p.devueltoLibro)}. Desde aquí solo se puede apuntar una devolución que coincida exactamente con lo devuelto allí: revísalo en la app de SumUp antes de devolver nada más.`,
    });
  }

  try {
    await cliente.devolver(merchantCode, t.id, p.pedido);
    return { ok: true, transaccionId: t.id, yaEstaba: false, candado };
  } catch (err) {
    console.error('[sumup:devolucion]', err instanceof ErrorSumup ? `${err.status} ${err.codigo ?? ''} ${err.message}` : err);
    if (err instanceof ErrorSumup && err.caducado) {
      return soltar({ status: 409, error: 'La cuenta de SumUp del estudio hay que volver a conectarla. No se ha devuelto nada.' });
    }
    if (err instanceof ErrorSumup && err.status === 403) {
      return soltar({ status: 409, error: 'Tu cuenta de SumUp no deja hacer devoluciones desde fuera de su app. Hazla desde la app de SumUp. No se ha devuelto nada.' });
    }
    if (err instanceof ErrorSumup && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
      return soltar({ status: 409, error: 'SumUp no deja devolver este cobro ahora (puede que aún no esté liquidado). No se ha devuelto nada: inténtalo más tarde o desde la app de SumUp.' });
    }
    // Sin respuesta clara (también si SumUp tardó demasiado): ¿salió o no? Se pregunta.
    const despues = await cliente.buscarTransaccion(merchantCode, ref.clientTransactionId).catch(() => null);
    const devueltoDespues = despues ? centimosDevueltosSumup(despues) : null;
    if (devueltoDespues !== null && devueltoDespues - devueltoSumup === p.pedido) {
      return { ok: true, transaccionId: t.id, yaEstaba: false, candado };
    }
    // No se sabe: el candado se queda puesto hasta que caduque, y el siguiente
    // intento verá en SumUp si el dinero salió (y entonces solo apuntará).
    Sentry.captureMessage('[pos/sumup] devolución sin respuesta clara de SumUp', {
      level: 'warning', tags: { area: 'cobros', proveedor: 'sumup' },
      extra: { studioId: p.studioId, ventaId: p.ventaId, pedido: p.pedido },
    });
    return {
      ok: false, status: 502,
      error: 'No sabemos si SumUp ha devuelto el dinero. Míralo en la app de SumUp (no lo devuelvas desde allí) y vuelve a intentarlo aquí dentro de 15 minutos: si ya salió, solo se apuntará.',
    };
  }
}
