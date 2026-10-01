// El POST de un webhook. `node:https` y no `fetch` porque hace falta el
// `lookup` propio (destino.ts): con fetch no hay forma de comprobar la IP a la
// que de verdad se conecta. Sin redirecciones, sin reutilizar sockets y con un
// tope de tiempo TOTAL (no solo de inactividad). De la respuesta solo importa
// el código.

import { request } from 'node:https';
import { isIP } from 'node:net';
import { crearLookupSeguro, DestinoNoPermitido, esIpPublica } from './destino.ts';
import { LEGAL } from '../../legal-info.ts';

export const TIMEOUT_MS = 8_000;
export const USER_AGENT = `Tentare-Webhooks/1.0 (+${LEGAL.url})`;

export type ResultadoEnvio =
  | { tipo: 'respuesta'; estadoHttp: number; duracionMs: number }
  | { tipo: 'error'; error: string; destinoNoPermitido: boolean; duracionMs: number };

const lookupSeguro = crearLookupSeguro();

export function enviarWebhook(url: URL, cuerpo: string, cabeceras: Record<string, string>, timeoutMs = TIMEOUT_MS): Promise<ResultadoEnvio> {
  const inicio = Date.now();
  const duracion = () => Date.now() - inicio;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Con una IP literal Node no llama a `lookup`: se comprueba aquí, para que
  // esta función sea segura por sí sola y no dependa de que quien la llame
  // haya validado antes la URL.
  if (url.protocol !== 'https:' || (isIP(host) && !esIpPublica(host))) {
    return Promise.resolve({ tipo: 'error', error: new DestinoNoPermitido().message, destinoNoPermitido: true, duracionMs: 0 });
  }
  return new Promise((resolve) => {
    let terminado = false;
    const reloj: { id?: ReturnType<typeof setTimeout> } = {};
    const acabar = (r: ResultadoEnvio) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj.id);
      resolve(r);
    };
    const req = request({
      method: 'POST',
      protocol: 'https:',
      hostname: host,
      port: 443,
      path: `${url.pathname}${url.search}`,
      // El SNI no admite IPs; con una IP literal no hay nombre que mandar (y
      // tampoco `lookup`: por eso se comprueba arriba).
      servername: isIP(host) ? undefined : host,
      lookup: lookupSeguro,
      agent: false,
      headers: { ...cabeceras, 'Content-Length': String(Buffer.byteLength(cuerpo, 'utf8')) },
    }, (res) => {
      // Con el código basta: el cuerpo de la respuesta no se lee ni se guarda,
      // y no se espera a que termine (un destino lento al mandarlo no puede
      // convertir un 200 en un «sin respuesta»).
      acabar({ tipo: 'respuesta', estadoHttp: res.statusCode ?? 0, duracionMs: duracion() });
      res.destroy();
    });
    reloj.id = setTimeout(() => {
      req.destroy();
      acabar({ tipo: 'error', error: `Sin respuesta en ${Math.round(timeoutMs / 1000)} s`, destinoNoPermitido: false, duracionMs: duracion() });
    }, timeoutMs);
    req.on('error', (e: Error) => {
      const destinoNoPermitido = e instanceof DestinoNoPermitido;
      acabar({ tipo: 'error', error: describirError(e), destinoNoPermitido, duracionMs: duracion() });
    });
    req.end(cuerpo, 'utf8');
  });
}

function describirError(e: Error): string {
  if (e instanceof DestinoNoPermitido) return e.message;
  const codigo = (e as NodeJS.ErrnoException).code;
  switch (codigo) {
    case 'ENOTFOUND': case 'EAI_AGAIN': return 'El dominio no existe o no responde (DNS).';
    case 'ECONNREFUSED': return 'El servidor rechazó la conexión.';
    case 'ECONNRESET': return 'El servidor cortó la conexión.';
    case 'ETIMEDOUT': return 'El servidor no contestó a tiempo.';
    case 'CERT_HAS_EXPIRED': return 'El certificado https del destino ha caducado.';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT': case 'SELF_SIGNED_CERT_IN_CHAIN': return 'El certificado https del destino no es válido (autofirmado).';
    case 'ERR_TLS_CERT_ALTNAME_INVALID': return 'El certificado https no corresponde a ese dominio.';
    default: return (codigo ? `${codigo}: ` : '') + e.message.slice(0, 200);
  }
}
