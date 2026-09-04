'use client';

// Cancelar una reserva y pedir el pase de acceso.
//
// ⚠️ Las dos DECISIONES son del servidor, y aquí se nota en la forma de los
// tipos: `cancelar()` devuelve `bonoDevuelto` tal cual lo dice la base de datos
// —no lo calcula—, y el pase devuelve un token firmado que caduca en dos
// minutos, no una imagen que podamos guardar.

import { invalidarCatalogo } from '@/lib/student/catalogo';
import { portalAuthHeader } from '@/lib/api-client';

export type ResultadoCancelar =
  | {
      ok: true;
      /** Cancelada fuera de plazo. Lo decide la BD con la cascada tipo → estudio. */
      tardia: boolean;
      /** Si la sesión volvió al bono. Columna devuelta por `cancelar_reserva_plaza`. */
      bonoDevuelto: boolean;
      /** `false` si estaba en lista de espera: salir de la cola no devuelve nada. */
      eraConfirmada: boolean;
    }
  | { ok: false; error: string; sesionCaducada?: boolean };

/**
 * Cancela una reserva o sale de la lista de espera (es la misma operación).
 *
 * Nunca lanza. Y nunca da por buena una cancelación que el servidor no ha
 * confirmado: si algo falla, la reserva SIGUE ACTIVA y eso es lo que hay que
 * decirle a la alumna — anunciar «cancelada» y que no lo esté es peor que el
 * propio fallo, porque no se presenta a una clase que sigue teniendo.
 */
export async function cancelarReserva(
  slug: string, studioId: string, reservaId: string, opts: { online?: boolean } = {},
): Promise<ResultadoCancelar> {
  if (opts.online === false) return { ok: false, error: 'Sin conexión. Vuelve a intentarlo cuando tengas red.' };

  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/reserva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ accion: 'cancelar', studioId, reservaId }),
    });

    if (res.status === 401) {
      return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.', sesionCaducada: true };
    }

    const cuerpo = (await res.json().catch(() => null)) as
      | { ok?: true; tardia?: boolean; bonoDevuelto?: boolean; eraConfirmada?: boolean; error?: string }
      | null;

    if (!res.ok || !cuerpo?.ok) {
      return { ok: false, error: cuerpo?.error ?? 'No hemos podido cancelar. Tu reserva sigue activa.' };
    }

    // La plaza vuelve al aforo y puede haber promocionado a alguien de la cola.
    invalidarCatalogo(slug);

    return {
      ok: true,
      tardia: cuerpo.tardia === true,
      bonoDevuelto: cuerpo.bonoDevuelto === true,
      eraConfirmada: cuerpo.eraConfirmada === true,
    };
  } catch {
    // Se cayó la red a mitad. No sabemos si llegó a cancelarse, así que NO se
    // anuncia como cancelada: se pide reintentar y al recargar se verá la
    // verdad.
    return { ok: false, error: 'No hemos podido cancelar. Comprueba tu conexión y vuelve a intentarlo.' };
  }
}

export type Pase =
  | { hayPase: false }
  | {
      hayPase: true;
      /** De qué reserva es. El endpoint devuelve el de la PRÓXIMA clase. */
      reservaId: string;
      /** `true` solo dentro de la ventana de validez. Fuera, no hay token. */
      vigente: boolean;
      yaAsistida: boolean;
      minutosParaActivarse: number;
      seActivaA: string;
      paseHasta: string;
      inicio: string;
      /** Firmado y con dos minutos de vida. Es lo que se convierte en QR. */
      token: string | null;
      /** El mismo pase en seis caracteres, para cuando la cámara no lee. */
      codigo: string | null;
    };

/**
 * Pide el pase de acceso.
 *
 * ⚠️ Caduca en DOS MINUTOS a propósito: sin eso, una captura reenviada por
 * WhatsApp abre la puerta del estudio, porque validar el pase dispara Kisi. La
 * pantalla que lo enseña tiene que volver a pedirlo mientras esté abierta, y
 * nunca guardarlo.
 */
export async function getPase(slug: string): Promise<Pase | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/pase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Pase;
  } catch {
    return null;
  }
}
