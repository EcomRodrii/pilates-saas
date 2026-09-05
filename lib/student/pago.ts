'use client';

import { borrarTarjetaPublica } from '@/lib/api-client';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';

// El método de pago guardado de la alumna. Sale del payload que ya se pide
// (los datos son suyos: marca, últimos cuatro y caducidad; el número completo
// lo guarda la pasarela, no nosotros) y se borra con `DELETE /api/public/tarjeta`,
// que ya existía y no lo llamaba nadie.

export interface MetodoPago {
  tieneTarjeta: boolean;
  marca: string | null;
  ultimos4: string | null;
  /** «12/2027», o `null` si el estudio no guardó la caducidad. */
  caducidad: string | null;
}

const SIN_TARJETA: MetodoPago = { tieneTarjeta: false, marca: null, ultimos4: null, caducidad: null };

export async function getMetodoPago(slug: string): Promise<MetodoPago> {
  const d = await catalogo(slug);
  const s = d?.socia?.socio;
  if (!s?.tarjetaUltimos4) return SIN_TARJETA;
  const mes = s.tarjetaExpMes;
  const anio = s.tarjetaExpAnio;
  return {
    tieneTarjeta: true,
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
