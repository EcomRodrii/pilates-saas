import { formatEuro } from '../utils.ts';

// El total de una venta del TPV lo decide `registrar_venta_pos`, no el navegador:
// la RPC puede AÑADIR una línea que la Caja no ve —la matrícula del primer plan de
// una clienta (`reservar_matricula`, con su cupo de promoción)—. Antes la vista
// previa del cobro no la contaba: con tarjeta, «Sí, he cobrado 130 €» se
// registraba como 145 €; en efectivo, «Cambio 70» y después «Devuelve 55».
//
// Dos piezas, y las dos salen de la RPC (migración `…_pos_venta_total_esperado`):
//   · `p_solo_calcular`: calcula la venta entera y la deshace, y contesta el total
//     en su excepción `PRESUPUESTO:<total>:<matrícula>:<id del plan>`. Es lo que
//     enseña la hoja de cobro ANTES de cobrar.
//   · `p_total_esperado`: si no coincide con lo que la RPC calcula, rechaza la
//     venta con `IMPORTE_NO_COINCIDE:<esperado>:<total>:<matrícula>:<id del plan>`
//     ANTES de darla por PAGADA o de lanzar el cobro (se deshace todo en la misma
//     transacción: venta, stock, cupo de matrícula, usos del código).
//
// El id del plan y no su nombre: un nombre lleva espacios y dos puntos.

export interface Presupuesto {
  total: number;
  /** La matrícula que la RPC añade (0 si no hay). */
  matricula: number;
  /** El plan cuya matrícula se cobra (null si no hay). */
  matriculaPlanId: string | null;
}

export interface TotalNoCoincide extends Presupuesto {
  esperado: number;
}

const numero = (s: string | undefined): number | null => {
  if (s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Las partes del código `CLAVE:a:b:…` dentro del mensaje de error de la RPC, o null si no está. */
function partesDe(mensaje: string, clave: string): string[] | null {
  const m = mensaje.match(new RegExp(`(?:^|\\s)${clave}:(\\S*)`));
  return m ? m[1].split(':') : null;
}

/**
 * `PRESUPUESTO:145.00:15.00:plan-bono10` → { total: 145, matricula: 15, matriculaPlanId: 'plan-bono10' }.
 * Recibe el mensaje de error tal cual (`error.message`).
 */
export function leerPresupuesto(mensaje: string): Presupuesto | null {
  const partes = partesDe(mensaje, 'PRESUPUESTO');
  if (!partes) return null;
  const [total, matricula, ...plan] = partes;
  const t = numero(total), m = numero(matricula), planId = plan.join(':');
  if (t === null || m === null || t < 0 || m < 0) return null;
  return { total: t, matricula: m, matriculaPlanId: m > 0 && planId ? planId : null };
}

/**
 * `IMPORTE_NO_COINCIDE:130.00:145.00:15.00:plan-bono10`, el de `registrar_venta_pos`. El
 * de `confirmar_pago_venta_pos` («se cobró X y el ticket es Y») trae solo dos cifras y
 * aquí no se lee: son dos cosas distintas con el mismo nombre.
 */
export function leerTotalNoCoincide(mensaje: string): TotalNoCoincide | null {
  const partes = partesDe(mensaje, 'IMPORTE_NO_COINCIDE');
  if (!partes) return null;
  const [esperado, total, matricula, ...plan] = partes;
  const e = numero(esperado), t = numero(total), m = numero(matricula), planId = plan.join(':');
  if (e === null || t === null || m === null || t < 0 || m < 0) return null;
  return { esperado: e, total: t, matricula: m, matriculaPlanId: m > 0 && planId ? planId : null };
}

/**
 * Lo que se le dice a quien cobra cuando el servidor rechaza la venta porque el
 * total no es el que vio. La venta no existe (la RPC se deshace antes) y el
 * servidor no ha lanzado ningún cobro; pero con el TPV del banco o una
 * transferencia el dinero se mueve FUERA de Tentare antes de confirmar, y quien
 * cobra acaba de afirmar «Sí, he cobrado X». Por eso cada método dice lo suyo, y
 * nunca «no se ha cobrado nada» ni «cobra el total» a quien quizá ya cobró: solo
 * la diferencia, en el sentido que toque.
 */
export function mensajeTotalNoCoincide(
  d: Pick<TotalNoCoincide, 'esperado' | 'total' | 'matricula'>,
  metodo: string,
): string {
  const sube = d.total > d.esperado;
  const diferencia = formatEuro(Math.round(Math.abs(d.total - d.esperado) * 100) / 100);
  const motivo = sube && d.matricula > 0 ? ` porque lleva la matrícula (${formatEuro(d.matricula)})` : '';
  const total = formatEuro(d.total), esperado = formatEuro(d.esperado);
  const cabecera = `El total de esta venta es ${total}${motivo}, no ${esperado}. La venta no se ha registrado.`;
  switch (metodo) {
    case 'DATAFONO':
    case 'BIZUM':
      return `${cabecera} No se ha lanzado ningún cobro: cóbrala con el total nuevo.`;
    case 'EFECTIVO':
      return `${cabecera} Cuenta el cambio con el total nuevo.`;
    case 'TARJETA':
      return sube
        ? `${cabecera} Si ya cobraste ${esperado} en el TPV de tu banco, cobra solo los ${diferencia} que faltan —no el total otra vez— y confirma ${total}.`
        : `${cabecera} Si ya cobraste ${esperado} en el TPV de tu banco, devuelve ${diferencia} (o anula ese cobro y cobra ${total}) y confirma ${total}.`;
    case 'TRANSFERENCIA':
      return sube
        ? `${cabecera} Si ya te han transferido ${esperado}, pide solo los ${diferencia} que faltan y confirma ${total}.`
        : `${cabecera} Si ya te han transferido ${esperado}, devuelve ${diferencia} y confirma ${total}.`;
    default:
      return `${cabecera} Revisa el total antes de volver a confirmar.`;
  }
}

/** Si el rechazo no se pudiera leer: igual de cierto, sin cifras ni promesas sobre el dinero. */
export const MENSAJE_TOTAL_CAMBIADO =
  'El total de esta venta ha cambiado y la venta no se ha registrado. Revisa el total antes de volver a confirmar.';

/**
 * Una Caja abierta antes de este cambio no manda `totalEsperado`. Solo con clienta y
 * plan puede la RPC añadir una línea (la matrícula), así que solo entonces se le
 * pide que recargue: el resto de ventas no puede descuadrar por esto.
 */
export const MENSAJE_CAJA_DESACTUALIZADA =
  'Esta pantalla de la Caja es de antes de una actualización. Recarga la página y vuelve a cobrar esta venta: no se ha registrado. '
  + 'Si ya la cobraste con el TPV de tu banco o por transferencia y al recargar el total es otro, cobra o devuelve solo la diferencia, no el total otra vez.';
