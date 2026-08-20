// ─────────────────────────────────────────────────────────────────────────────
// Datos estructurados (JSON-LD) de la página pública de un estudio.
//
// Se emiten desde que `/reservar/<estudio>` es indexable: sin ellos, Google ve
// una página de reservas y no sabe que detrás hay un NEGOCIO LOCAL con nombre,
// dirección y teléfono — que es justo lo que decide si aparece en el paquete
// local de "pilates cerca de mí".
//
// Tipo: `SportsActivityLocation`, que es un subtipo de `LocalBusiness`. Google
// pide usar el subtipo MÁS específico que aplique, y un estudio de Pilates lo
// es; un `LocalBusiness` a secas describiría igual de bien una ferretería.
//
// ⚠️ **Regla dura: solo se emite lo que existe de verdad.** Un dato inventado
// en JSON-LD no es un detalle cosmético — Google penaliza el marcado que no se
// corresponde con la página, y aquí además serían datos de un negocio ajeno.
// Por eso NO se emiten, aunque quedarían bien:
//
//   · `addressCountry`: `studios` no tiene columna de país. Deducir «ES» de que
//     el producto sea español es una suposición sobre el negocio de otro.
//   · `openingHours`: hay horario de CLASES, que no es el horario del local.
//   · `aggregateRating`: hay valoraciones en la base, pero Google exige que la
//     nota esté VISIBLE en la misma página, y no lo está. Marcarla sería
//     motivo de acción manual.
//   · `priceRange`: los planes están en otra tabla y un rango mal calculado
//     (un bono de 10 sesiones no es el precio de una clase) engaña más que
//     ayuda.
// ─────────────────────────────────────────────────────────────────────────────

export interface EstudioParaJsonLd {
  nombre: string;
  /** URL canónica de la página del estudio. */
  url: string;
  direccion?: string | null;
  ciudad?: string | null;
  codigoPostal?: string | null;
  telefono?: string | null;
  email?: string | null;
  descripcion?: string | null;
  /** Foto del local; si no hay, el logo. */
  imagenUrl?: string | null;
}

/** Texto útil o `undefined`. Una cadena en blanco es lo mismo que no tenerla. */
function texto(v: string | null | undefined): string | undefined {
  const t = (v ?? '').trim();
  return t === '' ? undefined : t;
}

export function estudioJsonLd(e: EstudioParaJsonLd): Record<string, unknown> | null {
  const nombre = texto(e.nombre);
  const url = texto(e.url);
  // Sin nombre o sin URL no hay entidad que describir: mejor no emitir nada que
  // emitir un objeto a medias.
  if (!nombre || !url) return null;

  const calle = texto(e.direccion);
  const ciudad = texto(e.ciudad);
  const cp = texto(e.codigoPostal);
  // Una dirección sin calle NI ciudad no ubica nada; se omite entera en vez de
  // emitir un `PostalAddress` vacío.
  const direccion = calle || ciudad
    ? {
        '@type': 'PostalAddress',
        ...(calle ? { streetAddress: calle } : {}),
        ...(ciudad ? { addressLocality: ciudad } : {}),
        ...(cp ? { postalCode: cp } : {}),
      }
    : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: nombre,
    url,
    ...(direccion ? { address: direccion } : {}),
    ...(texto(e.telefono) ? { telephone: texto(e.telefono) } : {}),
    ...(texto(e.email) ? { email: texto(e.email) } : {}),
    ...(texto(e.descripcion) ? { description: texto(e.descripcion) } : {}),
    ...(texto(e.imagenUrl) ? { image: texto(e.imagenUrl) } : {}),
  };
}
