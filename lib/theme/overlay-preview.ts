// Dónde pintar el overlay del preview: la etiqueta del bloque y el botón "+"
// que inserta una sección entre dos.
//
// ⚠️ **Por qué el overlay va FUERA del iframe.** El contorno de selección sí
// vive dentro (sigue el scroll sin desfase, y ya existe). Pero la etiqueta y
// el "+" no pueden: dentro los recortaría el `overflow:hidden` del marco y —
// peor— los encogería el mismo `transform: scale()` que encoge el portal, así
// que en un móvil al 45 % el "+" mediría 14 px y sería intocable. Fuera se
// pintan a tamaño real sobre un iframe pequeño, que es lo que hace Shopify.
//
// ⚠️ **El bug clásico de esta conversión**: `iframe.getBoundingClientRect()`
// medido en el PADRE **ya viene escalado** por el `transform`. Multiplicar
// otra vez por la escala da coordenadas al cuadrado. Por eso aquí la caja del
// iframe se toma como está y solo se escala lo que viene de DENTRO.

export interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface BloqueMedido {
  id: string;
  /** Caja del bloque medida DENTRO del iframe, ya relativa a su viewport. */
  caja: Caja;
}

export interface Hueco {
  /** Índice en el array de bloques donde insertaría este "+". */
  indice: number;
  /** Coordenadas ya en el espacio del panel. */
  x: number;
  y: number;
  ancho: number;
}

/**
 * La escala a la que se está viendo el iframe: **medida**, no recalculada.
 *
 * El encogido depende de dos cosas que el padre no controla juntas (el hueco
 * disponible, que mide un ResizeObserver dentro de `MarcoDispositivo`, y el
 * zoom que elige la propietaria). Recomponerla desde fuera sería duplicar esa
 * lógica y quedarse desincronizado en cuanto una de las dos cambie. Dividir el
 * ancho pintado entre el declarado da el número real, venga de donde venga.
 */
export function escalaMedida(anchoPintado: number, anchoDeclarado: number): number {
  if (anchoDeclarado <= 0) return 1;
  return anchoPintado / anchoDeclarado;
}

/**
 * Caja medida dentro del iframe → coordenadas del panel.
 *
 * `iframe` ya viene escalada (ver el aviso de arriba): se usa tal cual como
 * origen, y solo se multiplica por la escala lo que llega de dentro.
 */
export function cajaEnPanel(interna: Caja, iframe: Caja, escala: number): Caja {
  return {
    x: iframe.x + interna.x * escala,
    y: iframe.y + interna.y * escala,
    ancho: interna.ancho * escala,
    alto: interna.alto * escala,
  };
}

/** Si una caja se ve, aunque sea en parte, dentro del marco del iframe. */
export function estaALaVista(caja: Caja, iframe: Caja, margen = 0): boolean {
  return caja.y + caja.alto >= iframe.y - margen && caja.y <= iframe.y + iframe.alto + margen;
}

/**
 * Dónde va cada "+": uno ANTES del primer bloque y uno después de cada uno.
 * N bloques dan N+1 huecos, que es lo que hace falta para poder insertar
 * también al principio y al final.
 *
 * Los que quedan fuera del marco (por scroll) se descartan: un botón flotando
 * sobre el rail o bajo el borde inferior no es un hueco, es basura encima de
 * otra cosa.
 */
export function huecosDeInsercion(
  bloques: readonly BloqueMedido[],
  iframe: Caja,
  escala: number,
): Hueco[] {
  const huecos: Hueco[] = [];
  bloques.forEach((b, i) => {
    const c = cajaEnPanel(b.caja, iframe, escala);
    if (i === 0) huecos.push({ indice: 0, x: c.x, y: c.y, ancho: c.ancho });
    huecos.push({ indice: i + 1, x: c.x, y: c.y + c.alto, ancho: c.ancho });
  });
  return huecos.filter((h) => h.y >= iframe.y && h.y <= iframe.y + iframe.alto);
}
