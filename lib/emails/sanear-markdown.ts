// ─────────────────────────────────────────────────────────────────────────────
// Saneado del cuerpo Markdown que escribe la propietaria.
//
// Comprobado contra @react-email/components 1.0.12: <Markdown> NO sanea nada.
// Un `<script>alert(1)</script>` sale tal cual en el HTML, un
// `<img src=x onerror=...>` también, y `[pincha](javascript:alert(1))` se
// renderiza como <a href="javascript:alert(1)">. Ese HTML no solo se manda por
// correo: la vista previa del panel lo pinta en un iframe, y cualquier pantalla
// futura que lo enseñe sin sandbox sería XSS almacenado. Este repo ya se comió
// uno por document.write (#544/#549), y ahí también parecía inofensivo.
//
// La postura es lista blanca, no lista negra: no se intenta adivinar qué
// etiqueta es peligrosa, sencillamente NINGUNA etiqueta cruda pasa. Lo que la
// propietaria escriba entre < > se ve como texto, que es exactamente lo que
// esperaría alguien que no sabe HTML y justo lo que no le sirve a quien sí.
// ─────────────────────────────────────────────────────────────────────────────

// Esquemas que tienen sentido en un correo a una clienta. Todo lo demás
// (javascript:, data:, vbscript:, file:...) se neutraliza.
const ESQUEMAS_PERMITIDOS = ['http:', 'https:', 'mailto:', 'tel:'];

// Un salto de línea o un tabulador metidos dentro del esquema son el truco de
// toda la vida para colar `java\nscript:`, y hay parsers que lo toleran. Se
// comprueba por punto de código en vez de con un rango en la expresión regular:
// un literal de control en el fuente deja el fichero ilegible para grep, que ya
// es un problema conocido en dos ficheros de este repo.
function tieneControlOEspacio(texto: string): boolean {
  for (const caracter of texto) {
    if ((caracter.codePointAt(0) ?? 0) <= 0x20) return true;
  }
  return false;
}

/**
 * ¿Es un destino de enlace aceptable? Exige esquema absoluto: una URL relativa
 * en un correo no lleva a ninguna parte (no hay página base), y `//host` se
 * queda fuera a propósito — hereda el esquema y no es evidente al leerla.
 */
export function esEnlaceSeguro(url: string): boolean {
  const limpia = url.trim();
  if (limpia === '' || tieneControlOEspacio(limpia)) return false;
  try {
    return ESQUEMAS_PERMITIDOS.includes(new URL(limpia).protocol);
  } catch {
    return false;
  }
}

/**
 * Deja el Markdown listo para `<Markdown>`:
 *
 * 1. Neutraliza cualquier etiqueta cruda escapando `<`. No se borra el texto:
 *    quien escriba `<b>hola</b>` verá `<b>hola</b>` en su correo y entenderá
 *    solo que ahí no se puede meter HTML. Borrarlo en silencio haría pensar
 *    que se ha perdido texto.
 * 2. Deja el texto pero quita el enlace de cualquier `[texto](url)` cuyo
 *    destino no sea http/https/mailto/tel. En una imagen `![alt](url)` no
 *    queda nada que enseñar, así que se conserva el texto alternativo.
 *
 * Idempotente: pasarlo dos veces da el mismo resultado.
 */
export function sanearMarkdown(md: string): string {
  // Solo se escapa `<`, que es lo único que puede abrir una etiqueta. El `&` se
  // deja en paz a propósito: escaparlo también rompía la idempotencia (el
  // `&lt;` de la primera pasada se convertía en `&amp;lt;` en la segunda) y no
  // aporta nada de seguridad. El precio es que quien escriba literalmente
  // `&lt;` verá un `<` — cosmético, y a cambio sanear dos veces es inocuo.
  return quitarEnlacesInseguros(md.replace(/</g, '&lt;'));
}

// Se recorre a mano en vez de con una expresión regular porque el destino de un
// enlace puede llevar paréntesis dentro: con `[x](javascript:alert(1))`, un
// `[^)\s]*` corta en el primer `)` y deja un `)` suelto en el texto — que es
// exactamente el fallo que cazó el test. Aquí se cuenta la profundidad.
function quitarEnlacesInseguros(md: string): string {
  let salida = '';
  let i = 0;
  while (i < md.length) {
    const abreTexto = md.indexOf('[', i);
    if (abreTexto === -1) return salida + md.slice(i);

    const cierraTexto = md.indexOf(']', abreTexto);
    // No es un enlace: `[` suelto, o `]` sin `(` detrás. Se copia y se sigue.
    if (cierraTexto === -1 || md[cierraTexto + 1] !== '(') {
      salida += md.slice(i, abreTexto + 1);
      i = abreTexto + 1;
      continue;
    }

    let j = cierraTexto + 2;
    let profundidad = 1;
    while (j < md.length && profundidad > 0) {
      if (md[j] === '(') profundidad++;
      else if (md[j] === ')') profundidad--;
      if (profundidad === 0) break;
      j++;
    }
    if (profundidad !== 0) {
      // Paréntesis sin cerrar: no es un enlace bien formado, se deja tal cual.
      salida += md.slice(i, abreTexto + 1);
      i = abreTexto + 1;
      continue;
    }

    // `![alt](...)`: la marca de imagen va justo antes del corchete.
    const esImagen = abreTexto > 0 && md[abreTexto - 1] === '!';
    const inicio = esImagen ? abreTexto - 1 : abreTexto;
    const texto = md.slice(abreTexto + 1, cierraTexto);
    // El destino es lo primero que hay dentro; lo que le siga es el título.
    const url = md.slice(cierraTexto + 2, j).trim().split(/\s+/)[0] ?? '';

    salida += md.slice(i, inicio);
    salida += esEnlaceSeguro(url) ? md.slice(inicio, j + 1) : texto;
    i = j + 1;
  }
  return salida;
}
