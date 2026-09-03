'use client';

// Qué hacer cuando Stripe devuelve a la alumna a la app.
//
// ⚠️ La regla que gobierna este fichero está escrita en el propio backend
// (`lib/billing/origen-pago.ts`): **`?compra=ok` NO significa «el bono ya
// está»**. Significa «Stripe dice que el pago salió». Quien entrega el bono es
// el webhook (`checkout.session.completed`), que puede tardar unos segundos o
// reintentarse. Felicitar a la alumna antes de comprobarlo es prometer algo que
// todavía no ha pasado — y si el webhook falla, es mentira.
//
// Por eso aquí no hay un «¡Gracias por tu compra!» y punto: se REVISA que la
// suscripción exista, con reintentos, y solo entonces se dice que está.

import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';

/** Escalonado de espera, en ms. Suma ~12 s, que es de sobra para el webhook. */
const REINTENTOS = [400, 900, 1600, 2500, 3200, 3400];

export type EstadoCompra = 'confirmada' | 'tardando' | 'sin-comprobar';

/**
 * Espera a que aparezca una suscripción del plan comprado.
 *
 * Devuelve 'confirmada' en cuanto la ve, 'tardando' si se acaban los intentos
 * —que NO es un error: el webhook puede seguir su curso y la compra completarse
 * un minuto después— y 'sin-comprobar' si ni siquiera se pudo mirar.
 *
 * `planId` puede venir vacío: en ese caso solo se refresca el catálogo, porque
 * sin saber qué plan se compró no se puede afirmar nada.
 */
export async function esperarBonoDePlan(slug: string, planId: string | null): Promise<EstadoCompra> {
  invalidarCatalogo(slug);

  if (!planId) {
    await catalogo(slug, { forzar: true }).catch(() => null);
    return 'sin-comprobar';
  }

  for (const espera of REINTENTOS) {
    const d = await catalogo(slug, { forzar: true }).catch(() => null);
    if (!d) return 'sin-comprobar';

    const suscripciones = (d as { socia?: { suscripciones?: Array<{ planId?: string; estado?: string }> } }).socia?.suscripciones ?? [];
    const llegado = suscripciones.some((s) => s.planId === planId && s.estado === 'ACTIVA');
    if (llegado) return 'confirmada';

    await new Promise((r) => setTimeout(r, espera));
  }

  return 'tardando';
}

export interface AvisoRetorno {
  mensaje: string;
  /** `true` si hay que revisar el servidor antes de darlo por bueno. */
  comprobar?: boolean;
}

/**
 * Traduce los parámetros que Stripe devuelve en la URL a un aviso.
 *
 * Los nombres NO se inventan: son los que compone el backend hoy —
 * `?compra=ok|cancelada` (origen-pago.ts), `?pago=ok|cancelado` (ídem),
 * `?tarjeta=ok|cancel` (setup-tarjeta) y `?sepa=ok|cancel` (setup-sepa).
 *
 * Guardar una tarjeta o un mandato SÍ se puede dar por bueno al volver: eso lo
 * confirma Stripe en su propia pantalla y no depende de ningún webhook nuestro.
 * Una COMPRA no.
 */
export function avisoDeRetorno(params: URLSearchParams): AvisoRetorno | null {
  if (params.get('tarjeta') === 'ok') return { mensaje: 'Tarjeta guardada ✓' };
  if (params.get('tarjeta') === 'cancel') return { mensaje: 'No se ha guardado ninguna tarjeta' };
  if (params.get('sepa') === 'ok') return { mensaje: 'Domiciliación activada ✓' };
  if (params.get('sepa') === 'cancel') return { mensaje: 'No se ha activado la domiciliación' };
  if (params.get('pago') === 'ok') return { mensaje: 'Pago recibido ✓' };
  if (params.get('pago') === 'cancelado') return { mensaje: 'Pago cancelado — no se ha hecho ningún cargo' };
  if (params.get('compra') === 'cancelada') return { mensaje: 'Compra cancelada — no se ha hecho ningún cargo' };
  if (params.get('compra') === 'ok') return { mensaje: 'Confirmando tu compra…', comprobar: true };
  return null;
}
