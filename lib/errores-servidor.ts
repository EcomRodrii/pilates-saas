import { NextResponse } from 'next/server';

import { ERROR_GENERICO } from '@/lib/errores';

// Lado servidor de la política de errores (el porqué está en lib/errores.ts).
//
// La idea es que el detalle técnico SIEMPRE se conserva —en el log del
// servidor, donde sirve para depurar— y NUNCA viaja al navegador. Antes se
// hacía justo al revés: `{ error: error.message }` mandaba el texto de Postgres
// a la pantalla y no lo registraba en ningún sitio, así que el mensaje era
// inútil para la usuaria y encima se perdía para quien tenía que arreglarlo.

/** Texto legible de cualquier cosa que se pueda lanzar, para el log. */
function detalle(causa: unknown): string {
  if (!causa) return '(sin detalle)';
  if (causa instanceof Error) return causa.stack ?? causa.message;
  if (typeof causa === 'object' && 'message' in causa) {
    const c = causa as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    // Los errores de Supabase traen code/details/hint, que suelen decir más que
    // el propio message. Se registran todos.
    return [c.message, c.code && `code=${c.code}`, c.details && `details=${c.details}`, c.hint && `hint=${c.hint}`]
      .filter(Boolean)
      .join(' · ');
  }
  return String(causa);
}

/**
 * Fallo inesperado. Registra el detalle completo y responde con una frase en
 * español que la usuaria pueda entender.
 *
 * @param contexto  Etiqueta para encontrarlo en el log: 'equipo:POST'.
 * @param causa     El error tal cual (de Supabase, de un catch, lo que sea).
 * @param mensaje   Qué le decimos a la usuaria. Cuanto más concreto, mejor:
 *                  "No se ha podido guardar el miembro del equipo." gana a
 *                  cualquier genérico.
 */
export function errorInterno(
  contexto: string,
  causa: unknown,
  mensaje: string = ERROR_GENERICO,
  status = 500,
  extra?: Record<string, unknown>,
): NextResponse {
  console.error(`[${contexto}]`, detalle(causa));
  return NextResponse.json({ error: mensaje, ...extra }, { status });
}

/**
 * Error esperado y culpa de la petición, no del sistema: falta un campo, el
 * CSV no cuadra, el plan ya existe. El mensaje ya está escrito para la usuaria,
 * así que va tal cual y no hace falta ensuciar el log.
 */
export function errorPeticion(
  mensaje: string,
  status = 400,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: mensaje, ...extra }, { status });
}
