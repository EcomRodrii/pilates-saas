import 'server-only';
import { NextResponse } from 'next/server';
import { verificarSesionDemo, type DatosSesionDemo } from './sesion.ts';
import { estadoDemo } from './interruptor.ts';

// Lo que comparten las rutas de la demo.

export const SIN_SERVICIO = 'No hemos podido continuar ahora mismo. Vuelve a intentarlo en un momento.';

/** Nunca el objeto de error entero: el `details` de PostgREST puede llevar la fila. */
export const resumenError = (e: unknown) =>
  e && typeof e === 'object'
    ? { code: (e as { code?: unknown }).code, name: (e as { name?: unknown }).name, message: (e as { message?: unknown }).message }
    : { message: String(e) };

export function json(cuerpo: unknown, status = 200): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * La sesión del cuerpo, o la respuesta de error. Un token que no es nuestro, que
 * caducó o que está manipulado recibe siempre la MISMA respuesta (401), sin
 * decir cuál de las tres: no se le enseña a nadie qué probar.
 */
export function exigirSesion(body: Record<string, unknown>): { sesion: DatosSesionDemo } | { respuesta: NextResponse } {
  const sesion = verificarSesionDemo(body.sesion);
  if (!sesion) return { respuesta: json({ error: 'Tu sesión de demo ha caducado. Empieza de nuevo.', codigo: 'sesion' }, 401) };
  return { sesion };
}

export async function leerCuerpo(req: Request): Promise<Record<string, unknown> | null> {
  const largo = Number(req.headers.get('content-length') ?? '0');
  if (largo > 20_000) return null;
  const b = (await req.json().catch(() => null)) as unknown;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

/** Con el interruptor apagado, la API no existe: 404 como cualquier ruta que no está. */
export function demoApagada(): NextResponse | null {
  return estadoDemo(process.env.DEMO_PERSONALIZADA).api ? null : json({ error: 'No encontrado' }, 404);
}
