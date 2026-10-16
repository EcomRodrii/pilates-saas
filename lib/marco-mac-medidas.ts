// Las medidas del MacBook dibujado del panel (`MarcoMac`, components/ui/marco-mac.tsx),
// sin React (node --test). El portátil se adapta al ANCHO que haya: la tapa (marco negro
// fino con el notch arriba en el centro) y, debajo, la base de aluminio con la muesca para
// abrirlo. Todo sale del ancho, para que nada se salga de su sitio a ningún tamaño.
//
// Proporciones de un MacBook Pro de 14": pantalla 3024 × 1964 (≈ 1,54), notch de ~13 % del
// ancho y ~2,1 % de alto, marco de ~1,2 %; la base asoma un poco por los lados de la tapa.

/** Ancho de la pantalla entre su alto (MacBook Pro de 14"). */
export const PROPORCION_PANTALLA_MAC = 3024 / 1964;

export interface MedidasMac {
  /** El ancho de la tapa (marco incluido); va centrada sobre la base. */
  tapa: number;
  /** El marco negro alrededor de la pantalla (a los lados y arriba). */
  bisel: number;
  /** El marco de abajo, algo más grueso, como en el aparato. */
  biselInferior: number;
  /** La pantalla, por dentro del marco. */
  pantalla: { ancho: number; alto: number };
  /** El notch: arriba en el centro, dentro de la pantalla. */
  notch: { ancho: number; alto: number };
  /**
   * Lo que el contenido deja libre arriba para que el notch no tape nada: una barra del
   * alto del notch (la barra de menús del Mac). El contenido empieza por debajo.
   */
  barraSuperior: number;
  /** La base de aluminio (todo el ancho) y la muesca para abrir, centrada en su borde de arriba. */
  base: { ancho: number; alto: number };
  muesca: { ancho: number; alto: number };
}

/** `ancho`: lo que hay para el portátil entero (la base es lo más ancho). */
export function medidasMac(ancho: number): MedidasMac {
  const total = Math.max(0, Math.floor(ancho));
  // La base asoma un 3 % por cada lado de la tapa.
  const tapa = Math.round(total * 0.94);
  const bisel = Math.max(5, Math.round(tapa * 0.012));
  const biselInferior = Math.round(bisel * 1.6);
  const anchoPantalla = Math.max(0, tapa - 2 * bisel);
  const notch = {
    ancho: Math.max(48, Math.round(anchoPantalla * 0.13)),
    alto: Math.max(10, Math.round(anchoPantalla * 0.021)),
  };
  const base = { ancho: total, alto: Math.max(8, Math.round(total * 0.026)) };
  return {
    tapa,
    bisel,
    biselInferior,
    pantalla: { ancho: anchoPantalla, alto: Math.round(anchoPantalla / PROPORCION_PANTALLA_MAC) },
    notch,
    barraSuperior: notch.alto,
    base,
    muesca: { ancho: Math.round(total * 0.14), alto: Math.max(3, Math.round(base.alto * 0.45)) },
  };
}
