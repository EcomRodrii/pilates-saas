// En qué punto del flujo de reserva está la persona, para poder decírselo.
//
// El modal tiene NUEVE pasos y hasta ahora solo dos («datos» y «pago») decían
// cuál era: un «Paso 1 de 2» en texto plano. Los otros siete no decían nada, y
// el camino más largo —entrar, dar el nombre, aceptar los términos, confirmar—
// son cuatro pantallas seguidas sin ninguna pista de cuántas quedan.
//
// ⚠️ El total NO se puede saber siempre, y por eso esto devuelve `null` en vez
// de inventarlo. Desde «login» hay dos continuaciones posibles según lo que
// diga el servidor (quien ya tiene ficha y contrato firmado va directo a
// confirmar; quien no, pasa por nombre y términos), así que anunciar «paso 1 de
// 4» ahí sería mentir la mitad de las veces. Un indicador que se contradice a
// sí mismo a mitad de camino es peor que no tener ninguno.

/** Los pasos del modal que forman parte de una secuencia con principio y fin. */
export type PasoFlujo =
  | 'login' | 'datos' | 'pago' | 'registro' | 'contrato' | 'confirm'
  | 'done' | 'espera' | 'pendiente';

export interface Recorrido {
  /** Las etiquetas de los pasos, en orden. */
  etiquetas: string[];
  /** El índice del paso actual dentro de `etiquetas`. */
  actual: number;
}

/**
 * El recorrido al que pertenece un paso, o `null` si no forma parte de ninguno.
 *
 * `null` para los pasos terminales (`done`/`espera`/`pendiente`: ya no hay
 * nada por delante que anunciar) y para `login`, que es la puerta de entrada
 * —todavía no se sabe qué camino tocará— y no un paso numerable.
 *
 * ⚠️ `datos`/`pago` volvieron a `null` en la Fase 2 del rediseño de la
 * pantalla de reserva (docs/rediseno-pantalla-reserva-diseno.md): ya no son
 * dos hojas separadas con «‹ Datos»/«‹ Pago» — `PantallaReserva` los funde en
 * un único scroll continuo a propósito ("sin pasos fragmentados tipo
 * wizard", pedido explícito), así que ya no hay un «Paso 1 de 2» que anunciar.
 */
export function recorridoDe(paso: PasoFlujo): Recorrido | null {
  switch (paso) {
    // Alta con contrato: tres pantallas, y aquí sí se conocen las tres — al
    // llegar a `registro` el servidor ya dijo que hace falta ficha y firma.
    case 'registro': return { etiquetas: ['Tus datos', 'Términos', 'Confirmar'], actual: 0 };
    case 'contrato': return { etiquetas: ['Tus datos', 'Términos', 'Confirmar'], actual: 1 };

    // `confirm` se alcanza por dos caminos distintos: desde `contrato` (es el
    // tercero de tres) o directo desde `login` cuando ya está todo firmado (es
    // el único paso que queda). Como no se puede distinguir mirando solo el
    // paso, no se numera: se enseña sin recorrido, que es lo honesto.
    case 'confirm':

    case 'datos':
    case 'pago':
    case 'login':
    case 'done':
    case 'espera':
    case 'pendiente':
      return null;
  }
}

/** El texto de apoyo, para lectores de pantalla y para el rótulo compacto. */
export function textoPaso(r: Recorrido): string {
  return `Paso ${r.actual + 1} de ${r.etiquetas.length}`;
}
