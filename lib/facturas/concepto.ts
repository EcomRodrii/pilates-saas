// El concepto de una factura, en UN solo sitio.
//
// Lo pintan cuatro consumidores —la vista previa del panel, el PDF de la
// clienta, la hoja de la socia en el portal y el XML que va a la AEAT— y antes
// cada uno llevaba su propio literal escrito a mano, con tres textos DISTINTOS
// para el mismo documento:
//
//   · panel-facturas.tsx  → «Servicios de pilates» / «Cuota mensual / bono»
//   · factura-pdf.ts      → los mismos dos
//   · verifactu/transmitir.ts → «Servicios de actividad física»
//
// Así que una factura de un «Bono 10 clases» decía lo mismo que una cuota
// mensual, y lo que veía la clienta en pantalla no era lo que se mandaba a
// Hacienda. Ahora el concepto se COPIA del recibo al sellar
// (`facturas.concepto`) y todos leen de aquí.

/** Lo que se pinta cuando la factura no lleva concepto propio. */
export const CONCEPTO_GENERICO = 'Servicios de pilates';

/**
 * Lo que la AEAT recibe como `DescripcionOperacion` cuando no hay concepto.
 *
 * Es el literal que este campo ha tenido siempre, y se conserva a propósito: las
 * facturas selladas antes de este cambio no tienen concepto guardado, y son las
 * que quedan en la cola de transmisión. Cambiarles la descripción por otra cosa
 * sería inventar lo que se le cuenta a Hacienda de una operación pasada.
 */
export const DESCRIPCION_AEAT_GENERICA = 'Servicios de actividad física';

/**
 * Tope de `<sf:DescripcionOperacion>` en el XSD de Veri*Factu (500).
 *
 * Se trunca en vez de dejar que lo rechace la AEAT: un registro rechazado
 * CONGELA toda la cadena posterior de ese estudio (ver `hayHuecoAntesDe` en
 * lib/verifactu/transmitir.ts), así que un concepto largo tumbaría la
 * facturación entera hasta que alguien lo mirase.
 */
export const MAX_DESCRIPCION_AEAT = 500;

/** Una factura, en lo poco que hace falta para resolver su concepto. */
export interface ConConcepto {
  concepto?: string | null;
}

/**
 * El concepto que se PINTA (pantalla y PDF).
 *
 * `null`/vacío = factura sellada antes de que esto existiera. No se va a buscar
 * al recibo: una factura emitida es un documento cerrado, y leer el concepto en
 * vivo haría que editar el recibo reescribiera lo que muestra una factura ya
 * sellada.
 */
export function conceptoDeFactura(f: ConConcepto): string {
  const propio = (f.concepto ?? '').trim();
  return propio || CONCEPTO_GENERICO;
}

/**
 * El concepto que va a la AEAT, ya acotado al tope del XSD.
 *
 * Se corta por caracteres y sin puntos suspensivos: esto no es una etiqueta de
 * interfaz, es el contenido de un registro fiscal — añadir un «…» sería añadir
 * un carácter que nadie escribió.
 */
export function descripcionAeatDeFactura(f: ConConcepto): string {
  const propio = (f.concepto ?? '').trim();
  if (!propio) return DESCRIPCION_AEAT_GENERICA;
  return propio.length > MAX_DESCRIPCION_AEAT ? propio.slice(0, MAX_DESCRIPCION_AEAT) : propio;
}
