// Eliminar un recibo: qué se puede eliminar, por qué motivos, y qué dice el panel
// cuando el servidor lo rechaza.
//
// Puro, sin I/O. Espejo de la RPC `eliminar_recibo` (migración 20260925175253):
// la cerradura es la RPC, esto solo evita enseñar un botón que va a fallar y
// traduce sus rechazos. Un test ata las listas de aquí a las de la migración.
//
// ⚠️ El dinero cobrado no se borra: se devuelve. Un recibo COBRADO, DEVUELTO o
// EN_CURSO no se elimina, y tampoco uno con una factura, una penalización o un
// pago abierto (un enlace de pago que aún puede completarse).

import { capitalizarPrimera } from './utils.ts';
import { ERROR_GENERICO } from './errores.ts';

export interface MotivoEliminar {
  codigo: string;
  etiqueta: string;
}

/**
 * Lista CERRADA, sin texto libre: el libro de auditoría no se puede rectificar ni
 * suprimir, y un texto libre acabaría llevando el nombre de una clienta.
 */
export const MOTIVOS_ELIMINAR_RECIBO: readonly MotivoEliminar[] = [
  { codigo: 'DUPLICADO', etiqueta: 'Está duplicado' },
  { codigo: 'IMPORTE_ERRONEO', etiqueta: 'El importe estaba mal' },
  { codigo: 'CREADO_POR_ERROR', etiqueta: 'Se creó por error' },
  { codigo: 'CLIENTA_DE_BAJA', etiqueta: 'La clienta se da de baja' },
  { codigo: 'OTRO_MOTIVO', etiqueta: 'Otro motivo' },
];

/** «Está duplicado»; un código que no conoce se lee igualmente, no se esconde. */
export function etiquetaMotivo(codigo: string): string {
  return MOTIVOS_ELIMINAR_RECIBO.find(m => m.codigo === codigo)?.etiqueta
    ?? capitalizarPrimera(codigo.toLowerCase().replace(/_/g, ' '));
}

/** Estados en los que un recibo aún no es dinero cobrado ni en camino. */
export const ESTADOS_ELIMINABLES: readonly string[] = ['PENDIENTE', 'FALLIDO', 'ANULADO'];

export type PuedeEliminar = { ok: true } | { ok: false; razon: string };

/**
 * ¿Se ofrece «Eliminar» en este recibo? Solo lo que la pantalla puede saber (el
 * estado y la factura); un pago abierto lo dice el servidor al intentarlo.
 */
export function puedeEliminarRecibo(
  r: { estado: string; fechaCobro?: string | null; fechaDevolucion?: string | null },
  o: { tieneFactura?: boolean } = {},
): PuedeEliminar {
  if (o.tieneFactura) return { ok: false, razon: 'Ya tiene factura.' };
  // Un recibo que vuelve a «sin cobrar» tras una devolución del banco conserva su fecha de cobro.
  if (r.fechaCobro || r.fechaDevolucion) return { ok: false, razon: 'Ya tuvo un cobro o una devolución.' };
  if (!ESTADOS_ELIMINABLES.includes(r.estado)) {
    return { ok: false, razon: 'Un recibo cobrado, devuelto o en curso no se elimina: se devuelve.' };
  }
  return { ok: true };
}

// ── Lo que dice el servidor ──────────────────────────────────────────────────

const RECHAZOS: Readonly<Record<string, string>> = {
  ESTADO_NO_ELIMINABLE:
    'Un recibo cobrado, devuelto o en curso no se elimina. Si el dinero no debía estar ahí, regístralo como devuelto.',
  PAGO_ASOCIADO:
    'Este recibo tiene un pago abierto (un enlace de pago o un cobro en curso). Espera a que termine o se cancele antes de eliminarlo.',
  TIENE_COBRO_PREVIO:
    'Este recibo ya tuvo un cobro o una devolución, aunque ahora figure sin cobrar, y no se puede eliminar.',
  TIENE_FACTURA: 'Este recibo ya tiene factura y no se puede eliminar.',
  ES_PENALIZACION: 'Este recibo es una penalización: se gestiona desde su aviso, no se elimina aquí.',
  MOTIVO_INVALIDO: 'Elige un motivo para eliminarlo.',
  NO_AUTORIZADO: 'No tienes permiso para eliminar recibos.',
  STUDIO_MISMATCH: 'Este recibo es de otra sede. Cambia de sede y vuelve a intentarlo.',
};

/** El recibo ya no está: lo que se pedía (que no esté) ya se cumple. */
const YA_NO_EXISTE = 'RECIBO_NO_ENCONTRADO';

export type ErrorEliminar =
  | { tipo: 'YA_NO_EXISTE' }
  | { tipo: 'RECHAZADO'; mensaje: string };

/**
 * Interpreta el mensaje de una excepción de la RPC (PostgREST lo devuelve tal
 * cual: `ESTADO_NO_ELIMINABLE`). null si no es uno de los conocidos: quien llama
 * usa entonces el mensaje genérico, nunca el texto crudo.
 */
export function interpretarErrorEliminar(mensaje: unknown, codigoPostgres?: unknown): ErrorEliminar | null {
  if (typeof mensaje === 'string') {
    if (new RegExp(`\\b${YA_NO_EXISTE}\\b`).test(mensaje)) return { tipo: 'YA_NO_EXISTE' };
    for (const [codigo, texto] of Object.entries(RECHAZOS)) {
      if (new RegExp(`\\b${codigo}\\b`).test(mensaje)) return { tipo: 'RECHAZADO', mensaje: texto };
    }
  }
  // Una excepción de la propia RPC (P0001) con un código que esta pantalla no
  // conoce, o un fallo de PostgREST (PGRST…: p. ej. la función aún no está
  // desplegada, «Could not find the function… in the schema cache»): su texto es
  // de máquina, nunca se enseña crudo.
  if (typeof codigoPostgres === 'string' && /^(P0001|PGRST\d+)$/.test(codigoPostgres)) {
    return { tipo: 'RECHAZADO', mensaje: ERROR_GENERICO };
  }
  return null;
}

/** Códigos que la RPC puede lanzar y esta pantalla sabe explicar (lo usa el test guardia). */
export const CODIGOS_CONOCIDOS: readonly string[] = [YA_NO_EXISTE, ...Object.keys(RECHAZOS)];
