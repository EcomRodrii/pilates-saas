// ─────────────────────────────────────────────────────────────────────────────
// Qué columnas de `recibos` puede escribir el NAVEGADOR.
//
// El panel escribe con la sesión de quien lo usa (rol `authenticated`), y un recibo
// es dinero: su estado cobrado, su método, su fecha de cobro, el id del cargo de
// Stripe, lo devuelto, la disputa, la entrega del plan… lo deja el servidor
// (`confirmarCobro`, el webhook, el dunning). La migración
// `20261001210000_recibos_columnas_escribibles` quita a `authenticated` el
// INSERT/UPDATE de tabla y le da solo estas columnas.
//
// ⚠️ Esta lista y esa migración dicen LO MISMO, y la que manda es la migración (la
// base de datos es la cerradura; esto es lo que el navegador declara que necesita).
// `recibo-escritura-navegador.test.ts` las cruza: una columna nueva en el mapeador
// sin su GRANT sale como un 42501 en producción, y una columna que se queda en el
// GRANT sin que nadie la escriba es una puerta abierta sin motivo.
//
// Una columna NUEVA de `recibos` nace NO escribible desde el navegador (no hay
// GRANT de tabla que la cubra): añadirla aquí es una decisión, no un descuido.
// ─────────────────────────────────────────────────────────────────────────────

import type { Recibo } from '../types.ts';

/** Lo que el navegador fija al CREAR un recibo (el resto lo decide la base de datos). */
export const COLUMNAS_RECIBO_INSERTABLES = [
  'id',
  'studio_id',
  'socio_id',
  'suscripcion_id',
  'concepto',
  'importe',
  'estado',
  'fecha_vencimiento',
  // Una venta o la renovación de un ciclo: decide si cobrarlo entrega el plan.
  'es_renovacion',
] as const;

/**
 * Lo que el navegador cambia en un recibo YA creado. Solo el estado entre los que no son
 * dinero (la remesa SEPA y «Reintentar») y el contador de reintentos que lo acompaña.
 * COBRADO y DEVUELTO no se escriben desde aquí aunque la columna sea escribible: lo
 * veda el trigger `trg_recibos_cobrado_solo_servidor`.
 */
export const COLUMNAS_RECIBO_ACTUALIZABLES = ['estado', 'intentos_reintento'] as const;

export type ColumnaReciboInsertable = (typeof COLUMNAS_RECIBO_INSERTABLES)[number];
export type ColumnaReciboActualizable = (typeof COLUMNAS_RECIBO_ACTUALIZABLES)[number];

/**
 * Lo que una pantalla pasa para crear un recibo pendiente (`addRecibo`): el resto lo fija el
 * contexto (id, estudio, estado) o la base de datos. Estrecho a propósito: un campo que no se
 * escribe (método, fechas de cobro…) no debe poder pasarse «y que parezca que se guarda».
 */
export type DatosReciboNuevo = Pick<Recibo, 'socioId' | 'suscripcionId' | 'concepto' | 'importe' | 'fechaVencimiento' | 'esRenovacion'>;
