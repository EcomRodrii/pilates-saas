'use client';

import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, mensajeHttp } from '@/lib/errores';
import type { DireccionLector, EstadoLector, LectorDatafono } from './datafono.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente de /api/terminal/lector: el datáfono del estudio (el de Stripe o el
// SumUp Solo), y de la cuenta de SumUp de la que cuelga el Solo.
// Como el resto del TPV, devuelve `{ error }` en vez de lanzar.
// ─────────────────────────────────────────────────────────────────────────────

export type ProveedorDatafono = 'stripe' | 'sumup';

/** Lo que hay de SumUp para este estudio. */
export interface EstadoSumup {
  /** ¿Se le ofrece SumUp? (Tentare lo tiene dado de alta y el estudio está en la lista.) */
  disponible: boolean;
  /** La cuenta de SumUp conectada, o `null`. */
  cuenta: { comercio: string | null } | null;
  /** ¿Puede quien mira conectar o desconectar la cuenta? Solo la dueña. */
  puedeConectarCuenta: boolean;
}

export const SIN_SUMUP: EstadoSumup = { disponible: false, cuenta: null, puedeConectarCuenta: false };

export interface EstadoDatafonoServidor {
  stripeConectado: boolean;
  /** De quién es el datáfono emparejado. `null` = ninguno (o no se sabe). */
  proveedor: ProveedorDatafono | null;
  sumup: EstadoSumup;
  /** `undefined` = la respuesta no lo dice: manda lo que ya se sabía (el catálogo). */
  emparejado: boolean | undefined;
  /** `undefined` = Stripe no respondió: no se sabe si está encendido. */
  lector: LectorDatafono | null | undefined;
  direccion: DireccionLector | null;
  test: boolean;
}

export type ErrorDatafono = { error: string; falta?: 'codigo' | 'direccion' | 'stripe' | 'cuenta' };

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

function aSumup(v: unknown): EstadoSumup {
  if (!esObjeto(v)) return SIN_SUMUP;
  const c = v.cuenta;
  return {
    disponible: v.disponible === true,
    cuenta: esObjeto(c) ? { comercio: typeof c.comercio === 'string' ? c.comercio : null } : null,
    puedeConectarCuenta: v.puedeConectarCuenta === true,
  };
}

async function pedir(metodo: string, cuerpo?: unknown, ruta = '/api/terminal/lector'): Promise<Record<string, unknown> | ErrorDatafono> {
  try {
    const res = await fetch(ruta, {
      method: metodo,
      // same-origin explícito: oauth-state fija con esta respuesta la cookie HttpOnly del flujo.
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    const d = esObjeto(data) ? data : {};
    if (!res.ok) {
      const falta = d.falta === 'codigo' || d.falta === 'direccion' || d.falta === 'stripe' || d.falta === 'cuenta' ? d.falta : undefined;
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
    proveedor: r.proveedor === 'stripe' || r.proveedor === 'sumup' ? r.proveedor : null,
    sumup: aSumup(r.sumup),
    emparejado: typeof r.emparejado === 'boolean' ? r.emparejado : undefined,
    lector: 'lector' in r ? aLector(r.lector) : undefined,
    direccion: aDireccion(r.direccion),
    test: r.test === true,
  };
}

export async function conectarDatafono(p:
  | { proveedor?: 'stripe'; codigo: string; nombre: string; direccion: DireccionLector | null }
  | { proveedor: 'sumup'; codigo: string; nombre: string },
): Promise<{ lector: LectorDatafono } | ErrorDatafono> {
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

/**
 * Empieza a conectar la cuenta de SumUp: el servidor firma el `state` del OAuth y
 * monta la URL de SumUp (su client_id no viaja al navegador). Quien llama navega.
 */
export async function urlConectarCuentaSumup(): Promise<{ url: string } | ErrorDatafono> {
  const r = await pedir('POST', { provider: 'sumup' }, '/api/integrations/oauth-state');
  if (esErrorDatafono(r)) return r;
  return typeof r.url === 'string' && r.url.startsWith('https://')
    ? { url: r.url }
    : { error: 'No se ha podido abrir SumUp. Inténtalo otra vez.' };
}

/** Desconecta la cuenta de SumUp (y su Solo). Solo la dueña: lo comprueba el servidor. */
export async function desconectarCuentaSumup(): Promise<{ ok: true } | ErrorDatafono> {
  const r = await pedir('DELETE', undefined, '/api/integrations/sumup');
  return esErrorDatafono(r) ? r : { ok: true };
}
