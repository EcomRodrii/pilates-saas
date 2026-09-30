import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { ERROR_GENERICO } from '@/lib/errores';
import { avisaASentry, capturaParaSentry, detalle } from '@/lib/errores-servidor-aviso';

// Lado servidor de la política de errores (el porqué está en lib/errores.ts).
//
// La idea es que el detalle técnico SIEMPRE se conserva —en el log del
// servidor y en Sentry, donde sirve para depurar— y NUNCA viaja al navegador.
// Antes se hacía justo al revés: `{ error: error.message }` mandaba el texto de
// Postgres a la pantalla y no lo registraba en ningún sitio, así que el mensaje
// era inútil para la usuaria y encima se perdía para quien tenía que arreglarlo.

/**
 * Fallo inesperado. Registra el detalle completo y responde con una frase en
 * español que la usuaria pueda entender.
 *
 * Si el estado es 5xx, además lo manda a Sentry. ⚠️ Hasta que esto se añadió,
 * un fallo de base de datos en cualquier endpoint devolvía su 500 amable y
 * quedaba SOLO en el log de Vercel: `onRequestError` (instrumentation.ts)
 * únicamente ve lo que una ruta lanza, no lo que devuelve. Con ~400 llamadas a
 * esta función, Sentry callaba justo donde más falta hacía. No hay que
 * capturar además a mano antes de llamar aquí: si es el mismo error, Sentry
 * descarta el segundo aviso.
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
  if (avisaASentry(status)) {
    const { error, opciones } = capturaParaSentry(contexto, causa);
    Sentry.captureException(error, opciones);
  }
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
