// Cliente mínimo de la API de App Store Connect para las apps de estudio
// (scripts/asc.mjs). Lo puro: la firma del token y la forma de cada petición.
// Sin imports de `@/`: lo usa un script de Node y `node --test`.
//
// ⚠️ La clave (`ASC_KEY_P8`) solo vive en los secretos de GitHub Actions. Nada de
// aquí la escribe en disco ni la imprime; quien llame no debe hacerlo tampoco.
//
// Lo que Apple NO deja hacer por esta API (comprobado contra su foro y el error que
// devuelve: «The resource 'apps' does not allow 'CREATE'»): crear el registro de una
// app ni contestar el cuestionario de privacidad. Por eso existe el lote de apps
// creadas de antemano (docs/APP-IOS.md, «Apps por estudio»).

import { createPrivateKey, sign } from 'node:crypto';

export const ASC_API = 'https://api.appstoreconnect.apple.com';
/** Apple no acepta tokens de más de 20 minutos. */
const VIDA_TOKEN_S = 19 * 60;

export interface CredencialesAsc { keyId: string; issuerId: string; p8: string }

/** Lee las tres variables y dice cuál falta, sin enseñar su valor. */
export function credencialesDe(env: Record<string, string | undefined>): CredencialesAsc | { falta: string[] } {
  const keyId = env.ASC_KEY_ID?.trim() ?? '';
  const issuerId = env.ASC_ISSUER_ID?.trim() ?? '';
  const p8 = (env.ASC_KEY_P8 ?? '').trim();
  const falta = [
    !/^[A-Z0-9]{10}$/.test(keyId) && 'ASC_KEY_ID',
    !/^[0-9a-f-]{36}$/i.test(issuerId) && 'ASC_ISSUER_ID',
    !/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(p8) && 'ASC_KEY_P8',
  ].filter((x): x is string => !!x);
  return falta.length ? { falta } : { keyId, issuerId, p8 };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** El token ES256 que pide Apple, válido 19 minutos desde `ahora`. */
export function tokenAsc(c: CredencialesAsc, ahora: Date = new Date()): string {
  const iat = Math.floor(ahora.getTime() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'ES256', kid: c.keyId, typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({ iss: c.issuerId, iat, exp: iat + VIDA_TOKEN_S, aud: 'appstoreconnect-v1' }));
  const firma = sign('sha256', Buffer.from(`${cabecera}.${cuerpo}`), {
    key: createPrivateKey(c.p8), dsaEncoding: 'ieee-p1363',
  });
  return `${cabecera}.${cuerpo}.${b64url(firma)}`;
}

/** Las capacidades que necesita la app (las mismas que `App.entitlements`). */
export const CAPACIDADES = ['PUSH_NOTIFICATIONS', 'ASSOCIATED_DOMAINS', 'APPLE_ID_AUTH'] as const;

export const cuerpoBundleId = (identificador: string, nombre: string) => ({
  data: { type: 'bundleIds', attributes: { identifier: identificador, name: nombre, platform: 'IOS' } },
});

export const cuerpoCapacidad = (bundleIdRecurso: string, capacidad: (typeof CAPACIDADES)[number]) => ({
  data: {
    type: 'bundleIdCapabilities',
    attributes: {
      capabilityType: capacidad,
      // «Entrar con Apple» como app principal (no agrupada con otra).
      ...(capacidad === 'APPLE_ID_AUTH'
        ? { settings: [{ key: 'APPLE_ID_AUTH_APP_CONSENT', options: [{ key: 'PRIMARY_APP_CONSENT' }] }] }
        : {}),
    },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bundleIdRecurso } } },
  },
});

export const cuerpoNombre = (localizacionId: string, nombre: string) => ({
  data: { type: 'appInfoLocalizations', id: localizacionId, attributes: { name: nombre } },
});

/** Un identificador del lote: `app.tentare.cupo-007`. */
export function bundleDeCupo(numero: number): string {
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) throw new Error(`Número de hueco fuera de rango: ${numero}`);
  return `app.tentare.cupo-${String(numero).padStart(3, '0')}`;
}

/** El mensaje de error de Apple, legible y sin cabeceras. */
export function errorAsc(estado: number, cuerpo: unknown): string {
  const errores = (cuerpo as { errors?: { title?: string; detail?: string }[] } | null)?.errors ?? [];
  const texto = errores.map((e) => [e.title, e.detail].filter(Boolean).join(': ')).join(' · ');
  return `Apple contestó ${estado}${texto ? `: ${texto}` : ''}`;
}
