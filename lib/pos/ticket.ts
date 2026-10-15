// ─────────────────────────────────────────────────────────────────────────────
// El ticket del TPV: totales, IVA, descuento y cambio.
//
// PURO (sin red, sin React, sin Supabase). Existe para que el mostrador vea el
// total ANTES de pulsar «Cobrar», sin pedírselo al servidor en cada toque.
//
// ⚠️ Esto NO es la fuente de verdad. Lo es `registrar_venta_pos`
// (migr 20260907150310), que vuelve a calcularlo todo leyendo el catálogo. Lo
// que se escribe en la base de datos sale SIEMPRE de allí; esto solo pinta.
//
// Por eso las reglas de redondeo de este fichero son las MISMAS que las de la
// RPC, línea por línea, y hay tests que lo fijan (`ticket.test.ts`). Si
// divergieran, el mostrador enseñaría un total y se cobraría otro — que es
// justo la clase de detalle que hace que nadie vuelva a fiarse de la pantalla.
//
// Reglas, en el orden en que se aplican:
//   1. bruto de línea      = redondear(precio × cantidad)
//   2. subtotal            = Σ brutos
//   3. descuento           = min(descontable, manual + código)   ← nunca negativo
//      · «descontable» = Σ brutos menos la matrícula, que no se descuenta
//   4. descuento de línea  = redondear(descuento × bruto / descontable)
//      · la ÚLTIMA línea descontable se lleva el céntimo suelto del redondeo,
//        para que Σ descuentos de línea == descuento total EXACTAMENTE
//   5. total de línea      = bruto − descuento de línea
//   6. base de línea       = redondear(total / (1 + iva/100))   ← IVA INCLUIDO
//   7. IVA de línea        = total − base
//
// El precio es CON IVA INCLUIDO en todo Tentare (`buildFactura` y
// `sellar-factura-server.ts` reparten total → base + cuota, nunca al revés).
// El porcentaje solo dice cómo se reparte; no encarece nada.
// ─────────────────────────────────────────────────────────────────────────────

import { redondearCentimos } from '../utils.ts';

export type TipoLineaPOS = 'PRODUCTO' | 'PLAN' | 'LIBRE';
export type TipoDescuento = 'EUROS' | 'PORCENTAJE';

/** Lo que el TPV sabe de una línea antes de mandarla. */
export interface LineaTicket {
  /** Identidad en el carrito. Para PRODUCTO/PLAN coincide con el id de catálogo. */
  clave: string;
  tipo: TipoLineaPOS;
  /** id en `productos_pos` o en `planes_tarifa`. null para conceptos libres. */
  referenciaId: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
  /** Porcentaje ya resuelto (el del artículo, o el del estudio si no tiene). */
  ivaPct: number;
  /**
   * `false` = el descuento no la toca. Solo la matrícula, que la RPC añade por su
   * cuenta con `'descontable', false`: un código o un descuento a mano rebajan lo
   * que se compra, no la matrícula. Sin el campo, se descuenta (todo lo demás).
   */
  descontable?: boolean;
}

export interface LineaCalculada extends LineaTicket {
  bruto: number;
  descuento: number;
  baseImponible: number;
  ivaImporte: number;
  total: number;
}

export interface Ticket {
  lineas: LineaCalculada[];
  subtotal: number;
  descuento: number;
  baseImponible: number;
  ivaTotal: number;
  total: number;
  /** Desglose por tipo de IVA, para el ticket impreso y la factura. */
  porTipoIva: { ivaPct: number; base: number; cuota: number }[];
}

/**
 * Redondeo a céntimos, el mismo que hace `ROUND(x, 2)` en Postgres. La regla vive
 * una vez, en `redondearCentimos` (lib/utils.ts): la comparten este ticket y los
 * códigos de descuento.
 */
export const céntimos = redondearCentimos;

/**
 * Descuento en euros que aplica un valor manual sobre un subtotal.
 * Nunca negativo y nunca mayor que el subtotal: un "descuento" que supera el
 * importe no es un descuento, y con el signo cambiado sería un recargo.
 */
export function descuentoManual(
  subtotal: number,
  tipo: TipoDescuento | null,
  valor: number,
): number {
  if (!tipo || !Number.isFinite(valor) || valor <= 0) return 0;
  const bruto = tipo === 'PORCENTAJE'
    ? (subtotal * Math.min(100, valor)) / 100
    : valor;
  return Math.max(0, Math.min(subtotal, céntimos(bruto)));
}

/**
 * Calcula el ticket completo. `descuentoCodigo` llega ya resuelto en euros
 * (`calcularDescuento` de lib/codigos-descuento.ts, la misma que usan los cobros
 * online), redondeado con la misma regla que aquí: no se reimplementa.
 */
export function calcularTicket(
  lineas: LineaTicket[],
  opts: {
    descuentoTipo?: TipoDescuento | null;
    descuentoValor?: number;
    descuentoCodigo?: number;
  } = {},
): Ticket {
  const conBruto = lineas.map((l) => ({ ...l, bruto: céntimos(l.precio * l.cantidad) }));
  const subtotal = céntimos(conBruto.reduce((s, l) => s + l.bruto, 0));
  // El descuento se calcula y se reparte solo sobre lo descontable, como
  // `v_subtotal_descontable` en la RPC.
  const descontable = (l: LineaTicket) => l.descontable !== false;
  const subtotalDescontable = céntimos(conBruto.filter(descontable).reduce((s, l) => s + l.bruto, 0));
  let ultimaDescontable = -1;
  conBruto.forEach((l, i) => { if (descontable(l)) ultimaDescontable = i; });

  const manual = descuentoManual(subtotalDescontable, opts.descuentoTipo ?? null, opts.descuentoValor ?? 0);
  const codigo = Math.max(0, céntimos(opts.descuentoCodigo ?? 0));
  const descuento = Math.min(subtotalDescontable, céntimos(manual + codigo));

  let repartido = 0;
  const calculadas: LineaCalculada[] = conBruto.map((l, i) => {
    // La última línea DESCONTABLE absorbe el céntimo que deja el redondeo del
    // prorrateo. Sin esto, Σ líneas puede quedar a un céntimo del total de
    // cabecera y el ticket no cuadraría consigo mismo.
    const descLinea = !descontable(l) ? 0
      : i === ultimaDescontable ? céntimos(descuento - repartido)
        : subtotalDescontable > 0 ? céntimos((descuento * l.bruto) / subtotalDescontable) : 0;
    repartido = céntimos(repartido + descLinea);

    const total = céntimos(l.bruto - descLinea);
    const baseImponible = céntimos(total / (1 + l.ivaPct / 100));
    return {
      ...l,
      descuento: descLinea,
      total,
      baseImponible,
      ivaImporte: céntimos(total - baseImponible),
    };
  });

  const total = céntimos(calculadas.reduce((s, l) => s + l.total, 0));
  const baseImponible = céntimos(calculadas.reduce((s, l) => s + l.baseImponible, 0));
  const ivaTotal = céntimos(calculadas.reduce((s, l) => s + l.ivaImporte, 0));

  // Agrupado por tipo, no una cifra única: un ticket con género al 21 % y una
  // clase al 10 % tiene que poder enseñar las dos bases por separado.
  const mapa = new Map<number, { ivaPct: number; base: number; cuota: number }>();
  for (const l of calculadas) {
    const previo = mapa.get(l.ivaPct) ?? { ivaPct: l.ivaPct, base: 0, cuota: 0 };
    previo.base = céntimos(previo.base + l.baseImponible);
    previo.cuota = céntimos(previo.cuota + l.ivaImporte);
    mapa.set(l.ivaPct, previo);
  }

  return {
    lineas: calculadas,
    subtotal,
    descuento,
    baseImponible,
    ivaTotal,
    total,
    porTipoIva: [...mapa.values()].sort((a, b) => b.ivaPct - a.ivaPct),
  };
}

// ─── Efectivo ────────────────────────────────────────────────────────────────

export type ResultadoCambio =
  | { ok: true; cambio: number }
  | { ok: false; falta: number };

/**
 * Vuelta a devolver. Si lo entregado no llega al total, dice CUÁNTO falta en
 * vez de un booleano: en el mostrador la pregunta siempre es "¿cuánto más?".
 */
export function calcularCambio(total: number, entregado: number): ResultadoCambio {
  if (!Number.isFinite(entregado) || entregado < total) {
    return { ok: false, falta: céntimos(Math.max(0, total - (Number.isFinite(entregado) ? entregado : 0))) };
  }
  return { ok: true, cambio: céntimos(entregado - total) };
}

/**
 * Importes sugeridos para cobrar en efectivo: el exacto, y los billetes
 * redondos por encima. Ahorra teclear en el 90 % de los cobros.
 */
export function sugerenciasEfectivo(total: number): number[] {
  if (total <= 0) return [];
  const exacto = céntimos(total);
  const candidatos = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
  ];
  const vistos = new Set<number>([exacto]);
  const out = [exacto];
  for (const c of candidatos) {
    const v = céntimos(c);
    if (v > exacto && !vistos.has(v)) { vistos.add(v); out.push(v); }
  }
  return out.slice(0, 4);
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export type EstadoStock = 'SIN_CONTROL' | 'AGOTADO' | 'BAJO' | 'OK';

/**
 * `stock` null significa que este artículo NO controla existencias (un
 * servicio, una clase). Es deliberadamente distinto de 0, que es AGOTADO:
 * confundirlos dejaría un servicio sin poder venderse nunca.
 */
export function estadoStock(stock: number | null | undefined, minimo: number = 0): EstadoStock {
  if (stock === null || stock === undefined) return 'SIN_CONTROL';
  if (stock <= 0) return 'AGOTADO';
  if (minimo > 0 && stock <= minimo) return 'BAJO';
  return 'OK';
}

/** ¿Puedo añadir una unidad más de esto al carrito? */
export function puedeAnadir(
  stock: number | null | undefined,
  yaEnCarrito: number,
): boolean {
  if (stock === null || stock === undefined) return true;
  return yaEnCarrito < stock;
}
