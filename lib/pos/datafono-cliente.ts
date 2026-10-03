'use client';

import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, mensajeHttp } from '@/lib/errores';
import type { DireccionLector, EstadoLector, LectorDatafono } from './datafono.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente de /api/terminal/lector: el datáfono de Stripe del estudio.
// Como el resto del TPV, devuelve `{ error }` en vez de lanzar.
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoDatafonoServidor {
  stripeConectado: boolean;
  /** `undefined` = la respuesta no lo dice: manda lo que ya se sabía (el catálogo). */
  emparejado: boolean | undefined;
  /** `undefined` = Stripe no respondió: no se sabe si está encendido. */
  lector: LectorDatafono | null | undefined;
  direccion: DireccionLector | null;
  test: boolean;
}

export type ErrorDatafono = { error: string; falta?: 'codigo' | 'direccion' | 'stripe' };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function aLector(v: unknown): LectorDatafono | null | undefined {
  if (v === null) return null;
  if (!esObjeto(v) || typeof v.etiqueta !== 'string') return undefined;
  const estado = v.estado === 'online' || v.estado === 'offline' ? (v.estado as EstadoLector) : null;
  return { etiqueta: v.etiqueta, modelo: typeof v.modelo === 'string' ? v.modelo : null, estado };
}

function aDireccion(v: unknown): DireccionLector | null {
  if (!esObjeto(v)) return null;
  const { linea, codigoPostal, ciudad } = v;
  return typeof linea === 'string' && typeof codigoPostal === 'string' && typeof ciudad === 'string'
    ? { linea, codigoPostal, ciudad } : null;
}

async function pedir(metodo: string, cuerpo?: unknown): Promise<Record<string, unknown> | ErrorDatafono> {
  try {
    const res = await fetch('/api/terminal/lector', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    const d = esObjeto(data) ? data : {};
    if (!res.ok) {
      const falta = d.falta === 'codigo' || d.falta === 'direccion' || d.falta === 'stripe' ? d.falta : undefined;
      return { error: mensajeSeguro(d.error, mensajeHttp(res.status)), ...(falta ? { falta } : {}) };
    }
    return d;
  } catch {
    return { error: 'No hemos podido conectar. Comprueba la conexión.' };
  }
}

export const esErrorDatafono = (r: unknown): r is ErrorDatafono => esObjeto(r) && typeof r.error === 'string';

/**
 * Lo que dice el servidor del datáfono. Una respuesta sin la forma esperada no
 * se da por «desconectado»: se devuelve tal cual lo que se sepa y `lector`
 * queda `undefined` (comprobando).
 */
export async function leerDatafono(): Promise<EstadoDatafonoServidor | ErrorDatafono> {
  const r = await pedir('GET');
  if (esErrorDatafono(r)) return r;
  return {
    stripeConectado: r.stripeConectado !== false,
    emparejado: typeof r.emparejado === 'boolean' ? r.emparejado : undefined,
    lector: 'lector' in r ? aLector(r.lector) : undefined,
    direccion: aDireccion(r.direccion),
    test: r.test === true,
  };
}

export async function conectarDatafono(p: {
  codigo: string; nombre: string; direccion: DireccionLector | null;
}): Promise<{ lector: LectorDatafono } | ErrorDatafono> {
  const r = await pedir('POST', p);
  if (esErrorDatafono(r)) return r;
  const lector = aLector(r.lector);
  return lector ? { lector } : { error: 'El datáfono se ha conectado, pero no hemos podido leerlo. Recarga la pantalla.' };
}

export async function renombrarDatafono(nombre: string): Promise<{ lector: LectorDatafono } | ErrorDatafono> {
  const r = await pedir('PATCH', { nombre });
  if (esErrorDatafono(r)) return r;
  const lector = aLector(r.lector);
  return lector ? { lector } : { error: 'No hemos podido leer el datáfono. Recarga la pantalla.' };
}

export async function desconectarDatafono(): Promise<{ ok: true } | ErrorDatafono> {
  const r = await pedir('DELETE');
  return esErrorDatafono(r) ? r : { ok: true };
}
