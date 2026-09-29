// A qué piezas de su web llega el estilo de sus widgets al aplicarlo.
//
// La confirmación de «Aplicar en mi web» (Fase B del constructor) nombra lo que
// cambia. ⚠️ Solo puede nombrar lo que se COPIÓ desde el constructor: la firma
// de lo copiado (`copiado`, ./config.ts) es lo único que sabemos, y no dice si
// de verdad está pegado, ni si pegó otro código a mano. Por eso el texto dice
// «los que copiaste desde aquí» y nunca «tus N widgets».
//
// ⚠️ Y solo si lo copiado sigue siendo el código de AHORA: si su firma ya no
// coincide con la de su configuración actual (lo cambió después de copiarlo),
// no sabemos qué lleva lo pegado —quizá un diseño propio que ya quitó, o la
// forma de antes— y no se nombra en ninguna línea. Es la misma comparación que
// avisa de «Cambiado después de copiarlo» (`firmaCodigo`, ./integracion.ts).
//
// Qué cuenta, por método (el que se usa de verdad, `metodoEnWeb`):
//   · iframe y ventana encima: cambian, salvo con diseño propio en su código
//     (`tieneDisenoEnCodigo`: a esos /reservar no les pasa el estilo).
//     ⚠️ Salvo también «Siete días en columnas» (`diseno=ligero`) con un estilo
//     que se ve de NOCHE: esa rejilla pinta sus celdas en blanco fijo, así que
//     /reservar no le pasa la paleta (`widgetDecide`) y de este estilo solo le
//     llegan la letra, las esquinas, la separación y el pie. Van aparte.
//     El BOTÓN que abre la ventana tiene sus propias listas (Fase D): sigue
//     el estilo si el código copiado lee sus variables (`copiado.botonVivo`);
//     si no, es de un código anterior y se queda con el color de cuando se
//     copió. ⚠️ Las dos, solo si ESTE borrador cambia cómo se ve ese botón
//     (`cambiaElBotonDeLaVentana`): con solo la letra o la separación no hay
//     nada que decir de él, y nombrarlo haría creer que cambia.
//   · sin marco (nativa, Fase E): cambia, aunque se pegara hace tiempo: el
//     estilo le llega con sus datos, no con su código. Salvo con diseño propio
//     en sus `data-*` (`tieneDisenoEnCodigo(c, 'nativa')`, que no es la regla
//     del iframe: la nativa solo entiende marca, fondo, tinta y letra). Y salvo
//     «Siete días en columnas» (lo de por defecto sin marco) con un estilo de
//     NOCHE: como en el iframe, de él solo le llega la letra (`sinMarcoSoloLetra`).
//   · enlace y botón: abren la página suelta, que se ve como la app.
// Un widget con diseño propio no cuenta en ninguno: la confirmación ya dice
// que esos no cambian.
//
// Puro, sin React: lo leen los tests de `node --test`.

import { WIDGETS, esDisponible, type MetodoIntegracion, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor, type Copiado } from './config.ts';
import { firmaCodigo, lectorDePares, paresNativa, tieneDisenoEnCodigo, urlEmbebido } from './integracion.ts';
import { metodoEnWeb, type PlataformaWeb } from './recetas.ts';
import { resolverApariencia } from '../reservar/apariencia-widget.ts';
import { nativaTraeDisenoPropio, resolverConfigWidget } from '../reservar/config-widget.ts';
import { cambiaElBotonDeLaVentana, resolverEstiloWeb, urlTraeDisenoPropio, type BaseEstiloWeb } from '../reservar/estilo-web.ts';
import type { WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { paletaEfectivaReservar } from '../reservar/precedencia-tema.ts';
import { temaAppParaReservar } from '../reservar/tema-app.ts';
import { datosEstiloNativaDeBase, estiloDeLaNativa } from '../widget/estilo-nativa.ts';

export interface PiezasAfectadas {
  /** Los nombres de los widgets copiados que cambian, en el orden del catálogo. */
  cambian: string[];
  /**
   * Los copiados en «Siete días en columnas» con un estilo de noche: de él
   * solo les llegan la letra, las esquinas, la separación y el pie (ver
   * `columnasSinPaleta`). Nunca están también en `cambian`.
   */
  columnasSinPaleta: string[];
  /**
   * Fase D: los que van en una ventana encima cuyo botón sigue el estilo (se
   * copió leyendo sus variables, `copiado.botonVivo`): también cambia. Vacía
   * si este borrador no cambia cómo se ve ese botón.
   */
  botonesVivos: string[];
  /**
   * Los mismos, copiados sin esa marca: su botón lleva el color literal de
   * cuando se copió y se queda como está. Nunca están también en
   * `botonesVivos`, y vacía en el mismo caso.
   */
  botonesCongelados: string[];
  /**
   * Fase E: los copiados sin marco a los que llega el estilo. Van TAMBIÉN en
   * `cambian`: la frase de arriba ya los cuenta, y esta dice que les llega
   * aunque se pegaran hace tiempo (o que vuelven a su aspecto de siempre, con
   * un borrador neutro).
   */
  sinMarco: string[];
  /**
   * Fase E: sin marco y en «Siete días en columnas» con un estilo de noche; de
   * él solo les llega la letra (`sinMarcoSoloLetra`). Nunca en `cambian`.
   */
  sinMarcoSoloLetra: string[];
  /**
   * Alguno copiado va sin marco y sin diseño propio en su código (está en
   * `sinMarco` o en `sinMarcoSoloLetra`). Se queda hasta que el panel deje de
   * leerlo (pista 2 de la Fase E); entonces se borra, con su línea de test.
   */
  hayNativa: boolean;
  /** Alguno copiado es un enlace o un botón a la página: se ve como la app. */
  hayPagina: boolean;
}

/**
 * Con qué se generó lo copiado (lo mismo que `EntradaIntegracion` menos el
 * widget y su config): hace falta para rehacer su firma. Las configs, como las
 * ve el constructor al copiar —sin los tipos, instructoras o salas ya borrados—,
 * o la firma no coincidiría nunca.
 */
export interface DatosAfectados {
  configs: Readonly<Record<string, ConfigConstructor>>;
  copiados: Readonly<Record<string, Copiado>>;
  plataforma: PlataformaWeb | null;
  origen: string;
  slug: string;
  colorEstudio: string | null;
  /** El estilo que se va a aplicar (el borrador). */
  estilo: WidgetWeb | null;
  /** Lo que hay en su web ahora (`null` = nada elegido): con él se sabe si el botón de la ventana cambia. */
  publicado: WidgetWeb | null;
  /** Con qué se resuelve. `null` mientras carga: sin él no se sabe si es de noche. */
  base: BaseEstiloWeb | null;
}

/** El origen con el que se rehace la URL del widget: no se pide a nadie, solo se lee su `?…`. */
const ORIGEN_LOCAL = 'https://tentare.invalid';

/**
 * ¿Se queda este widget SIN la paleta del estilo de su web? Pasa con «Siete
 * días en columnas» (`diseno=ligero`) cuando el estilo se ve de noche —Carbón,
 * o fundido sobre una web oscura—: la rejilla es de neutros fijos de día, y
 * /reservar deja que decida ella (`widgetDecide`, ../reservar/precedencia-tema.ts).
 *
 * No se imita la regla: se hace EXACTAMENTE lo que hace /reservar/[slug] con la
 * URL que lleva el código de este widget (su `page.tsx`, donde se resuelven
 * `estiloWeb`, `apariencia` y `paleta`), y se mira si la paleta que sale es la
 * del estilo de su web. Si mañana cambia esa regla, esto cambia con ella.
 *
 * `false` con un diseño propio en el código (a ese no le llega nada del estilo:
 * es otra línea de la confirmación) y fuera de iframe y ventana encima.
 */
export function columnasSinPaleta(
  w: WidgetDisponible, c: ConfigConstructor, metodo: MetodoIntegracion, estilo: WidgetWeb | null, base: BaseEstiloWeb,
): boolean {
  if (metodo !== 'iframe' && metodo !== 'popup') return false;
  const params = new URL(urlEmbebido({ widget: w, config: c, origen: ORIGEN_LOCAL, slug: 'estudio' }, metodo)).searchParams;
  if (urlTraeDisenoPropio(params)) return false;
  // La ventana encima la abre /widget-popup.js con `ventana=1`: ahí no se funde.
  const web = resolverEstiloWeb(estilo, base, metodo === 'popup' ? 'ventana' : 'dentro');
  // Sin colores del estilo de su web no hay paleta que perder.
  if (!web?.varsEnLinea) return false;
  const config = resolverConfigWidget(params);
  const paleta = paletaEfectivaReservar(
    resolverApariencia(web.capa, params), true, temaAppParaReservar(base.app),
    { marca: config.colorPrimario, ligero: config.diseno === 'ligero' }, web,
  );
  // Con el estilo de su web, la página pasa sus variables tal cual; si decide
  // el widget, escribe las suyas. Solo el `diseno=ligero` llega hasta aquí
  // (los colores del snippet son diseño propio y ya han salido arriba), pero se
  // pregunta igual: la frase que acompaña a esto habla de las columnas.
  return config.diseno === 'ligero' && paleta.varsEnLinea !== web.varsEnLinea;
}

/**
 * ¿Se queda esta nativa con solo la letra del estilo? Lo que hará el bundle con
 * el código de este widget: sus `data-*` (`paresNativa`, como los leerá
 * `dataset`) → `resolverConfigWidget` → columnas o días, y `estiloDeLaNativa`
 * con el borrador. Pasa con «Siete días en columnas» (lo de por defecto sin
 * marco) y un estilo que se ve de noche, como en el iframe (`columnasSinPaleta`).
 *
 * `false` con diseño propio en el código: a esa no le llega nada del estilo, y
 * es otra línea de la confirmación.
 */
export function sinMarcoSoloLetra(w: WidgetDisponible, c: ConfigConstructor, estilo: WidgetWeb | null, base: BaseEstiloWeb): boolean {
  const params = lectorDePares(paresNativa({ widget: w, config: c, origen: ORIGEN_LOCAL, slug: 'estudio' }));
  if (nativaTraeDisenoPropio(params)) return false;
  const columnas = resolverConfigWidget(params).diseno !== 'completo';
  return estiloDeLaNativa(datosEstiloNativaDeBase(estilo, base), { columnas })?.soloLetra === true;
}

export function piezasAfectadas(d: DatosAfectados): PiezasAfectadas {
  const out: PiezasAfectadas = {
    cambian: [], columnasSinPaleta: [], botonesVivos: [], botonesCongelados: [], sinMarco: [], sinMarcoSoloLetra: [],
    hayNativa: false, hayPagina: false,
  };
  // Sin base no se sabe cómo se ve (nadie enseña la confirmación así): no se afirma nada del botón.
  const botonCambia = !!d.base && cambiaElBotonDeLaVentana(d.publicado, d.estilo, d.base);
  for (const w of WIDGETS) {
    const copiado = d.copiados[w.id];
    if (!esDisponible(w) || !copiado) continue;
    const c = d.configs[w.id] ?? CONFIG_POR_DEFECTO;
    const metodo = metodoEnWeb(c, w, d.plataforma);
    const entrada = { widget: w, config: c, origen: d.origen, slug: d.slug, colorEstudio: d.colorEstudio };
    // Cambiado después de copiarlo: no sabemos qué hay pegado (cabecera).
    if (copiado.firma !== firmaCodigo(entrada, metodo)) continue;
    // Con la regla de SU método: la nativa solo entiende parte del diseño propio.
    if (tieneDisenoEnCodigo(c, metodo)) continue;
    if (metodo === 'iframe' || metodo === 'popup') {
      if (d.base && columnasSinPaleta(w, c, metodo, d.estilo, d.base)) out.columnasSinPaleta.push(w.nombre);
      else out.cambian.push(w.nombre);
      if (metodo === 'popup' && botonCambia) (copiado.botonVivo === true ? out.botonesVivos : out.botonesCongelados).push(w.nombre);
    } else if (metodo === 'nativa') {
      out.hayNativa = true;
      // Sin base (cargando) no se sabe si es de noche: cambia, el mismo
      // criterio que `columnasSinPaleta`. Un borrador neutro también cambia:
      // vuelve a su aspecto de siempre.
      if (d.base && sinMarcoSoloLetra(w, c, d.estilo, d.base)) out.sinMarcoSoloLetra.push(w.nombre);
      else {
        out.cambian.push(w.nombre);
        out.sinMarco.push(w.nombre);
      }
    } else {
      out.hayPagina = true;
    }
  }
  return out;
}
