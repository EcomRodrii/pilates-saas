// Qué hacer tras cada intento de entrega. Puro, para poder probarlo entero.
//
// Cualquier 2xx es «entregado». Todo lo demás se reintenta con esperas
// crecientes durante casi tres días (lo que un servidor caído un fin de semana
// necesita para no perder nada), salvo dos casos:
//   · 410 Gone: el destino dice que esa URL ya no existe → el webhook se
//     desactiva y no se insiste;
//   · el destino resuelve a una dirección interna → tampoco se insiste (no va a
//     dejar de serlo solo).
// Cuándo se desactiva el webhook entero, y qué se le avisa a la propietaria,
// vive en salud.ts.

import type { ResultadoEnvio } from './envio.ts';

/** Espera (en minutos) tras el intento n-ésimo fallido. */
export const ESPERAS_MINUTOS = [1, 5, 30, 120, 360, 720, 1440, 1440] as const;
/** El primer intento más un reintento por cada espera. */
export const MAX_INTENTOS = ESPERAS_MINUTOS.length + 1;

export type Decision =
  | { estado: 'ENTREGADA' }
  | { estado: 'PENDIENTE'; proximoIntentoEn: Date }
  | { estado: 'FALLIDA' };

/**
 * Lo que este intento dice del webhook entero: `agotado` = esta entrega ha
 * gastado todos sus reintentos sin entregar (salud.ts decide si eso lo apaga).
 */
export type EfectoEnWebhook = 'ninguno' | 'desactivar_destino_retirado' | 'agotado';

export function esExito(r: ResultadoEnvio): boolean {
  return r.tipo === 'respuesta' && r.estadoHttp >= 200 && r.estadoHttp < 300;
}

/** `intentos` = los hechos YA contando este. */
export function decidirTrasIntento(r: ResultadoEnvio, intentos: number, ahora: Date): { decision: Decision; efecto: EfectoEnWebhook } {
  if (esExito(r)) return { decision: { estado: 'ENTREGADA' }, efecto: 'ninguno' };
  if (r.tipo === 'respuesta' && r.estadoHttp === 410) {
    return { decision: { estado: 'FALLIDA' }, efecto: 'desactivar_destino_retirado' };
  }
  if (r.tipo === 'error' && r.destinoNoPermitido) {
    return { decision: { estado: 'FALLIDA' }, efecto: 'ninguno' };
  }
  if (intentos >= MAX_INTENTOS) return { decision: { estado: 'FALLIDA' }, efecto: 'agotado' };
  const espera = ESPERAS_MINUTOS[Math.max(0, intentos - 1)] ?? ESPERAS_MINUTOS[ESPERAS_MINUTOS.length - 1];
  return { decision: { estado: 'PENDIENTE', proximoIntentoEn: new Date(ahora.getTime() + espera * 60_000) }, efecto: 'ninguno' };
}

/** El texto que se guarda (y enseña el panel) de un intento fallido. */
export function describirFallo(r: ResultadoEnvio): string | null {
  if (esExito(r)) return null;
  if (r.tipo === 'error') return r.error.slice(0, 300);
  if (r.estadoHttp >= 300 && r.estadoHttp < 400) return `Respondió ${r.estadoHttp} (redirección): no se siguen, usa la dirección final.`;
  if (r.estadoHttp === 410) return 'Respondió 410: el destino dice que esa dirección ya no existe.';
  return `Respondió ${r.estadoHttp}.`;
}
