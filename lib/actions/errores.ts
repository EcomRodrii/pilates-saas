import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * Error de una Server Action con un mensaje pensado PARA la persona y un
 * código HTTP explícito.
 *
 * Antes cada shim deducía el status haciendo `message.includes('propietario')`
 * sobre el texto en español del error, y devolvía ese texto tal cual al
 * navegador. Dos problemas: el contrato HTTP quedaba atado a la redacción de
 * un mensaje, y cualquier excepción inesperada (un error de Postgres, un
 * timeout, una violación de RLS) salía íntegra en el cuerpo de la respuesta
 * — justo lo que `lib/errores-servidor.ts` existe para impedir: "el detalle
 * técnico SIEMPRE se conserva en el log del servidor y NUNCA viaja al
 * navegador".
 */
export class ErrorAccion extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
    this.name = 'ErrorAccion';
  }
}

/**
 * Traduce lo que sale de una Server Action a una respuesta HTTP.
 *
 * `ErrorAccion` → su mensaje y su status, porque quien lo lanzó decidió a
 * propósito que eso se puede leer. Cualquier otra cosa → 500 con frase fija,
 * y el detalle al log (donde Sentry lo recoge).
 */
export function respuestaDeErrorAccion(contexto: string, e: unknown): NextResponse {
  if (e instanceof ErrorAccion) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${contexto}]`, e);
  Sentry.captureException(e, { tags: { contexto } });
  return NextResponse.json(
    { error: 'No se ha podido completar la operación. Vuelve a intentarlo.' },
    { status: 500 },
  );
}

/**
 * Marca una Server Action del piloto del Sprint 2 que todavía NO está
 * implementada.
 *
 * Se creó en #1376 un fichero por área con la forma de la acción futura, pero
 * el cuerpo devolvía `{ ok: true }` —y en algunos casos un identificador
 * fabricado, `'pay_' + Date.now()`— sin hacer nada. Ninguna está conectada
 * todavía, así que hoy no rompen nada; el problema es que el commit las
 * presenta como la plantilla a replicar en las 217 rutas que quedan, y esa
 * plantilla dice "responde que sí y no hagas el trabajo". Es exactamente la
 * familia de fallos —escritura optimista, `{ ok: true }` falso— que este
 * proyecto lleva meses arrancando de raíz.
 *
 * Fallar aquí es gratis mientras nadie las llame, y es una alarma inmediata el
 * día que alguien las conecte antes de escribir el cuerpo. La ruta de API
 * equivalente sigue viva y es la que hace el trabajo de verdad.
 */
export function accionSinImplementar(nombre: string): never {
  throw new ErrorAccion(
    `La acción "${nombre}" todavía no está implementada. Usa la ruta de API equivalente.`,
    501,
  );
}
