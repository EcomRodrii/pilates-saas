// ─────────────────────────────────────────────────────────────────────────────
// Lo que llega a las rutas de cobros externos, validado antes de tocar nada.
// Puro: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import type { ColumnasTabla } from './tabla.ts';
import { normalizar } from './texto.ts';
import { facturaIdExterno } from '../billing/cobro-confirmado-reglas.ts';
import { ACCIONES_BANDEJA, esMotivoDescarte, type AccionBandeja } from './reglas.ts';
import { ESTADOS_MOVIMIENTO, type EstadoMovimiento, type MotivoDescarte } from './tipos.ts';

/** Vercel admite 4,5 MB por petición; el fichero, 4. */
export const MAX_BYTES_FICHERO = 4 * 1024 * 1024;
/** Un extracto de un mes de un estudio son cientos de líneas, no miles. */
export const MAX_LINEAS = 5000;
export const MAX_COLUMNAS = 60;
export const MAX_CELDA = 500;

const ID = /^[A-Za-z0-9_-]{1,120}$/;
const esId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
// La factura de este canal es `fac-ext-<recibo>` y quien la sella acepta ids de
// hasta 64 caracteres (mismo tope que «Marcar cobrado», `LONGITUD_MAXIMA_ID_RECIBO`).
const ID_RECIBO = new RegExp(`^[A-Za-z0-9_-]{1,${64 - facturaIdExterno('').length}}$`);
const esIdRecibo = (x: unknown): x is string => typeof x === 'string' && ID_RECIBO.test(x);

/**
 * La plantilla de un CSV o Excel: sale de sus cabeceras, así que el mismo banco
 * exportando el mismo informe da la misma (y las mismas claves de idempotencia)
 * aunque el fichero se llame distinto.
 */
export function plantillaDeCabeceras(cabeceras: readonly string[]): string {
  return `h:${createHash('sha256').update(cabeceras.map(c => normalizar(c ?? '')).join('\u0000'), 'utf8').digest('hex').slice(0, 16)}`;
}

/** Las columnas elegidas, o `null` si no tienen forma (la validación fina es `validarColumnas`). */
export function parsearColumnas(x: unknown): ColumnasTabla | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const indice = (v: unknown) => (v === undefined || v === null ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined);
  const fecha = indice(o.fecha);
  if (fecha === undefined || fecha === null) return null;
  const r: ColumnasTabla = { fecha };
  for (const k of ['importe', 'abono', 'hora', 'pagador', 'tarjeta', 'referencia', 'idOperacion'] as const) {
    const v = indice(o[k]);
    if (v === undefined) return null;
    r[k] = v;
  }
  if (o.concepto !== undefined && o.concepto !== null) {
    if (!Array.isArray(o.concepto) || o.concepto.length > 5) return null;
    const cs = o.concepto.map(indice);
    if (cs.some(c => c === undefined || c === null)) return null;
    r.concepto = cs as number[];
  }
  return r;
}

export interface PeticionTabla {
  formato: 'csv' | 'excel';
  nombre: string | null;
  cabeceras: string[];
  filas: string[][];
  /** Sin columnas, la ruta devuelve las cabeceras y una propuesta para que el estudio elija. */
  columnas: ColumnasTabla | null;
}

/** Excel (convertido a filas en el navegador) o CSV ya troceado. */
export function parsearPeticionTabla(x: unknown): { ok: true; peticion: PeticionTabla } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'Petición vacía.' };
  const o = x as Record<string, unknown>;
  if (o.formato !== 'excel' && o.formato !== 'csv') return { ok: false, error: 'Formato no admitido.' };
  const celdas = (f: unknown): f is string[] => Array.isArray(f) && f.length <= MAX_COLUMNAS && f.every(c => typeof c === 'string' && c.length <= MAX_CELDA);
  if (!celdas(o.cabeceras) || o.cabeceras.length === 0) return { ok: false, error: 'Faltan las cabeceras de las columnas.' };
  if (!Array.isArray(o.filas) || o.filas.length === 0) return { ok: false, error: 'El fichero no tiene filas.' };
  if (o.filas.length > MAX_LINEAS) return { ok: false, error: `El fichero tiene más de ${MAX_LINEAS} filas: súbelo por meses.` };
  if (!o.filas.every(celdas)) return { ok: false, error: 'Hay filas con un formato que no se puede leer.' };
  const columnas = o.columnas === undefined || o.columnas === null ? null : parsearColumnas(o.columnas);
  if (o.columnas !== undefined && o.columnas !== null && !columnas) return { ok: false, error: 'Las columnas elegidas no son válidas.' };
  const nombre = typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre.trim().slice(0, 200) : null;
  return { ok: true, peticion: { formato: o.formato, nombre, cabeceras: o.cabeceras, filas: o.filas as string[][], columnas } };
}

export type PeticionResolver =
  | { accion: 'confirmar'; movimientoId: string; reciboId: string; avisarSocia: boolean; aunqueDuplicado: boolean }
  | { accion: 'enlazar' | 'doble_cobro'; movimientoId: string; reciboId: string }
  | { accion: 'descartar'; movimientoId: string; motivo: MotivoDescarte }
  | { accion: 'reabrir'; movimientoId: string };

export function parsearPeticionResolver(x: unknown): { ok: true; peticion: PeticionResolver } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'Petición vacía.' };
  const o = x as Record<string, unknown>;
  if (typeof o.accion !== 'string' || !(ACCIONES_BANDEJA as readonly string[]).includes(o.accion)) return { ok: false, error: 'Acción no válida.' };
  const accion = o.accion as AccionBandeja;
  if (!esId(o.movimientoId)) return { ok: false, error: 'Falta el movimiento.' };
  const movimientoId = o.movimientoId;
  switch (accion) {
    case 'confirmar':
      if (!esIdRecibo(o.reciboId)) return { ok: false, error: 'Falta el recibo.' };
      if (o.avisarSocia !== undefined && typeof o.avisarSocia !== 'boolean') return { ok: false, error: 'avisarSocia tiene que ser sí o no.' };
      if (o.aunqueDuplicado !== undefined && typeof o.aunqueDuplicado !== 'boolean') return { ok: false, error: 'aunqueDuplicado tiene que ser sí o no.' };
      return { ok: true, peticion: { accion, movimientoId, reciboId: o.reciboId, avisarSocia: o.avisarSocia === true, aunqueDuplicado: o.aunqueDuplicado === true } };
    case 'enlazar':
    case 'doble_cobro':
      if (!esIdRecibo(o.reciboId)) return { ok: false, error: 'Falta el recibo.' };
      return { ok: true, peticion: { accion, movimientoId, reciboId: o.reciboId } };
    case 'descartar':
      if (!esMotivoDescarte(o.motivo)) return { ok: false, error: 'Falta el motivo del descarte.' };
      return { ok: true, peticion: { accion, movimientoId, motivo: o.motivo } };
    case 'reabrir':
      return { ok: true, peticion: { accion, movimientoId } };
  }
}

/** Lo que enseña la bandeja por defecto: lo que espera a una persona. */
export const ESTADOS_BANDEJA: readonly EstadoMovimiento[] = ['POR_REVISAR', 'DOBLE_COBRO', 'CONFIRMANDO'];

/** `?estado=POR_REVISAR,DOBLE_COBRO`; sin él, la bandeja. Un estado desconocido es un error, no se ignora. */
export function parsearEstados(param: string | null): EstadoMovimiento[] | null {
  if (!param) return [...ESTADOS_BANDEJA];
  const lista = param.split(',').map(s => s.trim()).filter(Boolean);
  if (lista.length === 0 || lista.length > ESTADOS_MOVIMIENTO.length) return null;
  if (!lista.every(e => (ESTADOS_MOVIMIENTO as readonly string[]).includes(e))) return null;
  return [...new Set(lista)] as EstadoMovimiento[];
}

/** Respuesta HTTP de cada desenlace de una acción. */
export function estadoHttpDeResultado(codigo: 'NO_ENCONTRADO' | 'ESTADO' | 'OCUPADO' | 'NO_COBRABLE' | 'POSIBLE_DUPLICADO' | 'DATOS' | 'PERSISTENCIA'): number {
  switch (codigo) {
    case 'NO_ENCONTRADO': return 404;
    case 'ESTADO':
    case 'OCUPADO':
    case 'NO_COBRABLE':
    case 'POSIBLE_DUPLICADO': return 409;
    case 'DATOS': return 422;
    case 'PERSISTENCIA': return 500;
  }
}
