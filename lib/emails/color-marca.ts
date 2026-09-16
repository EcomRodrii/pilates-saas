// ─────────────────────────────────────────────────────────────────────────────
// De qué color es un estudio, para sus correos.
//
// El dato vive en DOS sitios y solo uno se puede editar hoy:
//
//   · `studio_theme.config_published.primary` — lo que cambia la propietaria en
//     Configuración → Marca, y lo que pintan el panel, su página de reservas y
//     la app de la alumna.
//   · `studios.color_primario` — una columna anterior a todo eso. NINGUNA
//     pantalla la escribe ya (comprobado con grep sobre `components/` y `app/`:
//     el único mapeo que queda, en `updateStudio`, no tiene llamantes).
//
// Los correos leían la columna. Resultado: una propietaria cambiaba su color,
// veía su panel y su app cambiar, y sus correos seguían saliendo del color
// viejo para siempre. Este módulo es la regla que lo cierra, en un solo sitio
// y con test, porque el caso ambiguo no es evidente:
//
// ⚠️ Un tema publicado puede traer el `primary` POR DEFECTO sin que nadie haya
// elegido nada — basta con que la propietaria haya publicado un favicon o un
// texto de su página. En ese caso tomar el tema le cambiaría el color de sus
// correos al oliva del producto sin haberlo pedido. Por eso el default del
// producto no cuenta como elección: ahí manda la columna de siempre.
// ─────────────────────────────────────────────────────────────────────────────

/** El oliva del kit: el `primary` con el que nace un tema sin tocar. */
export const PRIMARY_POR_DEFECTO = '#343825';

const HEX = /^#[0-9a-fA-F]{6}$/;

function valido(v: unknown): string | null {
  return typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : null;
}

/**
 * El color principal del correo. `null` si el estudio no tiene ninguno en
 * ningún sitio — la paleta cae entonces al del kit, igual que siempre.
 */
export function colorMarcaDelEstudio(
  colorColumna: unknown,
  primaryDelTema: unknown,
): string | null {
  const columna = valido(colorColumna);
  const tema = valido(primaryDelTema);
  // Sin tema publicado, o con el default del producto encima de un color propio
  // de la columna, manda la columna: es el comportamiento de siempre y no puede
  // cambiarle el color a nadie por sorpresa.
  if (!tema || (tema.toUpperCase() === PRIMARY_POR_DEFECTO && columna)) return columna;
  return tema;
}

/**
 * El secundario, que en el correo pinta el botón. Solo vive en el tema — no hay
 * columna equivalente en `studios`, así que aquí no hay ambigüedad que resolver.
 */
export function colorSecundarioDelEstudio(secondaryDelTema: unknown): string | null {
  return valido(secondaryDelTema);
}
