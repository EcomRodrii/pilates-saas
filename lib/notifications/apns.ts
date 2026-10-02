// ─────────────────────────────────────────────────────────────────────────────
// Avisos nativos de iOS por APNs (app de Tentare en el App Store, 2-oct-2026).
//
// Dentro de la app no hay Web Push: el WebView no lo tiene. El token del iPhone se
// guarda en la MISMA tabla que las suscripciones web (`push_subscription`), con
// el endpoint `apns://<bundleId>/<token>`. Así hereda todo lo que ya hace el canal
// PUSH (comprobar que es del estudio, reintentos, retirar las caducadas, el
// «¿por qué no le llegó?») sin una tabla ni un circuito paralelos.
//
// Autenticación por clave (.p8), no por certificado: una clave sirve para todas
// las apps de la cuenta y no caduca cada año. Sin las variables de entorno el
// canal no envía nada a iOS y lo dice; la web sigue igual.
//
// Puro salvo `enviarApns` (red, HTTP/2), para poder probarlo con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { createPrivateKey, sign as firmar } from 'node:crypto';

import { leerEndpointApns } from './apns-endpoint.ts';
export { PREFIJO_APNS, endpointApns, esEndpointApns, leerEndpointApns } from './apns-endpoint.ts';

export interface ConfigApns {
  keyId: string;
  teamId: string;
  /** El contenido del .p8 (PEM). En Vercel puede venir con `\n` escritos. */
  clavePrivada: string;
  produccion: boolean;
}

/** Lee la configuración del entorno, o `null` si falta algo (el canal lo dice). */
export function configApns(env: Record<string, string | undefined> = process.env): ConfigApns | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const clave = env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!keyId || !teamId || !clave) return null;
  // Por defecto, producción: TestFlight y el App Store usan el APNs de producción.
  // Solo una compilación de desarrollo desde Xcode necesita `sandbox`.
  return { keyId, teamId, clavePrivada: clave, produccion: env.APNS_ENTORNO?.trim() !== 'sandbox' };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * El JWT del proveedor (ES256), válido una hora para Apple. Firma en formato
 * IEEE P1363 (r‖s), que es lo que pide JWS — no el DER que da Node por defecto.
 */
export function jwtApns(cfg: Pick<ConfigApns, 'keyId' | 'teamId' | 'clavePrivada'>, ahoraSeg = Math.floor(Date.now() / 1000)): string {
  const cabecera = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const cuerpo = b64url(JSON.stringify({ iss: cfg.teamId, iat: ahoraSeg }));
  const datos = `${cabecera}.${cuerpo}`;
  const firma = firmar('sha256', Buffer.from(datos), { key: createPrivateKey(cfg.clavePrivada), dsaEncoding: 'ieee-p1363' });
  return `${datos}.${b64url(firma)}`;
}

/**
 * El cuerpo APNs a partir del payload que ya se manda por Web Push (el mismo
 * título, texto, enlace e id de recibo), para que los dos caminos digan lo mismo.
 */
export function payloadApns(payloadWeb: string): string {
  let p: { title?: string; body?: string; url?: string; tag?: string; nid?: string } = {};
  try { p = JSON.parse(payloadWeb) as typeof p; } catch { /* payload vacío: aviso sin texto */ }
  return JSON.stringify({
    aps: {
      alert: { title: p.title ?? '', body: p.body ?? '' },
      sound: 'default',
      ...(p.tag ? { 'thread-id': p.tag } : {}),
    },
    // Lo lee la app al pulsar el aviso (`alPulsarAviso`): ruta interna y recibo.
    url: p.url ?? '/',
    nid: p.nid ?? null,
  });
}

/** Prioridad APNs: 10 = ya; 5 = cuando le venga bien al dispositivo. */
export function prioridadApns(urgency: 'very-low' | 'low' | 'normal' | 'high'): '10' | '5' {
  return urgency === 'high' || urgency === 'normal' ? '10' : '5';
}

let jwtCache: { valor: string; hasta: number; keyId: string } | null = null;

/** Un JWT por cada ~50 min: Apple rechaza (429 TooManyProviderTokenUpdates) si se renueva en cada envío. */
function jwtVigente(cfg: ConfigApns): string {
  const ahora = Date.now();
  if (jwtCache && jwtCache.keyId === cfg.keyId && jwtCache.hasta > ahora) return jwtCache.valor;
  const valor = jwtApns(cfg);
  jwtCache = { valor, hasta: ahora + 50 * 60_000, keyId: cfg.keyId };
  return valor;
}

/**
 * Envía UN aviso a UN dispositivo. Devuelve `{ statusCode }` como `web-push`, y
 * lanza con `statusCode` en el error si Apple dice que no: así lo clasifica el
 * mismo `enviarAEndpoints` (410 = token muerto → se retira; 429/5xx = reintentar).
 */
export async function enviarApns(
  endpoint: string,
  payloadWeb: string,
  opciones: { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; timeout: number },
  cfg: ConfigApns,
): Promise<{ statusCode: number }> {
  const destino = leerEndpointApns(endpoint);
  if (!destino) throw Object.assign(new Error('endpoint APNs inválido'), { statusCode: 400 });
  const http2 = await import('node:http2');
  const host = cfg.produccion ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const cuerpo = payloadApns(payloadWeb);

  return new Promise((resolve, reject) => {
    const sesion = http2.connect(host);
    const cerrar = () => { try { sesion.close(); } catch { /* ya cerrada */ } };
    const plazo = setTimeout(() => { cerrar(); reject(new Error('APNs no respondió a tiempo')); }, opciones.timeout);
    sesion.on('error', (e) => { clearTimeout(plazo); cerrar(); reject(e); });
    const peticion = sesion.request({
      ':method': 'POST',
      ':path': `/3/device/${destino.token}`,
      authorization: `bearer ${jwtVigente(cfg)}`,
      'apns-topic': destino.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': prioridadApns(opciones.urgency),
      'apns-expiration': String(Math.floor(Date.now() / 1000) + opciones.TTL),
      'content-type': 'application/json',
    });
    let estado = 0;
    let respuesta = '';
    peticion.on('response', (h) => { estado = Number(h[':status'] ?? 0); });
    peticion.setEncoding('utf8');
    peticion.on('data', (c: string) => { respuesta += c; });
    peticion.on('end', () => {
      clearTimeout(plazo);
      cerrar();
      if (estado >= 200 && estado < 300) { resolve({ statusCode: estado }); return; }
      let motivo = '';
      try { motivo = (JSON.parse(respuesta) as { reason?: string }).reason ?? ''; } catch { /* sin cuerpo */ }
      // Un token de otro entorno o ya sin app es tan inservible como uno caducado.
      const codigo = motivo === 'BadDeviceToken' || motivo === 'Unregistered' ? 410 : estado;
      reject(Object.assign(new Error(`APNs ${estado}${motivo ? ` ${motivo}` : ''}`), { statusCode: codigo }));
    });
    peticion.on('error', (e) => { clearTimeout(plazo); cerrar(); reject(e); });
    peticion.end(cuerpo);
  });
}
