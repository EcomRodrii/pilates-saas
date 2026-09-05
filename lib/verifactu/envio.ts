// Veri*Factu — el envío HTTPS a la AEAT, con certificado de cliente.
//
// SOLO SERVIDOR: usa `node:https` y maneja una clave privada.
//
// ⚠️ EL CERTIFICADO ENTRA POR PARÁMETRO, A PROPÓSITO. Esta capa no sabe ni
// quiere saber de dónde sale: puede ser el certificado de sello de Tentare
// (modelo colaborador social) o el propio del estudio. Esa decisión es legal,
// no técnica, y está sin cerrar — ver docs/VERIFACTU-INVESTIGACION-TECNICA.md
// §3. Atar esta función a una de las dos opciones obligaría a reescribirla
// cuando se decida.
//
// ⚠️ NUNCA se recalcula la huella para reenviar. El registro se transmite tal y
// como se persistió: un reintento con huella distinta rompe la cadena del
// emisor y la AEAT lo marca (error 2000). Por eso esta función recibe el XML ya
// construido y no los datos de la factura.
//
// ⚠️ Esta función NO se ha ejecutado nunca contra la AEAT — hace falta un
// certificado real, que hoy no existe en el proyecto. La forma del XML y el
// parseo de la respuesta sí están cubiertos por tests; el transporte no.

import { request } from 'node:https';
import { endpointVerifactu, SOAP_ACTION_REG_FACTU, type DestinoAeat } from './endpoints.ts';
import { parsearRespuestaAeat, type RespuestaAeat } from './respuesta.ts';

export interface CertificadoCliente {
  /** Contenido del .p12/.pfx. */
  pfx: Buffer;
  passphrase: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** Código HTTP, o null si ni siquiera hubo respuesta. */
  status: number | null;
  /** Cuerpo crudo. Se devuelve SIEMPRE: ante una respuesta que no sepamos
   *  parsear, es lo único que permite reconstruir qué pasó. */
  cuerpo: string;
  respuesta: RespuestaAeat | null;
  error: string | null;
}

/**
 * Manda un sobre SOAP ya construido y devuelve la respuesta parseada.
 *
 * No reintenta: quien llama decide, porque el reintento tiene que respetar el
 * `TiempoEsperaEnvio` que devuelve la propia AEAT y eso es una decisión de
 * planificación, no de transporte.
 */
export async function enviarSobreAeat(
  sobreXml: string,
  certificado: CertificadoCliente,
  destino: DestinoAeat,
  opciones: { timeoutMs?: number } = {},
): Promise<ResultadoEnvio> {
  const url = new URL(endpointVerifactu(destino));
  const cuerpo = Buffer.from(sobreXml, 'utf8');

  return new Promise<ResultadoEnvio>(resolve => {
    const req = request(
      {
        host: url.hostname,
        path: url.pathname,
        method: 'POST',
        pfx: certificado.pfx,
        passphrase: certificado.passphrase,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': cuerpo.length,
          SOAPAction: SOAP_ACTION_REG_FACTU,
        },
      },
      res => {
        const trozos: Buffer[] = [];
        res.on('data', d => trozos.push(d as Buffer));
        res.on('end', () => {
          const texto = Buffer.concat(trozos).toString('utf8');
          const status = res.statusCode ?? null;
          let respuesta: RespuestaAeat | null = null;
          try {
            respuesta = parsearRespuestaAeat(texto);
          } catch {
            respuesta = null;
          }
          // Un 200 con SoapFault NO es un envío correcto. Y un 500 puede traer
          // igualmente un Fault legible, que es más útil que el código.
          const ok = status === 200 && respuesta !== null && !respuesta.fault;
          resolve({
            ok,
            status,
            cuerpo: texto,
            respuesta,
            error: ok ? null : respuesta?.faultMensaje ?? `La AEAT respondió ${status ?? 'sin código'}`,
          });
        });
      },
    );

    req.setTimeout(opciones.timeoutMs ?? 30_000, () => {
      req.destroy();
      // Un timeout NO significa que la AEAT no lo haya recibido. Quien reintente
      // tiene que hacerlo con el MISMO registro y su misma huella.
      resolve({ ok: false, status: null, cuerpo: '', respuesta: null, error: 'Sin respuesta de la AEAT (timeout)' });
    });

    req.on('error', e => {
      resolve({ ok: false, status: null, cuerpo: '', respuesta: null, error: e.message });
    });

    req.end(cuerpo);
  });
}
