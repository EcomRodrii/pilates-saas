// El endpoint con el que se guarda el token de la app de iOS en `push_subscription`.
// Aparte de `apns.ts` (que usa node:crypto y HTTP/2) para que el cliente pueda
// construir el MISMO endpoint al darse de baja o comprobar su registro.

export const PREFIJO_APNS = 'apns://';

/** Un token de dispositivo APNs: hexadecimal, 64 caracteres hoy (Apple avisa de que puede crecer). */
const TOKEN_VALIDO = /^[0-9a-f]{64,200}$/i;
/** Bundle ID de iOS: letras, números, guiones y puntos. */
const BUNDLE_VALIDO = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function endpointApns(bundleId: string, token: string): string | null {
  if (!BUNDLE_VALIDO.test(bundleId) || !TOKEN_VALIDO.test(token)) return null;
  return `${PREFIJO_APNS}${bundleId}/${token.toLowerCase()}`;
}

export function esEndpointApns(endpoint: string): boolean {
  return endpoint.startsWith(PREFIJO_APNS);
}

/** `apns://<bundle>/<token>` → sus partes, o `null` si no lo es. */
export function leerEndpointApns(endpoint: string): { bundleId: string; token: string } | null {
  if (!esEndpointApns(endpoint)) return null;
  const [bundleId, token, ...resto] = endpoint.slice(PREFIJO_APNS.length).split('/');
  if (resto.length || !bundleId || !token) return null;
  if (!BUNDLE_VALIDO.test(bundleId) || !TOKEN_VALIDO.test(token)) return null;
  return { bundleId, token };
}
