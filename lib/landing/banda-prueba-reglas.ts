// Cuándo se enseña la banda «7 días gratis · Migración incluida» de la home
// (fundador, 9-oct-2026): SOLO a quien llega por el enlace del anuncio de Meta.
// La landing normal —quien entra directo, desde Google o desde el navegador— no
// la lleva. Sin navegador ni red, para poder probarla con `node --test`.
//
// La puerta es `utm_source=meta`, que pone NUESTRO enlace del anuncio (Meta
// añade además `fbclid`, pero ése también lo lleva quien comparte un enlace
// copiado de Facebook, y no es lo que queremos premiar con una oferta).
// Se recuerda durante la sesión: quien baja, abre /precios y vuelve a la portada
// ya no trae el `?utm_...` en la URL y no debe perder la banda a mitad de camino.

export const CLAVE_BANDA_PRUEBA = 'tentare:banda-prueba';

/** `search` es `window.location.search` (con o sin el `?` delante). */
export function llegaDeAnuncio(search: string): boolean {
  return new URLSearchParams(search).get('utm_source')?.trim().toLowerCase() === 'meta';
}

/** La decisión completa: viene del anuncio ahora, o ya vino antes en esta sesión. */
export function verBandaPrueba(search: string, guardado: string | null): boolean {
  return guardado === '1' || llegaDeAnuncio(search);
}
