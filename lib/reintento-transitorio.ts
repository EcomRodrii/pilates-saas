// Reintento acotado para errores TRANSITORIOS de infraestructura (Gateway
// Timeout, Service Unavailable...), no para errores de negocio.
//
// M-11 (59ª auditoría / Sentry JAVASCRIPT-NEXTJS-1G): "Gateway Timeout" es un
// 504 de Supabase/Vercel, no un fallo de la app — y no lo cazaba
// `esErrorDeRedCliente` de lib/supabase-data.ts (ese filtro es para blips del
// FETCH del navegador: "load failed", "failed to fetch"...; un 504 de
// PostgREST llega con su propio mensaje). El cron global de recordatorios
// (`/api/cron/notif-recordatorios`, cada 15 min) es el que más lo sufre solo
// por volumen: 124 apariciones en 27 días es la misma tasa de fallo ambiental
// que en cualquier otro sitio, vista muchas más veces.
//
// Módulo aparte y SIN imports de `@/...` a propósito: `lib/supabase-data.ts`
// usa ese alias, y eso rompe `node --test` (ver
// alias-arroba-oculta-tests-node-test.md) — la lógica de reintento tiene que
// poder probarse sin arrastrarlo.

const REINTENTOS_TRANSITORIOS = 2;
const ESPERA_ENTRE_REINTENTOS_MS = 400;

/** ¿Es un fallo pasajero de la infraestructura, o uno de negocio/permisos? */
export function esErrorTransitorioDeInfra(error: { message: string }): boolean {
  return /gateway timeout|service unavailable|too many connections|connection (reset|closed|terminated)/i
    .test(error.message);
}

/**
 * Repite `intentar()` hasta REINTENTOS_TRANSITORIOS veces más si el resultado
 * trae un error transitorio, con una espera corta creciente entre intentos.
 * Cualquier otro resultado (éxito, o un error que no es transitorio) se
 * devuelve tal cual, sin reintentar.
 */
export async function conReintentoTransitorio<R extends { error: { message: string } | null }>(
  intentar: () => PromiseLike<R>,
): Promise<{ resultado: R; reintentos: number }> {
  let intento = 0;
  for (;;) {
    const resultado = await intentar();
    if (!resultado.error || intento >= REINTENTOS_TRANSITORIOS || !esErrorTransitorioDeInfra(resultado.error)) {
      return { resultado, reintentos: intento };
    }
    intento++;
    await new Promise(r => setTimeout(r, ESPERA_ENTRE_REINTENTOS_MS * intento));
  }
}
