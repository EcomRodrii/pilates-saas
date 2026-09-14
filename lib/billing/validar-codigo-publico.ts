// Comprobación en vivo de un código promocional ANTES de pagar
// (app/api/public/validar-codigo-descuento). Se saca de la ruta para poder
// probarla sin Next ni Supabase: las dependencias entran por parámetro.
//
// ⚠️ La socia se deriva de la SESIÓN, nunca del body. La respuesta depende de
// quién pregunta —si es nueva, qué códigos ha canjeado ya— y eso es dato de esa
// socia: aceptar un `socioId` suelto sería contestarle a cualquiera por ella.
// Por eso aquí ni siquiera entra un id: solo `pideSocia` («la petición dice
// venir de una socia con sesión»). Mismo criterio que el cobro gemelo,
// app/api/public/checkout-embebido, que resuelve la socia igual.
import type { CodigoDescuento } from '../types.ts';
import type { ResultadoCanje } from '../codigos-descuento.ts';
import { resolverDescuentoCheckout } from './descuento-checkout.ts';

export interface DepsValidarCodigo {
  /** El usuario del Bearer del portal, o `null` si no hay token válido. */
  usuario: () => Promise<{ userId: string } | null>;
  /** Su ficha en ESTE estudio (`socioAutenticado`), o `null` si no tiene. */
  socioDelEstudio: (userId: string, studioId: string) => Promise<string | null>;
  codigos: (studioId: string) => Promise<CodigoDescuento[]>;
  esNueva: (studioId: string, socioId: string | null) => Promise<boolean>;
  codigosYaUsados: (socioId: string | null) => Promise<ReadonlySet<string>>;
  hoyISO: string;
}

export async function validarCodigoPublico(
  entrada: { studioId: string; codigo: string; subtotal: number; pideSocia: boolean },
  deps: DepsValidarCodigo,
): Promise<{ status: 200 | 401 | 403; cuerpo: ResultadoCanje }> {
  // Sin `pideSocia` es el camino de siempre de "pagar y reservar sin cuenta"
  // (/reservar): comprobación PERMISIVA, que el cobro corrige después. No hay
  // forma de sacar por aquí un descuento que el cobro no fuera a aplicar.
  let socioId: string | null = null;
  if (entrada.pideSocia) {
    const usuario = await deps.usuario();
    if (!usuario) {
      return { status: 401, cuerpo: { ok: false, motivo: 'Tu sesión ha caducado. Vuelve a entrar para aplicar el código.' } };
    }
    socioId = await deps.socioDelEstudio(usuario.userId, entrada.studioId);
    if (!socioId) return { status: 403, cuerpo: { ok: false, motivo: 'No autorizado' } };
  }

  // `esNueva` y los ya usados salen de las mismas funciones que usa el cobro:
  // si divergieran, aquí se confirmaría un descuento que luego no se aplica.
  const resultado = resolverDescuentoCheckout(await deps.codigos(entrada.studioId), entrada.codigo, {
    hoyISO: deps.hoyISO,
    subtotal: entrada.subtotal,
    esNueva: await deps.esNueva(entrada.studioId, socioId),
    codigosYaUsados: await deps.codigosYaUsados(socioId),
  });
  return { status: 200, cuerpo: resultado };
}
