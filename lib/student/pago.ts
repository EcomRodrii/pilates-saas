'use client';

import { borrarTarjetaPublica, portalAuthHeader } from '@/lib/student/api-publica';
import type { TarjetaGuardada } from '@/lib/billing/tarjetas-guardadas';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { esperaAntesDe, leerConfirmacionTarjeta, type LecturaTarjeta, type TarjetaConfirmada } from '@/lib/student/guardar-tarjeta-reglas';

// El método de pago guardado de la alumna. Sale del payload que ya se pide
// (los datos son suyos: marca, últimos cuatro y caducidad; el número completo
// lo guarda la pasarela, no nosotros) y se borra con `DELETE /api/public/tarjeta`,
// que ya existía y no lo llamaba nadie.

export interface MetodoPago {
  tieneTarjeta: boolean;
  /**
   * El método guardado es Link (se pagó con Link en el checkout embebido). No
   * trae marca de tarjeta, últimos cuatro ni caducidad, pero se cobra igual cada
   * renovación, así que se enseña —y se puede quitar— como cualquier tarjeta.
   */
  esLink: boolean;
  marca: string | null;
  ultimos4: string | null;
  /** «12/2027», o `null` si el estudio no guardó la caducidad. */
  caducidad: string | null;
}

const SIN_TARJETA: MetodoPago = { tieneTarjeta: false, esLink: false, marca: null, ultimos4: null, caducidad: null };

export async function getMetodoPago(slug: string): Promise<MetodoPago> {
  const d = await catalogo(slug);
  const s = d?.socia?.socio;
  // ⚠️ Decidir solo por `tarjetaUltimos4` escondía un Link guardado: la alumna
  // leía «No tienes ninguna tarjeta guardada», sin botón para quitarlo, mientras
  // su cuota se le cobraba sola cada mes. `guardarCaducidadTarjeta` lo marca con
  // `tarjeta_marca = 'link'`.
  if (s?.tarjetaMarca === 'link') {
    return { tieneTarjeta: true, esLink: true, marca: 'Link', ultimos4: null, caducidad: null };
  }
  if (!s?.tarjetaUltimos4) return SIN_TARJETA;
  const mes = s.tarjetaExpMes;
  const anio = s.tarjetaExpAnio;
  return {
    tieneTarjeta: true,
    esLink: false,
    marca: s.tarjetaMarca ?? null,
    ultimos4: s.tarjetaUltimos4,
    caducidad: mes && anio ? `${String(mes).padStart(2, '0')}/${anio}` : null,
  };
}

/** Quita la tarjeta. Devuelve el mensaje de error, o `null` si fue bien. */
export async function quitarTarjeta(slug: string, studioId: string): Promise<string | null> {
  const error = await borrarTarjetaPublica(studioId);
  if (!error) invalidarCatalogo(slug);
  return error;
}

// ── «Cambiar tarjeta» / «Añadir tarjeta» (6-oct-2026) ────────────────────────

export type InicioGuardarTarjeta =
  | { ok: true; clientSecret: string; checkoutSessionId: string }
  | { ok: false; error: string; sesionCaducada?: boolean };

/** Abre el Checkout incrustado para guardar la tarjeta de sus cobros. Nunca lanza. */
export async function abrirGuardarTarjeta(studioId: string): Promise<InicioGuardarTarjeta> {
  try {
    const res = await fetch('/api/public/tarjeta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId }),
    });
    if (res.status === 401) return { ok: false, sesionCaducada: true, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
    const c = (await res.json().catch(() => null)) as { clientSecret?: string; checkoutSessionId?: string; error?: string } | null;
    if (res.ok && c?.clientSecret && c.checkoutSessionId) return { ok: true, clientSecret: c.clientSecret, checkoutSessionId: c.checkoutSessionId };
    // Un 4xx con su texto (el estudio no acepta tarjetas, no es suya…) se dice tal cual; una avería, en general.
    if (res.status < 500 && c?.error) return { ok: false, error: c.error };
    return { ok: false, error: 'No hemos podido abrir el formulario de la tarjeta. Inténtalo de nuevo.' };
  } catch {
    return { ok: false, error: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

/** Una consulta de «¿está ya en mi ficha la tarjeta de esta sesión?». Nunca lanza: sin red, «en proceso». */
export async function consultarTarjetaGuardada(studioId: string, sesion: string): Promise<LecturaTarjeta> {
  try {
    const res = await fetch(
      `/api/public/tarjeta?studioId=${encodeURIComponent(studioId)}&sesion=${encodeURIComponent(sesion)}`,
      { headers: await portalAuthHeader(), cache: 'no-store' },
    );
    const cuerpo = await res.json().catch(() => null);
    return leerConfirmacionTarjeta(res.status, res.headers.get('retry-after'), cuerpo);
  } catch {
    return { tipo: 'en_proceso' };
  }
}

export type DesenlaceTarjeta =
  | { tipo: 'guardada'; tarjeta: TarjetaConfirmada }
  | { tipo: 'tarda' } | { tipo: 'sesion' } | { tipo: 'dos-pasos' } | { tipo: 'cancelado' };

/** Pregunta hasta que el servidor la lea en su ficha, o se agote la espera razonable. */
export async function esperarTarjetaGuardada(studioId: string, sesion: string, sigueVivo: () => boolean): Promise<DesenlaceTarjeta> {
  let espera: number | undefined;
  for (let intento = 0; ; intento++) {
    const ms = esperaAntesDe(intento, espera);
    if (ms == null) return { tipo: 'tarda' };
    await new Promise((r) => setTimeout(r, ms));
    if (!sigueVivo()) return { tipo: 'cancelado' };
    const l = await consultarTarjetaGuardada(studioId, sesion);
    if (!sigueVivo()) return { tipo: 'cancelado' };
    if (l.tipo !== 'en_proceso') return l;
    espera = l.esperaMinMs;
  }
}

// ── P16: las tarjetas que guardó para pagar en la app ───────────────────────

/** Las que aceptó guardar («Guárdala para la próxima»). `null` = no se han podido leer (no se inventa una lista). */
export async function getTarjetasApp(studioId: string): Promise<TarjetaGuardada[] | null> {
  try {
    const res = await fetch(`/api/public/tarjeta?studioId=${encodeURIComponent(studioId)}`, { headers: await portalAuthHeader(), cache: 'no-store' });
    if (!res.ok) return null;
    const c = (await res.json().catch(() => null)) as { tarjetas?: TarjetaGuardada[] } | null;
    return Array.isArray(c?.tarjetas) ? c.tarjetas : null;
  } catch {
    return null;
  }
}

/** Quita UNA tarjeta guardada para la app. Devuelve el mensaje de error, o `null` si fue bien. */
export async function quitarTarjetaApp(slug: string, studioId: string, paymentMethodId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/public/tarjeta', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, paymentMethodId }),
    });
    if (res.ok) { invalidarCatalogo(slug); return null; }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.status >= 500 || !data.error ? 'No se ha podido quitar la tarjeta. Inténtalo de nuevo.' : data.error;
  } catch {
    return 'No hemos podido conectar. Inténtalo de nuevo.';
  }
}
