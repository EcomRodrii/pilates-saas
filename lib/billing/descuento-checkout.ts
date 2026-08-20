// Canje de un código de descuento en el checkout de compra de plan (auditoría
// vs Momence, motor de reglas de precio descartado por tentare-producto —
// #276: "codigos_descuento" ya existía pero NO tenía ningún punto de canje
// vivo, el único consumidor era el POS congelado). Envoltorio fino sobre
// lib/codigos-descuento.ts (puro, ya probado) para los dos endpoints que
// cobran a una socia: app/api/stripe/checkout y app/api/public/checkout-embebido.
import type { CodigoDescuento } from '../types.ts';
import { buscarCodigo, validarCodigoCanjeable, type ResultadoCanje } from '../codigos-descuento.ts';

export interface OpcionesResolverDescuento {
  hoyISO: string;
  subtotal: number;
  // "Nueva" = todavía no hay socioId resuelto (invitada comprando por primera
  // vez desde el enlace público). Es la señal disponible en ambos endpoints de
  // checkout sin consultar más tablas — no distingue "socia de hace 2 días" de
  // "socia de hace 2 años", pero sí resuelve la pregunta real de `soloNuevas`
  // ("¿esto es un alta o una socia ya con ficha?"), que es el caso de uso de
  // marketing (código de bienvenida) que este campo existe para cubrir.
  esNueva: boolean;
}

/**
 * Hueco encontrado durante el diseño (tentare-arquitecto, #canje-codigos):
 * `soloNuevas` existe en el schema y en la UI de Marketing desde siempre, pero
 * `validarCodigoCanjeable` nunca lo comprobaba — ni siquiera en el POS. Se
 * cierra aquí, en el único sitio nuevo que empieza a canjear códigos de
 * verdad, para no dejarlo abierto otra vez.
 */
export function resolverDescuentoCheckout(
  codigos: CodigoDescuento[],
  texto: string,
  opts: OpcionesResolverDescuento,
): ResultadoCanje {
  const codigo = buscarCodigo(codigos, texto);
  if (!codigo) return { ok: false, motivo: 'Ese código no existe' };
  if (codigo.soloNuevas && !opts.esNueva) {
    return { ok: false, motivo: 'Ese código es solo para clientas nuevas' };
  }
  return validarCodigoCanjeable(codigo, { hoyISO: opts.hoyISO, subtotal: opts.subtotal });
}
