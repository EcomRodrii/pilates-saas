// ─────────────────────────────────────────────────────────────────────────────
// «Cambiar el importe» de un recibo PENDIENTE (Cobros → ⋯ del recibo).
//
// Por qué existe: un estudio que cobra a mano (efectivo, Bizum, transferencia) cobra a veces otra cantidad que la de la tarifa —el primer
// mes de una alumna que entra a mitad de mes, un descuento pactado—. El alta crea el recibo con el precio del plan, no había manera de
// corregirlo antes de cobrar, y la única salida era dejarlo como estaba (el «Cobrado este mes» no cuadraba con el dinero que entró) o
// cobrarlo entero y devolverlo.
//
// Solo se cambia lo que AÚN NO es dinero ni tiene un pago abierto: un recibo pendiente, sin cargo de Stripe, sin sesión de pago, sin
// datáfono, sin remesa y sin ningún intento de cobro. En cuanto hay un pago en marcha, el importe es lo que se le pidió a la clienta y no
// se toca. Lo cobrado a un importe equivocado se corrige como siempre (devolverlo y volver a cobrar): eso lo cuentan las cifras
// (`lib/billing/situacion-recibo.ts`) y la rectificativa, y no se reescribe aquí.
//
// El navegador NO escribe `importe` de `recibos` (solo `estado` e `intentos_reintento`, migr `20261002094636`): lo hace la ruta de
// servidor con estas mismas reglas. Puro y sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

/** El importe más alto que se acepta a mano: un tope contra un cero de más, no una regla de negocio. */
export const IMPORTE_MAXIMO = 10000;
/** El más bajo: por debajo de esto un recibo no es un cobro (y Stripe no acepta menos de 0,50 €). */
export const IMPORTE_MINIMO = 0.5;

/** Recibos que nacen con un importe que no decide el estudio: otro módulo es su dueño. */
const PREFIJOS_CON_DUEÑO = [
  ['rec-penaliz-', 'Es una penalización: su importe lo fija la regla de cancelación.'],
  ['rec-pos-', 'Es una venta de la caja: se corrige desde la caja.'],
  ['rec-suelta-', 'Es una clase suelta: su importe es el de la tarifa de esa clase.'],
] as const;

export type ResultadoImporte = { ok: true; importe: number } | { ok: false; error: string };

/** Un importe de la petición: número con como mucho dos decimales, entre el mínimo y el máximo. */
export function validarNuevoImporte(valor: unknown): ResultadoImporte {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: 'Escribe un importe válido.' };
  const centimos = Math.round(n * 100);
  if (Math.abs(n * 100 - centimos) > 1e-6) return { ok: false, error: 'Usa como mucho dos decimales.' };
  const importe = centimos / 100;
  if (importe < IMPORTE_MINIMO) return { ok: false, error: `El importe mínimo es ${IMPORTE_MINIMO.toFixed(2).replace('.', ',')} €.` };
  if (importe > IMPORTE_MAXIMO) return { ok: false, error: 'Ese importe es demasiado alto. Revisa que no sobre ningún cero.' };
  return { ok: true, importe };
}

/** Las columnas de la base que dicen que ya hay un pago abierto o hecho: ninguna puede estar escrita. */
export const COLUMNAS_QUE_BLOQUEAN = [
  'stripe_payment_intent_id', 'checkout_session_id', 'cobro_mostrador_pi', 'cobro_mostrador_checkout_session_id',
  'cobro_off_session_clave', 'cobro_off_session_desde', 'sepa_estado', 'enviado_al_banco_en', 'disputa_estado', 'anulado_en',
] as const;

export type FilaParaCambiarImporte = {
  id: string;
  estado: string | null;
  importe: number | string | null;
  intentos_reintento?: number | null;
  factura_pendiente_sellar?: boolean | null;
  entrega_aplicada?: boolean | null;
} & { [K in (typeof COLUMNAS_QUE_BLOQUEAN)[number]]?: unknown };

export type PuedeCambiarImporte = { ok: true } | { ok: false; motivo: string };

/** ¿Se puede cambiar el importe de ESTE recibo ahora mismo? La ruta lo exige y la pantalla lo usa para ofrecer o no el botón. */
export function puedeCambiarImporte(r: FilaParaCambiarImporte): PuedeCambiarImporte {
  for (const [prefijo, motivo] of PREFIJOS_CON_DUEÑO) if (r.id.startsWith(prefijo)) return { ok: false, motivo };
  if (r.estado !== 'PENDIENTE') return { ok: false, motivo: 'Solo se puede cambiar el importe de un recibo pendiente de cobrar.' };
  if (COLUMNAS_QUE_BLOQUEAN.some(c => !!r[c])) return { ok: false, motivo: 'Ya tiene un pago abierto o en marcha: no se le puede cambiar el importe.' };
  if ((r.intentos_reintento ?? 0) > 0) return { ok: false, motivo: 'Ya se ha intentado cobrar: no se le puede cambiar el importe.' };
  if (r.factura_pendiente_sellar === true || r.entrega_aplicada === true) return { ok: false, motivo: 'Ya tiene factura o entrega aplicada: no se le puede cambiar el importe.' };
  return { ok: true };
}
