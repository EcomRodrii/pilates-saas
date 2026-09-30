// Qué se manda a Sentry cuando una ruta de API responde con un fallo inesperado.
//
// Vive aparte de `lib/errores-servidor.ts` por la misma razón que
// `lib/sentry-cola.ts`: aquél importa `next/server`, que `node --test` no
// resuelve, y un test que tuviera que simularlo acabaría probando el simulacro.
// Esto es lógica pura, así que `errores-servidor-aviso.test.ts` ejecuta EL MISMO
// código que corre en producción. Importa que sea así: si esto se rompe no se ve
// nada raro en pantalla, simplemente dejas de enterarte de los 500.

/** Texto legible de cualquier cosa que se pueda lanzar, para el log. */
export function detalle(causa: unknown): string {
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
 * Solo un fallo del servidor avisa. Un 4xx es culpa de la petición y ya se
 * responde con su frase; avisar por cada uno ahogaría los que sí son nuestros.
 */
export function avisaASentry(status: number): boolean {
  return status >= 500;
}

export interface CapturaSentry {
  error: Error;
  opciones: { tags: { contexto: string }; fingerprint?: string[] };
}

/**
 * Lo que se le pasa a `Sentry.captureException`.
 *
 * Un `Error` viaja tal cual: Sentry lo agrupa por su pila real (distingue dónde
 * falló de verdad) y, si la ruta ya lo había capturado a mano antes de llamar a
 * `errorInterno`, descarta el segundo aviso por ser el mismo objeto seguido
 * (medido con un transporte falso, no supuesto).
 *
 * Una causa que NO es `Error` (un objeto suelto, un string) se envuelve aquí.
 * Ese `Error` nace dentro de esta función, así que su pila es siempre la misma
 * para todas las rutas y sin más Sentry las fundiría en UNA sola incidencia.
 * Por eso se agrupa por `contexto`: una incidencia por ruta.
 */
export function capturaParaSentry(contexto: string, causa: unknown): CapturaSentry {
  if (causa instanceof Error) {
    return { error: causa, opciones: { tags: { contexto } } };
  }
  return {
    error: new Error(`[${contexto}] ${detalle(causa)}`),
    opciones: { tags: { contexto }, fingerprint: ['errorInterno', contexto] },
  };
}
