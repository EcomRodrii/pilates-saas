// Lo que dice la ventana de cancelar una cuota sobre los cobros. Tiene que ser
// 100 % cierto (decisión del fundador, 16-sep): una cuota cancelada no genera
// cobros nuevos, pero sus recibos PENDIENTES siguen la política del estudio
// (`studios.recibos_al_cancelar_cuota`, migr 20260915215311), que el trigger
// escribe en cada recibo al cancelar. Si queda algún intento de cobro posible,
// se dice; nunca «no se le volverá a cobrar» a secas.
//
// Puro: se prueba con `node --test`.

export type PoliticaRecibosAlCancelar = 'MANTENER_CON_REINTENTOS' | 'MANTENER_SIN_REINTENTOS' | 'ANULAR';

export interface ReciboPendienteDeLaCuota {
  importe: number;
  /** Tiene un cobro automático programado (dunning). */
  conReintento: boolean;
  /** Tiene un pago ya en marcha (PaymentIntent, checkout abierto o datáfono): no se puede anular. */
  pagoEnMarcha: boolean;
}

const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
const recibos = (n: number) => (n === 1 ? '1 recibo pendiente' : `${n} recibos pendientes`);

/**
 * La frase de cobros que va detrás de «deja de estar activa…». `cuando`:
 * `'ahora'` = cancelar ahora; `'al-final'` = baja al vencer (sigue activa hasta
 * su fecha y los reintentos siguen hasta entonces).
 */
export function textoCobrosAlCancelar(
  politica: PoliticaRecibosAlCancelar,
  pendientes: readonly ReciboPendienteDeLaCuota[],
  cuando: 'ahora' | 'al-final' = 'ahora',
): string {
  const base = 'No se generarán cobros nuevos de esta cuota.';
  if (pendientes.length === 0) return base;

  const total = euros(pendientes.reduce((s, r) => s + r.importe, 0));
  const cuantos = recibos(pendientes.length);

  if (cuando === 'al-final') {
    const conReintento = pendientes.some(r => r.conReintento);
    return conReintento
      ? `${base} Hasta ese día se sigue intentando cobrar ${pendientes.length === 1 ? 'el recibo pendiente' : 'los recibos pendientes'} (${total}).`
      : `${base} Le queda${pendientes.length === 1 ? '' : 'n'} ${cuantos} (${total}) en «Quién me debe».`;
  }

  switch (politica) {
    case 'MANTENER_CON_REINTENTOS': {
      const conReintento = pendientes.some(r => r.conReintento);
      return conReintento
        ? `${base} Le queda${pendientes.length === 1 ? '' : 'n'} ${cuantos} (${total}): se seguirá intentando cobrar con su método de pago guardado.`
        : `${base} Le queda${pendientes.length === 1 ? '' : 'n'} ${cuantos} (${total}) en «Quién me debe»: no se cobra solo, se cobra cuando lo marques o lo pague ella.`;
    }
    case 'MANTENER_SIN_REINTENTOS':
      return `${base} Le queda${pendientes.length === 1 ? '' : 'n'} ${cuantos} (${total}): sigue en «Quién me debe», pero no se intentará cobrar automáticamente.`;
    case 'ANULAR': {
      const bloqueados = pendientes.filter(r => r.pagoEnMarcha);
      const anulables = pendientes.filter(r => !r.pagoEnMarcha);
      const partes = [base];
      if (anulables.length > 0) {
        const t = euros(anulables.reduce((s, r) => s + r.importe, 0));
        partes.push(anulables.length === 1
          ? `El recibo pendiente de ${t} se anula y deja de deberlo.`
          : `Los ${anulables.length} recibos pendientes (${t}) se anulan y deja de deberlos.`);
      }
      if (bloqueados.length > 0) {
        const t = euros(bloqueados.reduce((s, r) => s + r.importe, 0));
        partes.push(bloqueados.length === 1
          ? `1 recibo de ${t} no se puede anular ahora porque tiene un pago en marcha: se queda pendiente, sin cobros automáticos.`
          : `${bloqueados.length} recibos (${t}) no se pueden anular ahora porque tienen un pago en marcha: se quedan pendientes, sin cobros automáticos.`);
      }
      return partes.join(' ');
    }
  }
}
