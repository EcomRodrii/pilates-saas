// Veri*Factu — el envío HTTPS a la AEAT, con certificado de cliente (TLS mutuo).
//
// SOLO SERVIDOR: usa `node:https` y maneja una clave privada.
//
// ⚠️ EL CERTIFICADO ENTRA POR PARÁMETRO. Con la vía elegida (apoderamiento IZ860
// a una persona física) es el certificado cualificado de persona física del
// apoderado, y va al endpoint `www1` (`www10` es solo para certificado de sello,
// según el WSDL). Esta capa no lo decide: lo recibe de `config.ts`.
//
// ⚠️ NUNCA se recalcula ni se regenera nada para reenviar. Se manda el XML tal y
// como se congeló en `verifactu_registros.xml_registro`: un reintento con otra
// huella rompe la cadena del emisor (error 2000), y uno con otro XML ya no es el
// mismo registro. Por eso esta función recibe el sobre ya construido.
//
// ⚠️ NO ES LO MISMO «NO SALIÓ» QUE «NO CONTESTÓ». Si la conexión falla antes de
// que la petición salga entera, la AEAT no la ha visto y reenviar es seguro. Si
// salió y no hubo respuesta, pudo llegar: eso es INCIERTO y se concilia con una
// consulta, nunca reenviando a ciegas (ver estado.ts).
//
// ⚠️ Esta función NO se ha ejecutado nunca contra la AEAT — hace falta un
// certificado real. La forma del XML (validada contra el XSD) y el parseo de la
// respuesta sí están cubiertos por tests; el transporte no. La primera prueba
// real es `scripts/verifactu-preproduccion.ts`, contra preproducción y con el
// NIF del propio apoderado.

import { request } from 'node:https';
import { createHash } from 'node:crypto';
import { endpointVerifactu, SOAP_ACTION, type DestinoAeat } from './endpoints.ts';
import type { FalloTransporte } from './estado.ts';

export interface CertificadoCliente {
  /** Contenido del .p12/.pfx. */
  pfx: Buffer;
  passphrase: string;
}

/**
 * Huella del CONTENEDOR del certificado (SHA-256 de los bytes del .pfx), para
 * dejar constancia en `verifactu_envios` de con qué credencial salió cada envío
 * sin guardar la credencial. No es la huella X.509 del certificado (esa exigiría
 * desempaquetar el PKCS#12); identifica el fichero configurado, que es lo que
 * interesa auditar: si se cambia el .pfx, cambia.
 */
export function huellaCredencial(c: CertificadoCliente): string {
  return createHash('sha256').update(c.pfx).digest('hex');
}

export function sha256Texto(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

export interface ResultadoLlamada {
  /** Código HTTP, o null si ni siquiera hubo respuesta. */
  status: number | null;
  /** Cuerpo crudo. Se devuelve SIEMPRE: ante una respuesta que no sepamos
   *  parsear, es lo único que permite reconstruir qué pasó. */
  cuerpo: string;
  /** null si hubo respuesta HTTP; si no, en qué punto falló. */
  fallo: FalloTransporte | null;
  error: string | null;
  iniciadoEn: Date;
  terminadoEn: Date;
}

/**
 * Manda un sobre SOAP ya construido y devuelve la respuesta cruda.
 *
 * No reintenta ni interpreta: quien llama decide (estado.ts), porque el
 * reintento tiene que respetar el control de flujo y distinguir si la AEAT pudo
 * recibirlo.
 */
export async function llamarAeat(
  sobreXml: string,
  certificado: CertificadoCliente,
  destino: DestinoAeat,
  opciones: { timeoutMs?: number } = {},
): Promise<ResultadoLlamada> {
  const url = new URL(endpointVerifactu(destino));
  const cuerpo = Buffer.from(sobreXml, 'utf8');
  const iniciadoEn = new Date();
  // Se pone a true cuando el último byte de la petición ha salido. Antes de eso,
  // cualquier fallo es NO_ENVIADO (la AEAT no ha podido procesar nada).
  let peticionEnviada = false;
  let resuelto = false;

  return new Promise<ResultadoLlamada>(resolve => {
    const terminar = (r: Omit<ResultadoLlamada, 'iniciadoEn' | 'terminadoEn'>) => {
      if (resuelto) return;
      resuelto = true;
      resolve({ ...r, iniciadoEn, terminadoEn: new Date() });
    };

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
          // El WSDL oficial declara `soapAction=""` en las dos operaciones.
          SOAPAction: SOAP_ACTION,
        },
      },
      res => {
        const trozos: Buffer[] = [];
        res.on('data', d => trozos.push(d as Buffer));
        res.on('end', () => {
          terminar({ status: res.statusCode ?? null, cuerpo: Buffer.concat(trozos).toString('utf8'), fallo: null, error: null });
        });
        res.on('error', e => {
          // La respuesta empezó a llegar y se cortó: la AEAT la procesó o no.
          terminar({ status: res.statusCode ?? null, cuerpo: Buffer.concat(trozos).toString('utf8'), fallo: 'SIN_RESPUESTA', error: e.message });
        });
      },
    );

    req.on('finish', () => { peticionEnviada = true; });

    req.setTimeout(opciones.timeoutMs ?? 30_000, () => {
      // Un timeout NO significa que la AEAT no lo haya recibido.
      req.destroy(new Error('timeout'));
      terminar({
        status: null, cuerpo: '',
        fallo: peticionEnviada ? 'SIN_RESPUESTA' : 'NO_ENVIADO',
        error: 'Sin respuesta de la AEAT (timeout)',
      });
    });

    req.on('error', e => {
      terminar({ status: null, cuerpo: '', fallo: peticionEnviada ? 'SIN_RESPUESTA' : 'NO_ENVIADO', error: e.message });
    });

    req.end(cuerpo);
  });
}
