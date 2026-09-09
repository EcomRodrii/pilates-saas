// ─────────────────────────────────────────────────────────────────────────────
// Qué parte de Veri*Factu puede aparecer en el documento que recibe la CLIENTA.
//
// Veri*Factu produce dos cosas distintas, y este repo las tenía impresas en la
// misma caja de la misma plantilla:
//
//  · El REGISTRO DE FACTURACIÓN del estudio — huella SHA-256, huella anterior,
//    número de secuencia de la cadena, estado ante la AEAT, CSV del acuse. Es
//    la contabilidad del obligado tributario. No es de la clienta, no le sirve
//    de nada y nunca ha tenido que ir impreso en su factura.
//  · El SELLO DE COTEJO — el QR y su leyenda. Eso SÍ es suyo: existe justo para
//    que pueda comprobar su factura en la sede electrónica de la AEAT.
//
// De todo lo anterior, en la factura de la clienta cabe el sello y nada más.
//
// ⚠️ Y solo cuando hay algo que cotejar DE VERDAD. Un QR contra el entorno de
// pruebas de la AEAT, o contra un registro que nunca llegó a transmitirse, no
// verifica nada: manda a la clienta a una página que le dirá que su factura no
// consta. Eso es peor que no imprimir nada, porque parece una factura falsa.
// Por eso la puerta no es «¿está sellada?» sino «¿la AEAT la tiene?».
// ─────────────────────────────────────────────────────────────────────────────
import { urlQrVerifactu, fechaExpedicionDesdeISO } from './verifactu-qr.ts';
import { yaNoSeReenvia, type EstadoTransmision } from './verifactu/pendientes.ts';

/** Lo único de Veri*Factu que viaja al documento de la clienta. */
export interface SelloCliente {
  /** URL de cotejo de la AEAT que codifica el QR. */
  url: string;
  /** Leyenda obligatoria junto al QR (Orden HAC/1177/2024). */
  leyenda: string;
}

export const LEYENDA_VERIFACTU = 'Factura verificable en la sede electrónica de la AEAT';

/** Lo que hace falta saber de una factura para decidir su sello. */
export interface DatosSello {
  numeroCompleto: string;
  fechaEmision: string;
  total: number;
  /** Sellada = tiene huella en la cadena del estudio. */
  verifactuHash: string | null;
  /** Estado ante la AEAT. NULL = nunca entró en la cola de transmisión. */
  verifactuEstado?: string | null;
}

/**
 * El sello de cotejo que puede llevar la factura de la clienta, o `null`.
 *
 * `null` NO es un error ni una factura inválida: hoy en producción lo es para
 * las 36 facturas emitidas, porque ninguna ha sido admitida todavía por la
 * AEAT. Es el estado normal mientras la integración no esté en marcha.
 */
export function selloParaCliente(
  f: DatosSello,
  nifEmisor: string,
  opciones: { produccion: boolean },
): SelloCliente | null {
  // Sin NIF del emisor no se puede construir la URL de cotejo.
  if (!nifEmisor) return null;
  // Sin huella no hay registro de facturación: no es una factura Veri*Factu.
  if (!f.verifactuHash) return null;
  // Contra el entorno de pruebas de la AEAT no se coteja nada real.
  if (!opciones.produccion) return null;
  // Y la AEAT tiene que haberla admitido. PENDIENTE/RECHAZADA/NULL no cotejan.
  if (!f.verifactuEstado || !yaNoSeReenvia(f.verifactuEstado as EstadoTransmision)) return null;

  return {
    url: urlQrVerifactu(
      {
        nif: nifEmisor,
        numSerie: f.numeroCompleto,
        fecha: fechaExpedicionDesdeISO(f.fechaEmision),
        importeTotal: f.total,
      },
      { produccion: true },
    ),
    leyenda: LEYENDA_VERIFACTU,
  };
}
