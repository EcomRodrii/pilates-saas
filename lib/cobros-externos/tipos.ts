// ─────────────────────────────────────────────────────────────────────────────
// Cobros externos: la forma común de un movimiento que viene de fuera.
//
// Un movimiento NO es un cobro. Es lo que dice el banco (o, más adelante, un
// datáfono en la nube) que ha entrado. El cobro, si se confirma, vive en
// `recibos` y lo escribe `confirmarCobro()`, como cualquier otro. Diseño:
// docs/cobros-externos-diseno.md.
//
// Todas las fuentes (Norma 43, CSV, Excel…) acaban en `MovimientoNormalizado`,
// y a partir de ahí nada distingue de dónde vino: un solo motor, una sola
// confirmación.
//
// Puro y sin dependencias de servidor: lo leen los tests con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export const FUENTES = ['norma43', 'fb500', 'csv', 'excel', 'viva', 'sumup'] as const;
export type Fuente = (typeof FUENTES)[number];

/**
 * Qué es el movimiento, antes de buscar a quién corresponde.
 *  · `COBRO`: un pago que puede ser de una alumna (transferencia, Bizum, un
 *    cobro del datáfono cuando el fichero los trae de uno en uno).
 *  · `LIQUIDACION`: el abono agregado del datáfono (todo el día, neto de
 *    comisiones). Sirve para cuadrar el día, nunca para emparejar.
 *  · `NO_ALUMNA`: entra dinero que no es de una alumna (el pago de Stripe al
 *    estudio, un ingreso de efectivo del propio estudio, intereses, traspasos).
 */
export type TipoMovimiento = 'COBRO' | 'LIQUIDACION' | 'NO_ALUMNA';

/** Con qué se pagó, en los valores que admite `recibos.metodo_cobro`, más `OTRO`. */
export type MetodoMovimiento = 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO';

export const ESTADOS_MOVIMIENTO = [
  'IMPORTADO', 'POR_REVISAR', 'CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO', 'DOBLE_COBRO', 'DESCARTADO',
] as const;
export type EstadoMovimiento = (typeof ESTADOS_MOVIMIENTO)[number];

export const MOTIVOS_DESCARTE = ['DUPLICADO', 'NO_ES_DE_UNA_ALUMNA', 'DEVUELTO_A_LA_ALUMNA', 'OTRO'] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

export interface MovimientoNormalizado {
  fuente: Fuente;
  /** Ver idempotencia.ts. Única por estudio. */
  claveIdempotencia: string;
  idExterno: string | null;
  tipo: TipoMovimiento;
  metodo: MetodoMovimiento;
  /** Siempre positivo: solo se guardan abonos. */
  importeCentimos: number;
  /** Fecha REAL del cobro, día del estudio (`YYYY-MM-DD`). */
  fechaOperacion: string;
  /** `HH:MM`, si la fuente la da. Norma 43 no la da. */
  horaOperacion: string | null;
  fechaValor: string | null;
  referencia: string | null;
  tarjetaUltimos4: string | null;
  tarjetaMarca: string | null;
  terminalRef: string | null;
  /** Dato personal: se vacía con la retención. */
  pagadorNombre: string | null;
  /** Puede llevar datos personales: truncado y con la misma retención. */
  concepto: string | null;
}

/** Lo que devuelve cualquier lector: movimientos, más lo que no ha podido leer. */
export interface ResultadoLectura {
  movimientos: MovimientoNormalizado[];
  /** Cargos (dinero que sale): se cuentan y no se guardan. */
  cargos: number;
  /** Línea y código; NUNCA el contenido de la línea (puede llevar datos personales). */
  errores: { linea: number; codigo: string }[];
  /** Últimos 4 dígitos de la cuenta o del comercio, para enseñarlos. */
  cuentaFinal: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
}

/** Máximo de un concepto guardado. */
export const MAX_CONCEPTO = 140;
