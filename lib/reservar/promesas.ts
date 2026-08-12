// Lo que la página de reservas PROMETE antes de reservar: plazo de cancelación,
// antelación mínima y desde cuándo se abre el horario.
//
// ⚠️ **La regla que se anuncia es SIEMPRE la que garantiza que nadie se quede
// fuera.** Cuál de los dos extremos sea depende de la FORMA de la regla, no de
// un criterio distinto por campo:
//
//   · «hace falta AL MENOS x» (cancelación, antelación mínima) → el x MAYOR.
//   · «solo hasta N días»     (antelación máxima)              → el N MENOR.
//
// Es una sola idea: quien lea la frase y la cumpla puede reservar y cancelar en
// CUALQUIER clase del estudio, sin excepciones. El número exacto de la suya lo
// ve al abrirla, donde ya se resolvía bien.
//
// ⚠️ Existe porque la caja «Cómo funciona» decía «Cancela gratis hasta 12 h
// antes» leyendo `studios.cancelacion_ventana_horas` a secas, mientras la hoja
// de reserva ya resolvía el plazo POR TIPO DE CLASE (`ventanaCancelacionHoras`,
// migr 0116). En un estudio donde el Reformer exige 24 h, la promesa de la
// portada se quedaba corta: alguien cancelaba a 18 h creyendo que llegaba a
// tiempo y perdía la clase. Una regla que se aplica y no se anuncia es peor que
// no tenerla.
//
// Y la antelación mínima (`reservaVentanaMinimaMinutos`) solo aparecía como
// ERROR después de intentar reservar. Decírselo a alguien DESPUÉS de que lo
// intente no es informar, es corregir.

/** Lo que hace falta de un tipo de clase. Deliberadamente mínimo. */
export interface ReglasTipo {
  ventanaCancelacionHoras: number | null;
  reservaVentanaMinimaMinutos: number | null;
  // ⚠️ Aquí `null` es ambiguo a propósito y hay que resolverlo en dos pasos:
  // en el TIPO significa «hereda del estudio», y en el ESTUDIO significa «sin
  // límite». Es el único de los tres campos con esa doble lectura — los otros
  // dos tienen un número siempre en el estudio.
  reservaAntelacionMaximaDias: number | null;
}

/** Y del estudio: sus valores por defecto, que un tipo con `null` hereda. */
export interface ReglasEstudio {
  cancelacionVentanaHoras: number;
  reservaVentanaMinimaMinutos: number;
  /** `null` = sin límite: se puede reservar por adelantado que sea. */
  reservaAntelacionMaximaDias: number | null;
}

/**
 * Los valores EFECTIVOS de una regla, uno por tipo de clase.
 *
 * Sin tipos de clase, el único valor posible es el del estudio. Con ellos, el
 * del estudio ya está incluido a través de los tipos que lo heredan (`null`),
 * así que no se añade aparte: hacerlo ensancharía el rango con un valor que no
 * se aplica a ninguna clase reservable.
 */
function valoresEfectivos(
  tipos: readonly ReglasTipo[],
  porDefecto: number,
  campo: 'ventanaCancelacionHoras' | 'reservaVentanaMinimaMinutos',
): number[] {
  if (tipos.length === 0) return [porDefecto];
  return tipos.map((t) => t[campo] ?? porDefecto);
}

/**
 * El plazo de cancelación, en una frase que nunca promete de más.
 *
 * ⚠️ Cuando los tipos no coinciden se anuncia **el más estricto**, no el más
 * suave ni la media. Equivocarse hacia el lado estricto hace que alguien
 * cancele antes de lo que necesitaba; hacia el suave le hace perder la clase.
 * Solo uno de los dos errores cuesta dinero, y es el que este orden evita.
 * El número exacto de SU clase lo ve al abrir la hoja de reserva, que ya lo
 * resuelve bien.
 */
export function frasePlazoCancelacion(
  estudio: ReglasEstudio,
  tipos: readonly ReglasTipo[],
): string {
  const horas = valoresEfectivos(tipos, estudio.cancelacionVentanaHoras, 'ventanaCancelacionHoras');
  const max = Math.max(...horas);
  // Cero significa «sin plazo», no «cero horas»: si NINGUNA clase lo exige, no
  // hay nada que avisar.
  if (max <= 0) return 'Cancela gratis cuando quieras.';
  const varia = new Set(horas).size > 1;
  return varia
    ? `Cancela gratis hasta ${max} h antes, según la clase.`
    : `Cancela gratis hasta ${max} h antes.`;
}

/**
 * La antelación mínima para reservar, o `null` si no hay ninguna.
 *
 * `null` es «no se dice nada», no una frase vacía: anunciar «reserva con 0
 * minutos de antelación» es ruido que además hace dudar de si hay truco.
 *
 * Aquí el lado seguro es el CONTRARIO al de la cancelación — se anuncia el
 * plazo MÁS LARGO, porque quedarse corto haría llegar tarde a la más estricta.
 * En los dos casos se elige el número que evita que alguien se quede fuera.
 */
export function fraseAntelacionMinima(
  estudio: ReglasEstudio,
  tipos: readonly ReglasTipo[],
): string | null {
  const minutos = valoresEfectivos(tipos, estudio.reservaVentanaMinimaMinutos, 'reservaVentanaMinimaMinutos');
  const max = Math.max(...minutos);
  if (max <= 0) return null;
  const varia = new Set(minutos).size > 1;
  const cuanto = enHorasOMinutos(max);
  return varia
    ? `Reserva con al menos ${cuanto} de antelación, según la clase.`
    : `Reserva con al menos ${cuanto} de antelación.`;
}

/**
 * 90 → «90 min»; 120 → «2 h»; 150 → «2 h 30 min».
 *
 * En minutos por debajo de la hora porque es como lo piensa quien lo configura
 * («cierro el cupo media hora antes»), y en horas por encima porque «180 min»
 * obliga a dividir mentalmente justo cuando se está decidiendo si da tiempo.
 */
export function enHorasOMinutos(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Cuántos días antes se abre el horario, o `null` si no hay tope.
 *
 * ⚠️ Se anuncia el tope MÁS CORTO — al revés que los otros dos, porque la
 * regla tiene la forma contraria («solo hasta N días» en vez de «al menos x»).
 * Sigue siendo el número que garantiza no quedarse fuera: quien lo cumpla
 * puede reservar cualquier clase.
 *
 * Una clase SIN tope no anula el aviso: que una se pueda reservar con un año
 * de antelación no ayuda a quien intenta apuntarse a la que abre a 14 días.
 * Sí cuenta como variación, así que la frase lo dice.
 */
export function fraseAntelacionMaxima(
  estudio: ReglasEstudio,
  tipos: readonly ReglasTipo[],
): string | null {
  const efectivos: (number | null)[] = tipos.length === 0
    ? [estudio.reservaAntelacionMaximaDias]
    // Doble `??` a propósito: el primero resuelve la herencia del tipo, el
    // segundo NO existe — si el estudio tampoco tiene tope, el valor efectivo
    // es `null` («sin límite») y se filtra abajo.
    : tipos.map((t) => t.reservaAntelacionMaximaDias ?? estudio.reservaAntelacionMaximaDias);

  const topes = efectivos.filter((d): d is number => d != null && d > 0);
  if (topes.length === 0) return null;

  const min = Math.min(...topes);
  const varia = new Set(efectivos.map((d) => String(d))).size > 1;
  const cuanto = min === 1 ? '1 día' : `${min} días`;
  return varia
    ? `El horario se abre ${cuanto} antes, según la clase.`
    : `El horario se abre ${cuanto} antes.`;
}
