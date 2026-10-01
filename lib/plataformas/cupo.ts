// Plazas que un estudio cede a una plataforma por clase (`plataforma_cupos`).
//
// Espejo en TS de la regla de la base de datos (`cupo_plataforma`): sesión →
// tipo de clase → sin límite. Y la lectura del campo del panel. Puro, sin `@/`.

/** Lo que manda para una sesión concreta: su excepción, si no la del tipo, si no ninguna. */
export function cupoEfectivo(porSesion: number | null | undefined, porTipo: number | null | undefined): number | null {
  if (porSesion != null) return porSesion;
  if (porTipo != null) return porTipo;
  return null;
}

/**
 * El campo «Plazas que cedes» del panel. En blanco = sin límite (`null`).
 * No admite más plazas que el aforo por defecto del tipo de clase: ceder más de
 * las que tiene la clase no significa nada y suele ser una errata.
 */
export function leerPlazasCedidas(texto: string, aforoPorDefecto: number | null):
  | { ok: true; plazas: number | null }
  | { ok: false; error: string } {
  const limpio = texto.trim();
  if (limpio === '') return { ok: true, plazas: null };
  if (!/^\d+$/.test(limpio)) return { ok: false, error: 'Las plazas cedidas tienen que ser un número entero (o dejarlo en blanco para no poner límite).' };
  const n = Number(limpio);
  if (aforoPorDefecto != null && n > aforoPorDefecto) {
    return { ok: false, error: `No puedes ceder más plazas (${n}) de las que tiene la clase (${aforoPorDefecto}).` };
  }
  if (n > 1000) return { ok: false, error: 'Demasiadas plazas.' };
  return { ok: true, plazas: n };
}
