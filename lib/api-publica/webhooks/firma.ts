// Firma de los webhooks (HMAC-SHA256), mismo esquema que Stripe:
//
//   Tentare-Firma: t=<segundos unix>,v1=<hex>[,v1=<hex>]
//
// `v1` es HMAC-SHA256(secreto, "<t>.<cuerpo>") en hexadecimal, con el secreto
// tal cual (`whsec_…`) como clave. Tras rotar el secreto se firma con los dos
// durante 24 h: el integrador acepta la petición si CUALQUIERA de las `v1` cuadra
// con el suyo. `t` va firmado para que una petición capturada no se pueda
// reenviar días después: quien verifica rechaza un `t` de hace más de 5 minutos.
//
// La verificación vive aquí aunque Tentare no la necesite: es la referencia que
// enseña docs/api-publica.md, y el test garantiza que la guía y la firma no se
// separan.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CABECERA_FIRMA = 'Tentare-Firma';
export const PREFIJO_SECRETO = 'whsec_';
/** Lo que se aconseja tolerar al verificar. */
export const TOLERANCIA_SEGUNDOS = 300;

export function generarSecretoWebhook(): string {
  return PREFIJO_SECRETO + randomBytes(32).toString('base64url');
}

function hmac(secreto: string, t: number, cuerpo: string): string {
  return createHmac('sha256', secreto).update(`${t}.${cuerpo}`, 'utf8').digest('hex');
}

/** El valor de la cabecera: una `v1` por secreto vigente (el actual primero). */
export function firmar(cuerpo: string, secretos: readonly string[], t: number = Math.floor(Date.now() / 1000)): string {
  if (secretos.length === 0) throw new Error('firmar: hace falta al menos un secreto');
  return [`t=${t}`, ...secretos.map(s => `v1=${hmac(s, t, cuerpo)}`)].join(',');
}

export type ResultadoVerificacion = { ok: true } | { ok: false; motivo: 'cabecera' | 'caducada' | 'no_cuadra' };

/** Lo que debe hacer el integrador al recibir un webhook. */
export function verificarFirma(
  cuerpo: string,
  cabecera: string | null | undefined,
  secreto: string,
  ahora: number = Math.floor(Date.now() / 1000),
  toleranciaSegundos: number = TOLERANCIA_SEGUNDOS,
): ResultadoVerificacion {
  if (!cabecera) return { ok: false, motivo: 'cabecera' };
  let t: number | null = null;
  const firmas: string[] = [];
  for (const parte of cabecera.split(',')) {
    const [k, v] = parte.split('=', 2).map(x => x?.trim());
    if (k === 't' && v && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === 'v1' && v && /^[0-9a-f]{64}$/.test(v)) firmas.push(v);
  }
  if (t === null || firmas.length === 0) return { ok: false, motivo: 'cabecera' };
  if (Math.abs(ahora - t) > toleranciaSegundos) return { ok: false, motivo: 'caducada' };
  const esperada = Buffer.from(hmac(secreto, t, cuerpo), 'hex');
  const cuadra = firmas.some(f => {
    const b = Buffer.from(f, 'hex');
    return b.length === esperada.length && timingSafeEqual(b, esperada);
  });
  return cuadra ? { ok: true } : { ok: false, motivo: 'no_cuadra' };
}
