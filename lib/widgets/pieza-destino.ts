// El código del widget por ID — lo que resuelve el servidor (./pieza.ts explica
// el porqué).
//
// Un código pegado con `w=<id>` llega a /reservar/<slug>; un rewrite
// (next.config.ts) lo manda a /api/public/widget-pieza/<slug>, que responde con
// un 307 a la URL COMPLETA que habría llevado el código congelado de ese
// widget. Así /reservar no cambia nada: lee su URL como siempre, firma la misma
// versión para «Visto en» y cuenta la misma etiqueta.
//
// Los pares se generan con el MISMO generador que el código que se copia
// (./integracion.ts), no con uno paralelo: si divergieran, lo que se ve en su
// web no sería lo que el panel dice haber publicado. Lo ata un test:
// `firmaDeUrl(destino) === firmaContenidoDe(publicada, método)`.

import { ID_VALIDO } from '../reservar/config-widget.ts';
import { CLAVES_FIRMA } from './firma-contenido.ts';
import { esDisponible, widgetPorId } from './catalogo.ts';
import { leerConfig } from './config.ts';
import { paresNativa, urlEmbebido, urlPagina, type EntradaIntegracion } from './integracion.ts';
import { PARAM_PIEZA, type ParPieza } from './pieza.ts';

/** Lo que se guarda en `widget_piezas` (el jsonb, crudo: se valida al leerlo). */
export interface PiezaPublicada {
  widget: string;
  config: unknown;
}

const CLAVES: ReadonlySet<string> = new Set(CLAVES_FIRMA);

/**
 * La pieza como entrada del generador, o `null` si su widget ya no está
 * disponible (un widget retirado del catálogo): entonces se pinta el de por
 * defecto, igual que con un id que no existe. `origen` vacío: los destinos son
 * relativos, nunca una dirección que venga de fuera.
 */
export function entradaDePieza(p: PiezaPublicada, slug: string): EntradaIntegracion | null {
  const w = widgetPorId(p.widget);
  if (!esDisponible(w)) return null;
  // `leerConfig` valida colores, letras y opciones, pero deja pasar cualquier
  // texto en las listas (el panel solo ofrece ids del catálogo). Aquí el jsonb
  // viene de la base de datos, así que se acotan con la misma regla con la que
  // la página las lee (`leerLista`): lo que no pasaría allí no sale de aquí.
  const c = leerConfig(p.config);
  const ids = (xs: string[]) => xs.filter(x => ID_VALIDO.test(x));
  const config = {
    ...c, tipos: ids(c.tipos), instructoras: ids(c.instructoras), salas: ids(c.salas),
    sesion: c.sesion && ID_VALIDO.test(c.sesion) ? c.sesion : null,
  };
  return { widget: w, config, origen: '', slug };
}

/**
 * A dónde va un código pegado con `w=`: la URL relativa de /reservar con lo
 * publicado.
 *  - Con `embed=1` (dentro de una página, y el popup, que lo añade él), la del
 *    widget incrustado; si no, la página completa (botón y enlace), con su ancla.
 *  - De la URL que llegó se conserva todo lo que la página NO lee como parte del
 *    código (`embed`, `ventana`, `vista-previa`, `utm_*`…); lo que sí lee
 *    (`CLAVES_FIRMA`) lo pone lo publicado, y `w` se va siempre: el destino no
 *    vuelve a entrar en el rewrite.
 *  - Sin pieza (`null`): la misma dirección sin `w`, que es el widget por
 *    defecto.
 */
export function destinoDePieza(e: EntradaIntegracion | null, slug: string, entrante: URLSearchParams): string {
  if (!e) {
    const resto = new URLSearchParams();
    for (const [k, v] of entrante) if (k !== PARAM_PIEZA) resto.append(k, v);
    const q = resto.toString();
    return `/reservar/${slug}${q ? `?${q}` : ''}`;
  }
  const embebido = entrante.get('embed') === '1';
  const base = embebido
    ? urlEmbebido(e, entrante.get('ventana') === '1' ? 'popup' : 'iframe')
    : urlPagina(e);
  const [sinAncla, ancla] = base.split('#');
  const generadas = new Set(new URL(sinAncla, 'http://x').searchParams.keys());
  const extra = new URLSearchParams();
  for (const [k, v] of entrante) {
    if (k === PARAM_PIEZA || CLAVES.has(k) || generadas.has(k)) continue;
    extra.append(k, v);
  }
  const q = extra.toString();
  const union = q ? `${sinAncla}${sinAncla.includes('?') ? '&' : '?'}${q}` : sinAncla;
  return ancla ? `${union}#${ancla}` : union;
}

/** Los `data-*` que la nativa pone encima de los suyos (./pieza.ts, `datasetConPares`). */
export function paresDePiezaNativa(e: EntradaIntegracion): ParPieza[] {
  return paresNativa(e).map(([k, v]) => [k, v]);
}
