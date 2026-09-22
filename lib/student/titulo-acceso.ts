// El titular de la pantalla de ENTRADA de la app (`/portal/<slug>/acceso`).
//
// ⚠️ Vacío NO es «no se pinta», a diferencia del lema o la frase manuscrita: ese
// hueco YA tenía texto antes de ser configurable, así que un estudio que borre
// el campo vuelve al del producto, no a una entrada muda. Mismo criterio y
// mismo motivo que `lib/student/subtitulo-heroe.ts`.
//
// Se respetan los saltos de línea que escriba el estudio: la frase se lee en
// renglones cortos sobre la foto, y romperla es parte de escribirla.

/** El del producto, cuando el estudio no ha escrito el suyo. */
export const TITULO_ACCESO_POR_DEFECTO = 'Muévete.\nLo demás,\nya está.';

export function tituloDeAcceso(delEstudio: string | null | undefined): string {
  const suyo = (delEstudio ?? '').trim();
  return suyo || TITULO_ACCESO_POR_DEFECTO;
}

/** Sus renglones, para pintarlos con un salto real entre ellos. */
export function renglonesDeAcceso(delEstudio: string | null | undefined): string[] {
  return tituloDeAcceso(delEstudio).split('\n').map(l => l.trim()).filter(Boolean);
}
