// `Idempotency-Key` en los POST de la API pública. Puro, para probarlo entero;
// la parte que toca la base de datos vive en servidor.ts (`conApiPublica`).
//
// Un programa que crea una clienta o una reserva y no recibe la respuesta (se
// corta la red, vence su timeout) no sabe si se hizo. Si reintenta a ciegas,
// duplica. Con la misma `Idempotency-Key`, el segundo intento NO se ejecuta:
// recibe la respuesta del primero.
//
// Reglas (las mismas que usa Stripe, para que nadie tenga que aprenderlas):
//   · la clave es opcional: sin ella todo funciona como siempre (Zapier no la
//     manda);
//   · vale para el estudio y la credencial que la usan (la app OAuth, no su
//     token, que cambia cada hora: un reintento con token nuevo sigue siendo el
//     mismo cliente);
//   · misma clave y misma petición → la respuesta guardada, con
//     `Idempotent-Replayed: true`;
//   · misma clave y OTRA petición (otra ruta u otro cuerpo) → 422;
//   · si la primera sigue en marcha → 409, reintenta en un segundo;
//   · un 5xx no se guarda: el reintento vuelve a ejecutarse;
//   · se guarda 24 h. Pasado eso, la clave vale como nueva.

import { createHash } from 'node:crypto';

export const CABECERA_IDEMPOTENCIA = 'Idempotency-Key';
export const HORAS_RETENCION = 24;
/** Una petición «en curso» más vieja que esto se dio por perdida (la función murió). */
export const SEGUNDOS_EN_CURSO_MAXIMO = 120;

const RE_CLAVE = /^[\x21-\x7E]{1,255}$/;

/** `null` sin cabecera; `'invalida'` si no es ASCII visible de 1 a 255 caracteres. */
export function leerClaveIdempotencia(valor: string | null | undefined): string | null | 'invalida' {
  if (valor === null || valor === undefined) return null;
  const v = valor.trim();
  if (!v) return 'invalida';
  return RE_CLAVE.test(v) ? v : 'invalida';
}

/** Lo que identifica la petición: la ruta y el cuerpo tal cual llegó. */
export function huellaPeticion(ruta: string, cuerpo: string): string {
  return createHash('sha256').update(`POST ${ruta}\n${cuerpo}`, 'utf8').digest('hex');
}

/** Quién usa la clave: la clave de API, o la app OAuth (estable entre tokens). */
export function credencialDeIdempotencia(c: { tipo: 'clave'; claveId: string } | { tipo: 'oauth'; clienteId: string }): string {
  return c.tipo === 'clave' ? `clave:${c.claveId}` : `app:${c.clienteId}`;
}

export interface FilaIdempotencia {
  huella: string;
  estado: 'EN_CURSO' | 'COMPLETADA';
  status_http: number | null;
  respuesta: unknown;
  creado_en: string;
}

export type QueHacer =
  | { tipo: 'repetir'; status: number; cuerpo: unknown }
  | { tipo: 'conflicto' }
  | { tipo: 'en_curso' }
  /** La fila que había ya no vale (caducada o abandonada): se reemplaza y se ejecuta. */
  | { tipo: 'reemplazar' };

/** Qué hacer cuando la clave ya estaba guardada. */
export function decidirConClaveUsada(existente: FilaIdempotencia, huella: string, ahora: Date): QueHacer {
  const edad = ahora.getTime() - Date.parse(existente.creado_en);
  if (edad >= HORAS_RETENCION * 3_600_000) return { tipo: 'reemplazar' };
  if (existente.huella !== huella) return { tipo: 'conflicto' };
  if (existente.estado === 'COMPLETADA' && existente.status_http !== null) {
    return { tipo: 'repetir', status: existente.status_http, cuerpo: existente.respuesta };
  }
  return edad >= SEGUNDOS_EN_CURSO_MAXIMO * 1000 ? { tipo: 'reemplazar' } : { tipo: 'en_curso' };
}

/** ¿Se guarda esta respuesta para repetirla? Un 5xx no: el reintento debe volver a ejecutarse. */
export function seGuarda(status: number): boolean {
  return status < 500;
}
