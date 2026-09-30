// Veri*Factu — dónde se envían los registros de facturación a la AEAT.
//
// Sacado del WSDL oficial (`SistemaFacturacion.wsdl`). Hay CUATRO endpoints y
// elegir mal no da un error claro: da validaciones de negocio distintas o un
// rechazo de certificado.
//
// Los dos ejes son independientes:
//  · entorno   → preproducción / producción.
//  · con qué CERTIFICADO se autentica → persona física o representante (www1) o
//    SELLO de entidad (www10). El WSDL lo dice así: «Entorno de PRODUCCION para
//    acceso con certificado de sello» para www10.
//
// Con la vía de Tentare (apoderamiento IZ860 a una persona física, que remite
// con SU certificado de persona física) el destino es SIEMPRE `www1` / `prewww1`.
// El tipo 'sello' se mantiene tipado para no perder la información del WSDL,
// pero `config.ts` no lo permite: un sello es de personas jurídicas (eIDAS art. 3).
//
// ⚠️ La AEAT avisa de que, aunque el XSD sea común, cada URL puede tener
// matices propios de validación: remisión voluntaria y bajo requerimiento son
// sistemas SEPARADOS en su lado y no comparten registros.

/** Con qué tipo de certificado se autentica el envío. Decide el host. */
export type TipoCertificadoVerifactu = 'representante' | 'sello';

export interface DestinoAeat {
  entorno: 'preproduccion' | 'produccion';
  certificado: TipoCertificadoVerifactu;
}

const RUTA = '/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';

const HOSTS: Record<`${DestinoAeat['entorno']}:${TipoCertificadoVerifactu}`, string> = {
  'produccion:representante': 'https://www1.agenciatributaria.gob.es',
  'produccion:sello': 'https://www10.agenciatributaria.gob.es',
  'preproduccion:representante': 'https://prewww1.aeat.es',
  'preproduccion:sello': 'https://prewww10.aeat.es',
};

export function endpointVerifactu(destino: DestinoAeat): string {
  return HOSTS[`${destino.entorno}:${destino.certificado}`] + RUTA;
}

/**
 * `SOAPAction` de las dos operaciones (alta/anulación y consulta). El WSDL
 * oficial declara `<soap:operation soapAction=""/>` en ambas. Hasta sep-2026
 * aquí se mandaba el nombre de la operación, que el WSDL no pide.
 */
export const SOAP_ACTION = '';

/** Tope duro del XSD: `RegistroFactura maxOccurs="1000"`. */
export const MAX_REGISTROS_POR_ENVIO = 1000;

/**
 * Espera mínima entre envíos, en segundos, mientras la AEAT no diga otra cosa.
 *
 * No es una cortesía: el control de flujo es OBLIGATORIO (Orden HAC/1177/2024,
 * art. 16.2). La respuesta trae un `TiempoEsperaEnvio` que la AEAT recalcula,
 * y hay que respetarlo — no se puede lanzar envíos en bucle.
 */
export const ESPERA_INICIAL_SEGUNDOS = 60;
