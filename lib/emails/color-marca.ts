// ─────────────────────────────────────────────────────────────────────────────
// De qué color es un estudio, para sus correos.
//
// ⚠️ Medido en producción el 16-sep-2026, y no es una mejora de matiz: de los
// 11 estudios activos, **10 tenían `studios.color_primario = '#4F46E5'`** — un
// índigo que escribe el alta y que no ha elegido nadie. Los correos leían esa
// columna, así que diez estudios llevaban meses mandando correos de un color
// que no es el suyo, mientras su panel y su app se veían de otro.
//
// El color de un estudio vive donde lo edita la propietaria, que es el tema:
//
//   1. `studio_theme.config_published.primary` — lo que elige en Configuración
//      → Marca. Solo 3 de los 11 lo tienen publicado.
//   2. El preset de `studios.tema_portal` (`presetAThemeConfig`) — de donde cae
//      el panel cuando aún no hay tema publicado. Los 8 restantes se ven en
//      oliva `#343825` por aquí, no en índigo.
//   3. `studios.color_primario` queda como último recurso defensivo. En
//      producción no lo alcanza nadie, y es a propósito: si volviera a mandar,
//      volvería el índigo.
//
// Es el mismo orden que resuelve `getThemePublicado` para el panel y el portal.
// La regla vive aquí, suelta y con test, porque el correo no puede importar
// `lib/theme-data.ts` (arrastra el cliente service-role) ni `theme-runtime`
// (arrastra el runtime del portal entero).
// ─────────────────────────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Un color de marca, siempre `#rrggbb`, o `null`. El tema admite `#abc`
 * (`hexSchema`, lib/theme-schema.ts) y aquí se expande a `#aabbcc` en vez de
 * descartarlo: descartado, /reservar, los correos y la integración sin marco
 * caían a otro color mientras el panel enseñaba el que ella eligió. Es el
 * único sitio que lo expande (la vista previa sin marco del panel lo usa
 * también, ver lib/widget/estilo-nativa.ts). Sale siempre con seis cifras,
 * como hasta ahora: el bundle de la nativa no acepta otra cosa
 * (`leerDatosEstiloNativa`).
 */
export function hexDeMarca(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!HEX.test(t)) return null;
  return t.length === 4 ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : t;
}

/**
 * El color principal del correo, en orden: lo que eligió, lo que su preset
 * pinta en el panel, y solo entonces la columna vieja. `null` si no hay nada
 * válido en ninguno — la paleta cae entonces al del kit.
 */
export function colorMarcaDelEstudio(
  primaryDelTema: unknown,
  primaryDelPreset: unknown,
  colorColumna: unknown,
): string | null {
  return hexDeMarca(primaryDelTema) ?? hexDeMarca(primaryDelPreset) ?? hexDeMarca(colorColumna);
}

/**
 * El secundario, que en el correo pinta el botón. Mismo orden, sin columna: no
 * hay ningún `color_secundario` en `studios`.
 */
export function colorSecundarioDelEstudio(
  secondaryDelTema: unknown,
  secondaryDelPreset: unknown,
): string | null {
  return hexDeMarca(secondaryDelTema) ?? hexDeMarca(secondaryDelPreset);
}
