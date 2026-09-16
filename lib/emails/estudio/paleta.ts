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
import { foregroundParaFondo } from '../../wcag-contrast.ts';

/** El oliva del kit. Solo se usa cuando el estudio no ha elegido color. */
export const MARCA_POR_DEFECTO = '#343825';

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
 * tiene, del secundario (que es el que pinta el botón — el mismo papel que el
 * terracota de la referencia sobre el verde salvia).
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

export function paletaCorreoEstudio(
  colorPrimario?: string | null,
  colorSecundario?: string | null,
): PaletaCorreo {
  const marca = hexToHsl(colorPrimario ?? '') ? (colorPrimario as string) : MARCA_POR_DEFECTO;

  const arena = mezclarHex(marca, BASE.arena, 0.1);
  const papel = mezclarHex(marca, BASE.papel, 0.03);

  const secundarioValido = hexToHsl(colorSecundario ?? '') ? (colorSecundario as string) : null;
  const boton = secundarioValido ?? marca;

  return {
    marca,
    arena,
    papel,
    // Ni el color de marca a pelo (un filo saturado alrededor de la tarjeta) ni
    // un gris: la marca desteñida sobre el arena, como el salvia claro de la
    // referencia.
    borde: mezclarHex(marca, arena, 0.32),
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
