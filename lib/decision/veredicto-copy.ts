// Los textos del veredicto del día (components/decision/veredicto-del-dia.tsx)
// que dependen de cifras, aquí y puros para poder probarlos sin pantalla
// (veredicto-copy.test.ts, que además vigila que no vuelvan los de antes).
//
// Regla: dicen lo que ha pasado, nunca cómo está el estudio. La pantalla
// llegó a decir que todo iba bien con un cobro rechazado del piloto dentro, o
// con nueve sugerencias abiertas a un clic (las frases vetadas, en el test).

export const TITULO_SILENCIO = 'Hoy no te interrumpo con nada.';
export const TITULO_RESPONDIDO = 'Ya respondiste al mensaje de hoy.';
/** MENSAJE cuya recomendación el servidor no encuentra ni viva ni resuelta hoy. */
export const TITULO_YA_NO_PENDIENTE = 'El mensaje de hoy ya no está pendiente.';
export const TITULO_POSPUESTA = 'Lo has dejado para más adelante.';
export const SIGUE_EN_EL_DETALLE = 'Sigue en el detalle.';
/** El análisis corre una vez al día, por la tarde (14:30 UTC): hasta entonces no hay mensaje de hoy. */
export const TEXTO_SIN_ANALIZAR = 'Analizo tu estudio cada tarde y el de hoy aún no está. Si lo quieres ya, pulsa «Analizar ahora».';

const acciones = (n: number) => `${n} ${n === 1 ? 'acción' : 'acciones'}`;

/**
 * Lo que el piloto automático hizo hoy por su cuenta, dicho tal cual: las que
 * salieron (EJECUTADA) y, aparte, las que no (FALLIDA). `null` si no hizo nada.
 * Antes el titular sumaba en «resueltas» las aprobadas que aún no habían hecho
 * nada y las que habían fallado.
 */
export function lineaDelPiloto(ejecutadas: number, fallidas: number): string | null {
  if (ejecutadas <= 0 && fallidas <= 0) return null;
  const hecho = ejecutadas > 0
    ? `Tentare ha resuelto ${acciones(ejecutadas)} por su cuenta.`
    : `Tentare ha intentado ${acciones(fallidas)} por su cuenta.`;
  if (fallidas <= 0) return hecho;
  const noSalio = fallidas === 1 ? '1 no salió: lo ves en Actividad.' : `${fallidas} no salieron: las ves en Actividad.`;
  return `${hecho} ${noSalio}`;
}

/**
 * Lo pendiente que sigue ahí aunque hoy no interrumpa por ello: cuánto y dónde,
 * sin calificarlo. `null` si no hay nada.
 */
export function lineaEnSeguimiento(total: number): string | null {
  if (total <= 0) return null;
  return total === 1
    ? 'Tienes 1 sugerencia en seguimiento; la ves en el detalle.'
    : `Tienes ${total} sugerencias en seguimiento; las ves en el detalle.`;
}
