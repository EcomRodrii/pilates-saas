// El aviso de «Cobrar todos» / «Cobrar pendientes». Cuenta lo que se cobró DE
// VERDAD, no lo que había en la lista: una penalización anulada se salta del lote
// (`/api/cobros/marcar-cobrado`, `recibosDePenalizacionAnulada`) y quien cobra en el mostrador
// tiene que saber que ese importe no va, o se lo cobra a la alumna igual.

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** La frase de lo que se dejó fuera del lote: «1 no (12,00 €): es una penalización anulada…». */
export function fraseSaltados(saltados: readonly { importe: number }[]): string {
  const importe = euros.format(saltados.reduce((t, r) => t + r.importe, 0));
  return saltados.length === 1
    ? `1 no (${importe}): es una penalización anulada y no se cobra`
    : `${saltados.length} no (${importe}): son penalizaciones anuladas y no se cobran`;
}

export function textoCobroEnLote(cobrados: number, saltados: readonly { importe: number }[]): string {
  const hechos = `${cobrados} ${cobrados === 1 ? 'recibo cobrado' : 'recibos cobrados'}`;
  if (saltados.length === 0) return hechos;
  return `${hechos}. ${fraseSaltados(saltados)}.`;
}
