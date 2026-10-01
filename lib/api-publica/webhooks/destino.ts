// A dónde puede llamar un webhook (protección SSRF).
//
// La URL la escribe el estudio, y quien llama es NUESTRO servidor: sin esto, un
// webhook a `https://169.254.169.254/…` o a un nombre que resuelve a 10.0.0.5
// pondría a Tentare a hacer peticiones dentro de la red de Vercel o de quien
// sea. Tres cerraduras:
//   1. al guardar: https, puerto 443, sin usuario/contraseña, sin nombres
//      locales y, si es una IP, pública (`validarUrlWebhook`);
//   2. al guardar también: el nombre resuelve SOLO a direcciones públicas
//      (`comprobarResolucionPublica`), para avisar ya en el panel;
//   3. al ENVIAR: la resolución se vuelve a comprobar en el momento de conectar
//      (`crearLookupSeguro`, el `lookup` de https.request). Es la que de verdad
//      cuenta: el DNS puede cambiar entre guardar y enviar (DNS rebinding), y
//      así se conecta exactamente a la IP que se ha comprobado.
// Y no se siguen redirecciones (envio.ts): un 302 a una IP interna no llega a
// ninguna parte.

import { BlockList, isIP, type LookupFunction } from 'node:net';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';

const NO_PUBLICAS_V4 = new BlockList();
for (const [red, prefijo] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) NO_PUBLICAS_V4.addSubnet(red, prefijo, 'ipv4');

// IPv6: lista BLANCA. Solo unicast global (2000::/3), menos documentación,
// Teredo y 6to4 (estos dos llevan una IPv4 dentro que podría ser interna). Todo
// lo demás —loopback, ULA fc00::/7, enlace local, IPv4 mapeadas ::ffff:…,
// NAT64— queda fuera sin tener que enumerarlo.
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6');
const NO_PUBLICAS_V6 = new BlockList();
for (const [red, prefijo] of [['2001:db8::', 32], ['2001::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  NO_PUBLICAS_V6.addSubnet(red, prefijo, 'ipv6');
}

export function esIpPublica(ip: string): boolean {
  const familia = isIP(ip);
  if (familia === 4) return !NO_PUBLICAS_V4.check(ip, 'ipv4');
  if (familia === 6) return GLOBAL_V6.check(ip, 'ipv6') && !NO_PUBLICAS_V6.check(ip, 'ipv6');
  return false;
}

const SUFIJOS_LOCALES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];
/** Nuestros propios dominios: un webhook que se llama a sí mismo solo sirve para hacer bucles. */
const DOMINIOS_PROPIOS = ['tentare.app'];

export type UrlValidada = { ok: true; url: URL } | { ok: false; error: string };

export function validarUrlWebhook(texto: unknown): UrlValidada {
  if (typeof texto !== 'string' || !texto.trim()) return { ok: false, error: 'Falta la dirección (URL) del webhook.' };
  const limpio = texto.trim();
  if (limpio.length > 500) return { ok: false, error: 'La dirección es demasiado larga (500 caracteres como mucho).' };
  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    return { ok: false, error: 'No es una dirección válida. Debe empezar por https://' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'La dirección tiene que empezar por https:// (los avisos llevan datos de tus cobros).' };
  if (url.username || url.password) return { ok: false, error: 'La dirección no puede llevar usuario ni contraseña.' };
  if (url.port && url.port !== '443') return { ok: false, error: 'Solo se puede usar el puerto estándar de https (443).' };
  if (url.hash) return { ok: false, error: 'La dirección no puede llevar «#».' };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return { ok: false, error: 'Falta el dominio en la dirección.' };
  if (isIP(host)) {
    return esIpPublica(host) ? { ok: true, url } : { ok: false, error: 'Esa dirección es privada o interna: tiene que ser pública en internet.' };
  }
  if (host === 'localhost' || !host.includes('.') || SUFIJOS_LOCALES.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'Esa dirección es privada o interna: tiene que ser pública en internet.' };
  }
  if (DOMINIOS_PROPIOS.some((d) => host === d || host.endsWith(`.${d}`))) {
    return { ok: false, error: 'El webhook tiene que apuntar a tu programa, no a Tentare.' };
  }
  return { ok: true, url };
}

export class DestinoNoPermitido extends Error {
  constructor(mensaje = 'El destino resuelve a una dirección privada o interna.') {
    super(mensaje);
    this.name = 'DestinoNoPermitido';
  }
}

type Resolutor = (host: string, cb: (err: NodeJS.ErrnoException | null, direcciones: LookupAddress[]) => void) => void;

const resolutorDelSistema: Resolutor = (host, cb) => dnsLookup(host, { all: true, verbatim: true }, cb);

/**
 * El `lookup` para https.request: resuelve TODAS las direcciones y rechaza si
 * alguna no es pública (un nombre con una IP buena y otra interna no pasa).
 * Respeta `all`: con autoSelectFamily, Node pide la lista entera.
 */
export function crearLookupSeguro(resolver: Resolutor = resolutorDelSistema): LookupFunction {
  return (host, opciones, callback) => {
    resolver(host, (err, direcciones) => {
      if (err) { callback(err, '', 4); return; }
      if (direcciones.length === 0 || direcciones.some((d) => !esIpPublica(d.address))) {
        callback(new DestinoNoPermitido(), '', 4);
        return;
      }
      if ((opciones as { all?: boolean }).all) {
        (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, direcciones);
        return;
      }
      callback(null, direcciones[0].address, direcciones[0].family);
    });
  };
}

/** Para avisar al guardar: ¿el nombre resuelve, y solo a direcciones públicas? */
export function comprobarResolucionPublica(url: URL, resolver: Resolutor = resolutorDelSistema): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return Promise.resolve(esIpPublica(host) ? { ok: true } : { ok: false, error: 'Esa dirección es privada o interna.' });
  return new Promise((resolve) => {
    resolver(host, (err, direcciones) => {
      if (err || direcciones.length === 0) {
        resolve({ ok: false, error: 'Ese dominio no existe o no responde. Revisa que esté bien escrito.' });
      } else if (direcciones.some((d) => !esIpPublica(d.address))) {
        resolve({ ok: false, error: 'Ese dominio apunta a una dirección privada o interna: tiene que ser pública en internet.' });
      } else {
        resolve({ ok: true });
      }
    });
  });
}
