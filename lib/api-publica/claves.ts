// Claves de API de un estudio: cómo se generan, se reconocen y se guardan.
//
// Formato: `tnt_sk_` + 32 bytes aleatorios en base64url (43 caracteres). El
// prefijo sirve para dos cosas:
//   · distinguir en `Authorization: Bearer …` una clave de un token OAuth sin
//     consultar dos tablas;
//   · que un escáner de secretos (el de GitHub, un gestor de contraseñas) la
//     reconozca si alguien la pega donde no debe.
//
// En la base solo se guarda el SHA-256 (mismo criterio que los tokens OAuth,
// `lib/oauth-crypto.ts`): con 256 bits de entropía no hace falta un hash lento,
// y un volcado de la tabla no autentica nada. La clave en claro se enseña UNA
// vez, al crearla. Lo que se ve después es `prefijo`: los primeros caracteres,
// para reconocerla en el panel («tnt_sk_aB3x…»).

import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../oauth-crypto.ts';

export const PREFIJO_CLAVE = 'tnt_sk_';
const BYTES_SECRETO = 32;
const LARGO_VISIBLE = PREFIJO_CLAVE.length + 6;
const RE_CLAVE = /^tnt_sk_[A-Za-z0-9_-]{43}$/;

export interface ClaveNueva {
  /** La clave completa. Se devuelve una vez y no se guarda. */
  clave: string;
  /** Lo que se guarda: SHA-256 hex. */
  hash: string;
  /** Lo que se enseña después: «tnt_sk_aB3xY9». */
  prefijo: string;
}

export function generarClaveApi(): ClaveNueva {
  const clave = PREFIJO_CLAVE + randomBytes(BYTES_SECRETO).toString('base64url');
  return { clave, hash: hashClaveApi(clave), prefijo: clave.slice(0, LARGO_VISIBLE) };
}

export function hashClaveApi(clave: string): string {
  return sha256Hex(clave);
}

/** ¿Tiene forma de clave de API? (Si no, el Bearer se trata como token OAuth.) */
export function esClaveApi(token: string): boolean {
  return RE_CLAVE.test(token);
}
