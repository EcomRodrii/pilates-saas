// Veri*Factu — dónde se envían los registros de facturación a la AEAT.
//
// Sacado del WSDL oficial (§1 de docs/VERIFACTU-INVESTIGACION-TECNICA.md). Hay
// CUATRO endpoints y elegir mal no da un error claro: da validaciones de
// negocio distintas o un rechazo de certificado.
//
// Los dos ejes son independientes:
//  · entorno   → pruebas / producción.
//  · con qué CERTIFICADO se firma → uno de representante o persona (www1) o uno
//    de SELLO de entidad (www10). El caso de un SaaS que firma por sus clientes
//    es el de sello; el de un estudio que firma con su propio certificado de
//    representante es el otro.
//
// ⚠️ La AEAT avisa de que, aunque el XSD sea común, cada URL puede tener
// matices propios de validación: remisión voluntaria y bajo requerimiento son
// sistemas SEPARADOS en su lado y no comparten registros.

/** Con qué tipo de certificado se firma el envío. Decide el host. */
export type TipoCertificadoVerifactu = 'representante' | 'sello';

export interface DestinoAeat {
  entorno: 'pruebas' | 'produccion';
  certificado: TipoCertificadoVerifactu;
}

const RUTA = '/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';

const HOSTS: Record<`${DestinoAeat['entorno']}:${TipoCertificadoVerifactu}`, string> = {
  'produccion:representante': 'https://www1.agenciatributaria.gob.es',
  'produccion:sello': 'https://www10.agenciatributaria.gob.es',
  'pruebas:representante': 'https://prewww1.aeat.es',
  'pruebas:sello': 'https://prewww10.aeat.es',
};

export function endpointVerifactu(destino: DestinoAeat): string {
  return HOSTS[`${destino.entorno}:${destino.certificado}`] + RUTA;
}

/**
 * `SOAPAction` de la operación de alta/anulación. El WSDL define solo dos
 * operaciones y las dos comparten mensaje; esta es la de suministro.
 */
export const SOAP_ACTION_REG_FACTU = 'RegFactuSistemaFacturacion';

/** Tope duro del XSD: `RegistroFactura maxOccurs="1000"`. */
export const MAX_REGISTROS_POR_ENVIO = 1000;

/**
 * Espera mínima entre envíos, en segundos, mientras la AEAT no diga otra cosa.
 *
 * No es una cortesía: el control de flujo es OBLIGATORIO. La respuesta trae un
 * `TiempoEsperaEnvio` que la AEAT recalcula, y hay que respetarlo — no se puede
 * lanzar envíos en bucle.
 */
export const ESPERA_INICIAL_SEGUNDOS = 60;
