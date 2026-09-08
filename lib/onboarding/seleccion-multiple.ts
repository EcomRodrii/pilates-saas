// Selección de los pasos `multi` del asistente de bienvenida.
//
// Vive aquí y no dentro del componente porque el bug que arregla era de
// LÓGICA, no de pintura, y así queda cubierto por `node --test` sin montar
// React — mismo criterio que `borrador-wizard.ts`.
//
// El comportamiento anterior, inline en `elegir`, era:
//
//     else if (sel.length < paso.multi) sel.push(valor);
//     else { sel.shift(); sel.push(valor); }
//
// es decir: al llegar al tope, la opción más antigua se caía en silencio para
// hacer sitio a la nueva. Medido en producción con una propietaria real:
//
//   · Paso «¿Cómo cobras a tus alumnas?» (tope 2). Marcó las tres opciones
//     que usa de verdad —bonos, cuota mensual y clase suelta—. Se guardaron
//     «Cuota mensual · Clase suelta» y desapareció **Bonos de sesiones**, que
//     en un estudio de Pilates es el producto principal. El paso no anunciaba
//     ningún tope, así que no había forma de sospecharlo: el estudio se montó
//     sin bonos y eso solo se descubre al ir a Configuración → Planes.
//
//   · Paso «¿Qué clases das?» (tope 4). Con Reformer, Mat, Prenatal y Suelo
//     pélvico marcadas, pulsar una quinta borró **Reformer**.
//
// Ahora el tope no sustituye: rechaza. Quitar es explícito y lo decide quien
// contesta, que es lo que ya esperaba que pasara.

export type ResultadoSeleccion = {
  /** La selección resultante. Es un array nuevo; nunca se muta la entrada. */
  seleccion: string[];
  /**
   * `true` cuando el clic se ha rechazado por estar el tope lleno. Quien lo
   * llama lo usa para avisar; la selección vuelve intacta.
   */
  topeAlcanzado: boolean;
};

/**
 * Marca o desmarca `valor` respetando `tope`.
 *
 * Desmarcar siempre funciona, también con el tope lleno: es la salida para
 * cambiar de opinión.
 */
export function alternarSeleccion(
  seleccionActual: readonly string[],
  valor: string,
  tope: number,
): ResultadoSeleccion {
  const seleccion = [...seleccionActual];
  const i = seleccion.indexOf(valor);

  if (i >= 0) {
    seleccion.splice(i, 1);
    return { seleccion, topeAlcanzado: false };
  }

  if (seleccion.length >= tope) {
    return { seleccion, topeAlcanzado: true };
  }

  seleccion.push(valor);
  return { seleccion, topeAlcanzado: false };
}
