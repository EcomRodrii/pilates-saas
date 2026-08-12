// Lo que la página de reservas PROMETE antes de reservar: plazo de cancelación
// y antelación mínima.
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
}

/** Y del estudio: sus valores por defecto, que un tipo con `null` hereda. */
export interface ReglasEstudio {
  cancelacionVentanaHoras: number;
  reservaVentanaMinimaMinutos: number;
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
