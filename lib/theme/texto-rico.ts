// Texto con negrita, cursiva y enlaces — para los campos donde la propietaria
// escribe prosa (el texto de un banner, el de un bloque de texto).
//
// ⚠️ EL FORMATO NO ES HTML, Y ESA ES LA DECISIÓN ENTERA.
//
// Lo obvio habría sido guardar `<strong>` y pintarlo con
// `dangerouslySetInnerHTML`. Eso mete una vía de XSS en un campo que rellena
// el estudio y que ve TODA su clientela — y este repo ya tiene una cicatriz
// exactamente ahí (PR #544/#549: `document.write` en factura y cierre; el
// arreglo de una instancia no cerró el patrón, hizo falta una segunda pasada).
//
// Aquí se guarda una marca mínima estilo Markdown y se PARSEA a nodos. El
// render construye elementos de React de verdad, nunca inyecta HTML. Con eso
// la clase de bug desaparece por construcción, no por acordarse de sanear:
// aunque alguien escriba `<script>` en el campo, sale como texto literal
// porque nunca hay un `innerHTML` que lo interprete.
//
// El precio: la propietaria ve las marcas mientras escribe (`**negrita**`).
// Es asumible porque la vista previa del editor ya enseña el resultado real
// al lado — no hay que imaginárselo.
//
// Marcas soportadas, y solo estas:
//   **negrita**        →  <strong>
//   *cursiva*          →  <em>
//   [texto](destino)   →  <a>, con el MISMO guardia de href que el resto

/** Un trozo de texto ya interpretado. Sin anidamiento: una marca por trozo. */
export type NodoTexto =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrita'; texto: string }
  | { tipo: 'cursiva'; texto: string }
  | { tipo: 'enlace'; texto: string; href: string };

// `**…**` antes que `*…*`: si el de una estrella fuera primero, «**hola**»
// casaría como cursiva de «*hola*» y quedaría un asterisco suelto a cada lado.
// El orden de esta alternancia ES la precedencia.
const MARCAS = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * Texto plano → nodos. Un texto sin marcas devuelve un único nodo `texto`,
 * así que un valor guardado ANTES de que este campo existiera se sigue
 * pintando igual: no hay migración.
 *
 * `hrefValido` se inyecta para no atar este módulo (puro, testeable, sin
 * dependencias) al catálogo de bloques. En producción se le pasa
 * `resolverHrefBloque`, el mismo guardia que ya filtra los enlaces de banner
 * y CTA — un `javascript:` no llega al DOM por ninguna de las dos vías.
 */
export function parsearTextoRico(
  entrada: string,
  hrefValido: (href: string) => string | null,
): NodoTexto[] {
  if (!entrada) return [];
  const nodos: NodoTexto[] = [];
  let ultimo = 0;

  // `matchAll` y no `exec` en bucle: `exec` sobre un regex con `g` arrastra
  // `lastIndex` entre llamadas, y este regex es una constante del módulo —
  // dos parseos seguidos empezarían por donde acabó el anterior.
  for (const m of entrada.matchAll(MARCAS)) {
    const i = m.index ?? 0;
    if (i > ultimo) nodos.push({ tipo: 'texto', texto: entrada.slice(ultimo, i) });

    const [todo, negrita, cursiva, textoEnlace, destino] = m;
    if (negrita !== undefined) {
      nodos.push({ tipo: 'negrita', texto: negrita });
    } else if (cursiva !== undefined) {
      nodos.push({ tipo: 'cursiva', texto: cursiva });
    } else {
      const href = hrefValido(destino);
      // Un destino que el guardia rechaza NO se convierte en enlace muerto ni
      // desaparece: se queda el texto que escribió la propietaria. Perder su
      // contenido porque la URL estaba mal sería peor que no enlazarlo.
      if (href) nodos.push({ tipo: 'enlace', texto: textoEnlace, href });
      else nodos.push({ tipo: 'texto', texto: textoEnlace });
    }
    ultimo = i + todo.length;
  }

  if (ultimo < entrada.length) nodos.push({ tipo: 'texto', texto: entrada.slice(ultimo) });
  return nodos;
}

/** ¿Este texto lleva alguna marca? Para decidir si hace falta parsear. */
export function tieneMarcas(entrada: string): boolean {
  // Copia con `lastIndex` propio: `MARCAS` es global y compartido.
  return new RegExp(MARCAS.source).test(entrada);
}

/**
 * Envuelve (o desenvuelve) la selección con una marca. Lo que hacen los tres
 * botones de la barra del campo.
 *
 * Devuelve el texto nuevo y dónde queda la selección, para poder restaurarla:
 * sin eso, el cursor salta al final después de cada clic y la propietaria
 * pierde el sitio a la segunda palabra que marca.
 */
export function alternarMarca(
  texto: string,
  desde: number,
  hasta: number,
  marca: '**' | '*',
): { texto: string; desde: number; hasta: number } {
  const seleccion = texto.slice(desde, hasta);
  if (!seleccion) return { texto, desde, hasta };

  const yaMarcada = seleccion.startsWith(marca) && seleccion.endsWith(marca)
    && seleccion.length > marca.length * 2;

  if (yaMarcada) {
    const limpio = seleccion.slice(marca.length, -marca.length);
    return {
      texto: texto.slice(0, desde) + limpio + texto.slice(hasta),
      desde,
      hasta: desde + limpio.length,
    };
  }

  const envuelto = `${marca}${seleccion}${marca}`;
  return {
    texto: texto.slice(0, desde) + envuelto + texto.slice(hasta),
    desde,
    hasta: desde + envuelto.length,
  };
}

/** Convierte la selección en enlace. Sin destino todavía: lo escribe encima. */
export function insertarEnlace(
  texto: string,
  desde: number,
  hasta: number,
): { texto: string; desde: number; hasta: number } {
  const seleccion = texto.slice(desde, hasta) || 'texto del enlace';
  const marcado = `[${seleccion}](/clases)`;
  return {
    texto: texto.slice(0, desde) + marcado + texto.slice(hasta),
    // Deja seleccionado el DESTINO, que es lo siguiente que hay que cambiar.
    desde: desde + seleccion.length + 3,
    hasta: desde + seleccion.length + 3 + '/clases'.length,
  };
}
