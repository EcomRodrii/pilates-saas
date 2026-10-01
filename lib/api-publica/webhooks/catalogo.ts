// Catálogo de eventos de la API pública (F2).
//
// Lo escribe el trigger `api_registrar_evento` (migr 20261001162731): un evento
// por fila creada, eliminada o actualizada EN ALGO QUE LA API ENSEÑA. El mismo
// catálogo sirve a los webhooks y a `GET /api/v1/eventos`.
//
// ⚠️ Tres sitios tienen que decir lo mismo y un test lo comprueba
// (`catalogo.test.ts`): esta lista, el CHECK de `api_eventos.tipo` y
// `api_webhooks.tipos`, y las columnas que vigila el trigger, que son las de
// `COLUMNAS` en serializar.ts.

import type { ScopeOAuth } from '../catalogo-scopes.ts';

export const RECURSOS_EVENTO = ['recibo', 'factura', 'devolucion', 'venta', 'clienta', 'reserva', 'suscripcion'] as const;
export type RecursoEvento = (typeof RECURSOS_EVENTO)[number];

export const TIPOS_EVENTO = [
  'recibo.creado', 'recibo.actualizado', 'recibo.eliminado',
  'factura.creada', 'factura.actualizada', 'factura.eliminada',
  'devolucion.creada', 'devolucion.actualizada', 'devolucion.eliminada',
  'venta.creada', 'venta.actualizada', 'venta.eliminada',
  'clienta.creada', 'clienta.actualizada', 'clienta.eliminada',
  // Para automatizaciones (Zapier) y BI, no para la contabilidad.
  'reserva.creada', 'reserva.actualizada', 'reserva.eliminada',
  'suscripcion.creada', 'suscripcion.actualizada', 'suscripcion.eliminada',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export function esTipoEvento(x: unknown): x is TipoEvento {
  return typeof x === 'string' && (TIPOS_EVENTO as readonly string[]).includes(x);
}

export function recursoDeTipo(tipo: TipoEvento): RecursoEvento {
  return tipo.split('.')[0] as RecursoEvento;
}

/** Tabla de la que sale cada recurso (la que lleva el trigger). */
export const TABLA_DE_RECURSO: Record<RecursoEvento, string> = {
  recibo: 'recibos',
  factura: 'facturas',
  devolucion: 'devoluciones',
  venta: 'ventas_pos',
  clienta: 'socios',
  reserva: 'reservas',
  suscripcion: 'suscripciones',
};

/**
 * El permiso que hace falta para recibir un evento: el MISMO que para leer el
 * recurso por la API. Un evento de recibo es un dato de dinero.
 */
export const SCOPE_DE_RECURSO: Record<RecursoEvento, ScopeOAuth> = {
  recibo: 'pagos:leer',
  devolucion: 'pagos:leer',
  venta: 'pagos:leer',
  factura: 'facturas:leer',
  clienta: 'clientas:leer',
  reserva: 'reservas:leer',
  suscripcion: 'planes:leer',
};

export function scopeDeTipo(tipo: TipoEvento): ScopeOAuth {
  return SCOPE_DE_RECURSO[recursoDeTipo(tipo)];
}

/** Los tipos que una credencial con estos scopes puede ver. */
export function tiposPermitidos(scopes: readonly string[]): TipoEvento[] {
  return TIPOS_EVENTO.filter(t => scopes.includes(scopeDeTipo(t)));
}

export const NOMBRE_RECURSO: Record<RecursoEvento, string> = {
  recibo: 'Recibos (cobros)',
  factura: 'Facturas',
  devolucion: 'Devoluciones',
  venta: 'Ventas de la caja',
  clienta: 'Alumnas',
  reserva: 'Reservas',
  suscripcion: 'Cuotas y bonos',
};

/** Los recursos de dinero: lo que necesita un programa de contabilidad. */
export const RECURSOS_CONTABILIDAD: readonly RecursoEvento[] = ['recibo', 'factura', 'devolucion', 'venta'];

/** Lo que propone el panel al crear un webhook «para la contabilidad»: todo lo de dinero. */
export const TIPOS_CONTABILIDAD: readonly TipoEvento[] = TIPOS_EVENTO.filter(t => RECURSOS_CONTABILIDAD.includes(recursoDeTipo(t)));
