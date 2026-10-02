// Dentro de la app, ¿a dónde va un enlace o un `window.open`? Puro: se prueba con
// `node --test`. Lo usa components/nativo/PuenteNativo.tsx.
//
// - `interna`: misma web → se navega dentro de la app (un `_blank` a nuestra
//   propia web abría una «pestaña» que en la app no existe).
// - `fuera`: otro dominio con http(s) → Safari por encima (SFSafariViewController),
//   para que la persona vuelva a la app con «OK».
// - `null`: lo que no hay que tocar (tel:, mailto:, anclas, javascript:, vacío):
//   iOS ya sabe qué hacer con tel/mailto, y lo demás no navega.

export type DestinoEnlace = { tipo: 'interna'; ruta: string } | { tipo: 'fuera'; url: string } | null;

export function destinoDeEnlace(href: string | null | undefined, origenActual: string, nuevaVentana: boolean): DestinoEnlace {
  if (!href) return null;
  let u: URL;
  try { u = new URL(href, origenActual); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin === new URL(origenActual).origin) {
    // Un enlace normal a nuestra web lo lleva Next como siempre; solo se toca el
    // que pedía ventana nueva.
    return nuevaVentana ? { tipo: 'interna', ruta: `${u.pathname}${u.search}${u.hash}` } : null;
  }
  return { tipo: 'fuera', url: u.href };
}
