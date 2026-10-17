// La consulta de cabeceras a la web de un estudio, desde NUESTRO servidor: ¿se
// puede enseñar dentro del marco de la vista previa?
//
// La dirección sale de `studios.widget_dominios_autorizados` (la guarda solo la
// propietaria, con su formato validado), nunca de lo que mande el navegador; y
// aun así quien hace la petición es Tentare, así que lleva las mismas cerraduras
// que un webhook (lib/api-publica/webhooks/destino.ts y envio.ts):
//  · solo https, puerto 443, sin usuario ni contraseña;
//  · la IP se comprueba AL CONECTAR (`crearLookupSeguro`, el `lookup` de
//    https.request): una web que resuelve a una dirección privada o interna no
//    llega a recibir la conexión, ni en la primera petición ni en un salto;
//  · tiempo máximo TOTAL (no de inactividad) para toda la consulta;
//  · solo cabeceras: HEAD y, si el HEAD no vale, GET. El cuerpo no se lee: en
//    cuanto llegan las cabeceras la conexión se corta;
//  · redirecciones: unas pocas y SOLO dentro del mismo sitio (el mismo host con o
//    sin `www.`, siempre https). Un salto a otro sitio no se sigue: «no se puede
//    enmarcar», sin tocar ese otro sitio.
// Lo que sale de aquí son categorías, no mensajes de red: la pantalla las explica.
//
// `peticion` se inyecta para probar la decisión, las redirecciones y los topes
// sin red; la de verdad (`peticionSegura`) lleva todo lo de arriba.

import { request } from 'node:https';
import { isIP } from 'node:net';
import { crearLookupSeguro, DestinoNoPermitido, esDominioPropio, esIpPublica } from '../../api-publica/webhooks/destino.ts';
import { LEGAL } from '../../legal-info.ts';
import { decidirEnmarcable, mismoSitio, type Cabeceras } from './decision.ts';

/** Tiempo máximo de TODA la consulta (todas las peticiones juntas). */
export const TIEMPO_TOTAL_MS = 8_000;
/** Redirecciones que se siguen, como mucho (dentro del mismo sitio). */
export const MAX_REDIRECCIONES = 3;
const USER_AGENT = `Tentare-VistaPrevia/1.0 (+${LEGAL.url})`;

export type ResultadoConsulta =
  | { tipo: 'enmarcable' }
  | { tipo: 'no-enmarcable'; motivo: 'x-frame-options' | 'frame-ancestors' | 'otro-sitio' }
  | { tipo: 'sin-saber'; motivo: 'privada' | 'tiempo' | 'red' | 'respuesta' | 'protocolo' };

export interface RespuestaDeCabeceras {
  estadoHttp: number;
  cabeceras: Cabeceras;
}

export type PeticionDeCabeceras = (x: { url: URL; metodo: 'HEAD' | 'GET'; timeoutMs: number }) => Promise<RespuestaDeCabeceras>;

/** La petición real: https, IP pública comprobada al conectar, tiempo máximo, sin leer el cuerpo. */
export const peticionSegura: PeticionDeCabeceras = ({ url, metodo, timeoutMs }) => {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Con una IP literal Node no llama a `lookup`: se comprueba aquí, para que esta función sea segura por sí sola.
  if (url.protocol !== 'https:' || (isIP(host) && !esIpPublica(host))) return Promise.reject(new DestinoNoPermitido());
  return new Promise((resolve, reject) => {
    let terminado = false;
    const reloj: { id?: ReturnType<typeof setTimeout> } = {};
    const acabar = (f: () => void) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj.id);
      f();
    };
    const req = request({
      method: metodo,
      protocol: 'https:',
      hostname: host,
      port: 443,
      path: `${url.pathname}${url.search}`,
      servername: isIP(host) ? undefined : host,
      lookup: crearLookupSeguro(),
      agent: false,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.5' },
    }, (res) => {
      // Con las cabeceras basta: el cuerpo no se lee ni se guarda.
      acabar(() => resolve({ estadoHttp: res.statusCode ?? 0, cabeceras: res.headers as Cabeceras }));
      res.destroy();
    });
    reloj.id = setTimeout(() => {
      req.destroy();
      acabar(() => reject(Object.assign(new Error('tiempo'), { code: 'TIEMPO' })));
    }, Math.max(1, timeoutMs));
    req.on('error', (e: Error) => acabar(() => reject(e)));
    req.end();
  });
};

/** Un `https://host` (con o sin barra) → su URL de partida, o `null` si no se puede consultar. */
function urlDePartida(origen: string): URL | null {
  let u: URL;
  try { u = new URL(origen); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  return new URL('/', `https://${u.hostname}`);
}

function motivoDeError(e: unknown): Extract<ResultadoConsulta, { tipo: 'sin-saber' }>['motivo'] {
  if (e instanceof DestinoNoPermitido) return 'privada';
  const codigo = (e as NodeJS.ErrnoException | undefined)?.code;
  return codigo === 'TIEMPO' || codigo === 'ETIMEDOUT' ? 'tiempo' : 'red';
}

export async function consultarEnmarcable(
  origen: string,
  nuestroOrigen: string,
  deps: { peticion?: PeticionDeCabeceras; ahora?: () => number; totalMs?: number } = {},
): Promise<ResultadoConsulta> {
  const peticion = deps.peticion ?? peticionSegura;
  const ahora = deps.ahora ?? Date.now;
  const limite = ahora() + (deps.totalMs ?? TIEMPO_TOTAL_MS);
  const partida = urlDePartida(origen);
  if (!partida) return { tipo: 'sin-saber', motivo: 'protocolo' };
  // Defensa en profundidad (la primera puerta está en `resolverWebReal`): nunca se consulta un dominio de Tentare.
  if (esDominioPropio(partida.hostname)) return { tipo: 'no-enmarcable', motivo: 'otro-sitio' };

  let url = partida;
  for (let saltos = 0; saltos <= MAX_REDIRECCIONES; saltos++) {
    const restante = () => limite - ahora();
    let r: RespuestaDeCabeceras;
    try {
      if (restante() <= 0) return { tipo: 'sin-saber', motivo: 'tiempo' };
      r = await peticion({ url, metodo: 'HEAD', timeoutMs: restante() });
      // Hay webs que no contestan bien a un HEAD (405, 403…) pero sí a un GET: las cabeceras de este último valen.
      if (r.estadoHttp >= 400) {
        if (restante() <= 0) return { tipo: 'sin-saber', motivo: 'tiempo' };
        r = await peticion({ url, metodo: 'GET', timeoutMs: restante() });
      }
    } catch (e) {
      return { tipo: 'sin-saber', motivo: motivoDeError(e) };
    }

    if (r.estadoHttp >= 300 && r.estadoHttp <= 399) {
      const destino = Array.isArray(r.cabeceras.location) ? r.cabeceras.location[0] : r.cabeceras.location;
      // Una redirección sin destino no lleva a ninguna parte: no se sabe.
      if (!destino) return { tipo: 'sin-saber', motivo: 'respuesta' };
      let siguiente: URL;
      try { siguiente = new URL(destino, url); } catch { return { tipo: 'sin-saber', motivo: 'respuesta' }; }
      // Solo dentro del mismo sitio y siempre por https (un salto a http sería bajar de https: no se sigue).
      if (siguiente.protocol !== 'https:' || !mismoSitio(partida.hostname, siguiente.hostname)
        || siguiente.username || siguiente.password || (siguiente.port && siguiente.port !== '443')) {
        return { tipo: 'no-enmarcable', motivo: 'otro-sitio' };
      }
      url = siguiente;
      continue;
    }

    const d = decidirEnmarcable({ estadoHttp: r.estadoHttp, cabeceras: r.cabeceras, nuestroOrigen });
    if (d.ok) return { tipo: 'enmarcable' };
    return d.motivo === 'respuesta' ? { tipo: 'sin-saber', motivo: 'respuesta' } : { tipo: 'no-enmarcable', motivo: d.motivo };
  }
  // Más saltos de los que se siguen.
  return { tipo: 'sin-saber', motivo: 'respuesta' };
}
