// ─────────────────────────────────────────────────────────────────────────────
// Prueba de la aceptación del contrato de la socia (términos + privacidad del
// estudio). Plan RGPD 3.17 / auditoría C-8.
//
// Lo que antes decidía el navegador y ahora decide el servidor: la FECHA
// (`now()` en la RPC), el ORIGEN (PORTAL/MOSTRADOR según la puerta) y el TEXTO
// (compuesto con los datos del estudio de la base, igual que el sello por
// compra). Además se guarda una huella de la IP y el user-agent recortado, en
// `aceptaciones_contrato_eventos` (append-only): con solo las columnas de
// `socios`, volver a aceptar tras cambiar las condiciones borraba la prueba de
// la aceptación anterior.
//
// Puro (solo `node:crypto`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac } from 'node:crypto';

export const USER_AGENT_MAX = 256;

/**
 * HMAC-SHA256 de la IP con un secreto de servidor. Nunca se guarda la IP: la
 * huella permite comprobar «¿venía de esta IP?» si alguien la aporta, pero no
 * se puede invertir sin el secreto.
 *
 * El prefijo separa este uso del limitador de peticiones, que firma con el
 * mismo secreto: la misma IP no da la misma huella en las dos tablas.
 *
 * ⚠️ Rotar el secreto no invalida nada guardado, pero deja de poder cotejarse.
 */
export function huellaIp(ip: string | null | undefined, secreto: string): string | null {
  const limpia = (ip ?? '').trim();
  if (!limpia || limpia === 'unknown' || !secreto) return null;
  return createHmac('sha256', secreto).update(`aceptacion-contrato:${limpia}`, 'utf8').digest('hex');
}

/** Sin caracteres de control y a lo sumo `USER_AGENT_MAX`. `null` si no hay. */
export function truncarUserAgent(ua: string | null | undefined): string | null {
  if (typeof ua !== 'string') return null;
  const limpio = ua.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return limpio ? limpio.slice(0, USER_AGENT_MAX) : null;
}

export type ResultadoAceptacion =
  | { ok: true; cambiado: boolean }
  | { ok: false; status: number; error: string };

/** Lo que devuelve `aceptacion_contrato_registrar` → resultado para la ruta. */
export function resultadoAceptacion(r: unknown): ResultadoAceptacion {
  switch (r) {
    case 'OK': return { ok: true, cambiado: true };
    // Repetir (doble toque, reintento del alta) no es un error.
    case 'YA_CONSTABA': return { ok: true, cambiado: false };
    case 'SOCIA_NO_ENCONTRADA': return { ok: false, status: 404, error: 'No encontramos esa ficha en el estudio.' };
    default: return { ok: false, status: 500, error: 'No hemos podido registrar la aceptación de las condiciones. Inténtalo de nuevo.' };
  }
}

/**
 * ¿La RPC todavía no existe en esta base? Pasa si el código llega a producción
 * antes que su migración (mergear no la aplica). Solo en ese caso se degrada a
 * escribir las columnas con los valores del servidor, sin historial: un alta
 * rota para todo el mundo es peor que una prueba sin IP durante unos minutos.
 */
export function rpcNoDesplegada(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}
