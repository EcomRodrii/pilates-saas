// A qué piezas de su web llega el estilo de sus widgets al aplicarlo.
//
// La confirmación de «Aplicar en mi web» (Fase B del constructor) nombra lo que
// cambia. ⚠️ Solo puede nombrar lo que se COPIÓ desde el constructor: la firma
// de lo copiado (`copiado`, ./config.ts) es lo único que sabemos, y no dice si
// de verdad está pegado, ni si pegó otro código a mano. Por eso el texto dice
// «los que copiaste desde aquí» y nunca «tus N widgets».
//
// Qué cuenta, por método (el que se usa de verdad, `metodoEnWeb`):
//   · iframe y ventana encima: cambian, salvo con diseño propio en su código
//     (`tieneDisenoEnCodigo`: a esos /reservar no les pasa el estilo).
//   · sin marco (nativa): no sigue el estilo, lleva su propio diseño.
//   · enlace y botón: abren la página suelta, que se ve como la app.
// Un widget con diseño propio no cuenta en ninguno: la confirmación ya dice
// que esos no cambian.
//
// Puro, sin React: lo leen los tests de `node --test`.

import { WIDGETS, esDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor, type Copiado } from './config.ts';
import { tieneDisenoEnCodigo } from './integracion.ts';
import { metodoEnWeb, type PlataformaWeb } from './recetas.ts';

export interface PiezasAfectadas {
  /** Los nombres de los widgets copiados que cambian, en el orden del catálogo. */
  cambian: string[];
  /** Alguno de los que cambian va en una ventana encima: su botón no cambia (va en el código). */
  hayPopup: boolean;
  /** Alguno copiado va sin marco: ese no sigue el estilo. */
  hayNativa: boolean;
  /** Alguno copiado es un enlace o un botón a la página: se ve como la app. */
  hayPagina: boolean;
}

export function piezasAfectadas(
  configs: Readonly<Record<string, ConfigConstructor>>,
  copiados: Readonly<Record<string, Copiado>>,
  plataforma: PlataformaWeb | null,
): PiezasAfectadas {
  const out: PiezasAfectadas = { cambian: [], hayPopup: false, hayNativa: false, hayPagina: false };
  for (const w of WIDGETS) {
    if (!esDisponible(w) || !copiados[w.id]) continue;
    const c = configs[w.id] ?? CONFIG_POR_DEFECTO;
    if (tieneDisenoEnCodigo(c)) continue;
    const metodo = metodoEnWeb(c, w, plataforma);
    if (metodo === 'iframe' || metodo === 'popup') {
      out.cambian.push(w.nombre);
      if (metodo === 'popup') out.hayPopup = true;
    } else if (metodo === 'nativa') {
      out.hayNativa = true;
    } else {
      out.hayPagina = true;
    }
  }
  return out;
}
