// ─────────────────────────────────────────────────────────────────────────────
// Cómo se lleva a la vista lo que señala un paso.
//
// `scrollIntoView({ block: 'center' })` está bien para una fila o un botón, y MAL para una
// pantalla entera (la raíz de Cobros, de Clientas…): centra su punto medio y la página salta
// a la mitad del contenido, dejando fuera la cabecera. Un elemento alto no se centra: se
// lleva su INICIO a la vista, y solo si no estaba ya a la vista.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type ModoDesplazamiento = 'ninguno' | 'centro' | 'inicio';

/** Margen que deja el menú fijo de arriba al llevar un elemento alto a su inicio. */
export const MARGEN_SUPERIOR = 96;

export function modoDeDesplazamiento(rect: { top: number; bottom: number; height: number }, altoVentana: number): ModoDesplazamiento {
  const cabe = rect.height <= altoVentana * 0.7;
  if (cabe) {
    const visible = rect.top >= 0 && rect.bottom <= altoVentana;
    return visible ? 'ninguno' : 'centro';
  }
  // Elemento alto: basta con que su principio esté a la vista, en la mitad de arriba.
  return rect.top >= 0 && rect.top < altoVentana * 0.5 ? 'ninguno' : 'inicio';
}
