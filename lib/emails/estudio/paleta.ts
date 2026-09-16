// ─────────────────────────────────────────────────────────────────────────────
// La paleta de un correo del ESTUDIO a sus alumnas, derivada de su marca.
//
// Todo lo que se pinta sale de aquí. Ninguna plantilla escribe un hex: si una
// lo hiciera, el correo dejaría de ser del estudio en ese trozo — que es
// exactamente lo que pasaba antes (`#FAFAF7`, `#374151` y `#E5E1DA` repetidos
// en las 25 plantillas, iguales para todos los estudios).
//
// El encargo es «convierte todo a MIS colores», así que el fondo arena, el
// papel de la tarjeta, el borde y hasta el gris del pie llevan el MATIZ de su
// color de marca. Un estudio oliva recibe un arena verdoso; uno magenta, un
// arena rosado. La luminosidad es la misma en los dos —es lo que hace que el
// correo se lea— y solo cambia el tono.
//
// ⚠️ Los dos colores que van SOBRE algo (la etiqueta de la tarjeta y el texto
// del botón) no se derivan a ojo: pasan por `colorLegibleSobre` /
// `foregroundParaFondo`, el mismo criterio que usa el editor de tema del panel.
// Un color de marca pastel es legítimo —y con él una etiqueta a 11 px sobre
// arena se queda en 2:1 si nadie lo comprueba.
// ─────────────────────────────────────────────────────────────────────────────

import { hexToHsl, mezclarHex, colorLegibleSobre } from '../../color-utils.ts';
import { foregroundParaFondo, ratioContraste } from '../../wcag-contrast.ts';

/** El oliva del kit. Solo se usa cuando el estudio no ha elegido color. */
export const MARCA_POR_DEFECTO = '#343825';

/**
 * Los tres colores que NO son de marca: el filete de un correo que trae un aviso
 * con significado propio. Una clase cancelada tiene que leerse como una clase
 * cancelada aunque el estudio sea rosa, y un cobro fallido igual.
 *
 * Viven aquí y no en cada plantilla por el mismo motivo que el resto de la
 * paleta: repetidos por seis ficheros acaban divergiendo, y son justo los que
 * nadie vuelve a mirar. Se usan SOLO como `acento` (el filete de 5 px), nunca
 * como fondo de texto.
 */
export const ACENTO = {
  alerta: '#B91C1C',
  aviso: '#8F6215',
  bien: '#065F46',
} as const;

export interface PaletaCorreo {
  /** El color del estudio, tal cual. Filete superior y detalles. */
  marca: string;
  /** Fondo del correo entero, fuera de la tarjeta. El «arena». */
  arena: string;
  /** Fondo de la tarjeta: casi blanco, con el matiz de la marca. */
  papel: string;
  /** Línea de la tarjeta y separadores. */
  borde: string;
  /** Texto normal y titulares. */
  tinta: string;
  /** Texto secundario: la nota del final, el pie. AA sobre `papel` y `arena`. */
  tintaSuave: string;
  /** Etiquetas de la tarjeta de detalle. AA sobre `arena`. */
  etiqueta: string;
  /** Fondo del botón y su texto, ya resuelto por contraste. */
  boton: string;
  botonTexto: string;
  /** Enlaces dentro del cuerpo. AA sobre `papel`. */
  enlace: string;
}

/**
 * Deriva la paleta del correo a partir del color principal del estudio y, si lo
 * tiene, del secundario: si tiene cuerpo pinta el botón (el terracota de la
 * referencia sobre el verde salvia); si es casi blanco, es el fondo.
 *
 * Un hex inválido o ausente cae al color del kit: nunca sale una cadena rota,
 * que en un correo se traduce en un fondo transparente sobre el que no se lee
 * nada y que además no hay forma de ver hasta que llega a una clienta.
 */
/**
 * La base cálida de la plantilla: arena, papel y tinta. NO es el color de
 * ningún estudio — es la calidez de la que parte el correo, y sobre ella se
 * vierte un 10 % del color de marca para que un estudio oliva reciba un arena
 * verdoso y uno magenta uno rosado.
 *
 * ⚠️ Derivar el arena SOLO del color de marca se probó primero y se descartó
 * mirándolo: con una marca poco saturada (un salvia, un gris azulado) el fondo
 * salía gris de oficina, justo lo contrario de lo que se pedía. La referencia
 * hace lo mismo — su salvia, su arena y su terracota son tres tonos distintos,
 * no tres luminosidades del mismo.
 */
const BASE = {
  arena: '#F2E9DC',
  papel: '#FFFDF8',
  tinta: '#2C2A24',
  tintaSuave: '#6B6355',
} as const;

/**
 * Cuánto color de marca admite la base cálida sin ensuciarse.
 *
 * ⚠️ Mezclar en RGB dos tonos opuestos del círculo no tiñe: apaga. Un 10 % de
 * índigo sobre el arena daba un gris lila de oficina —visto en una bandeja de
 * verdad, con un tema publicado en #666dcc—. Por eso el peso cae con la
 * distancia de tono: entero hasta 60°, nada a partir de 120°. Una marca fría
 * recibe el arena cálido tal cual, que es lo que hace la referencia con su
 * salvia y su terracota: tonos distintos, no el mismo desteñido.
 */
function pesoDeMarca(marca: string): number {
  const m = hexToHsl(marca);
  const base = hexToHsl(BASE.arena);
  if (!m || !base) return 0.1;
  const d = Math.abs(m.h - base.h) % 360;
  const distancia = d > 180 ? 360 - d : d;
  if (distancia <= 60) return 0.1;
  if (distancia >= 120) return 0;
  return (0.1 * (120 - distancia)) / 60;
}

export function paletaCorreoEstudio(
  colorPrimario?: string | null,
  colorSecundario?: string | null,
  /** Elegido a mano en la plantilla: pinta el botón aunque sea claro. */
  colorBoton?: string | null,
): PaletaCorreo {
  const marca = hexToHsl(colorPrimario ?? '') ? (colorPrimario as string) : MARCA_POR_DEFECTO;
  const secundario = hexToHsl(colorSecundario ?? '') ? (colorSecundario as string) : null;
  const peso = pesoDeMarca(marca);

  // ⚠️ El `secondary` del tema NO significa lo mismo en todos: en los presets
  // es un tono oscuro de la marca (#5A6142), y en Oliva/Bloom/Noir es una
  // «superficie suave» (#ECE8E1) — ver theme-schema.ts. Usado siempre como
  // botón, dos de los tres temas publicados en producción mandaban un botón
  // beige con el texto negro, que no se ve como botón. Un secundario muy claro
  // es el fondo que el estudio eligió, así que se usa de arena; uno con cuerpo
  // pinta el botón.
  const superficie = secundario && (ratioContraste(secundario, '#FFFFFF') ?? 99) < 1.6 ? secundario : null;
  const arena = superficie ?? mezclarHex(marca, BASE.arena, peso);
  const papel = mezclarHex(marca, BASE.papel, peso * 0.3);

  const elegido = hexToHsl(colorBoton ?? '') ? (colorBoton as string) : null;
  const boton = elegido ?? (secundario && !superficie && (ratioContraste(secundario, papel) ?? 0) >= 3 ? secundario : marca);

  return {
    marca,
    arena,
    papel,
    // Ni el color de marca a pelo (un filo saturado alrededor de la tarjeta) ni
    // un gris: la marca desteñida sobre el arena, como el salvia claro de la
    // referencia. Una marca fría apenas lo toca, por lo mismo que el arena.
    borde: mezclarHex(marca, arena, 0.08 + 0.24 * (peso / 0.1)),
    tinta: mezclarHex(marca, BASE.tinta, 0.1),
    // Se calcula contra `arena`, que es el más claro de los dos fondos donde se
    // pinta: lo que cumple ahí cumple también sobre `papel`.
    tintaSuave: colorLegibleSobre(mezclarHex(marca, BASE.tintaSuave, 0.18), arena),
    etiqueta: colorLegibleSobre(marca, arena),
    boton,
    botonTexto: foregroundParaFondo(boton),
    enlace: colorLegibleSobre(marca, papel),
  };
}
