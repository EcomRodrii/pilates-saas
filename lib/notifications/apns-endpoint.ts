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

/**
 * Los servicios de Web Push de los navegadores (Chrome/Edge/Brave/Samsung → FCM; Safari → Apple;
 * Edge antiguo → Windows; Firefox → Mozilla). El servidor hace un POST a la dirección que se guarda,
 * así que solo se aceptan estas: cualquier otra sería pedirle al servidor que llame a donde diga el
 * navegador. Un token de la app (`apns://`) nunca entra por aquí: va por `nativo`, que comprueba el bundle.
 */
const HOSTS_WEB_PUSH = ['fcm.googleapis.com', 'android.googleapis.com', 'push.apple.com', 'notify.windows.com', 'push.services.mozilla.com'];

export function endpointWebPushValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2000) return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return HOSTS_WEB_PUSH.some((h) => host === h || host.endsWith(`.${h}`));
}
