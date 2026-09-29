// Veri*Factu — de una fila de `verifactu_registros` (+ su factura) al XML.
//
// Lógica pura: recibe datos, devuelve el XML del registro o lanza
// `RegistroInvalidoError`. Se llama UNA vez por registro, al prepararlo
// (PENDIENTE → LISTO); el resultado se congela en `xml_registro` y NO se vuelve
// a construir nunca, ni en un reintento.
//
// Los campos que entran en la huella salen SIEMPRE del propio registro
// (congelados al sellar), nunca de la factura ni del estudio de hoy: si el
// estudio cambiara su NIF mañana, el XML tiene que seguir diciendo el NIF con
// el que se calculó la huella.

import {
  xmlRegistroAlta, xmlRegistroAnulacion, CLAVE_REGIMEN_GENERAL,
  type SistemaInformatico, type EncadenamientoAnterior, type RegistroAltaXml,
} from './xml.ts';
import type { TipoRegistro } from './estado.ts';

/** La fila de `verifactu_registros`, lo que hace falta para el XML. */
export interface RegistroParaXml {
  tipo: TipoRegistro;
  idEmisor: string;
  numSerie: string;
  /** dd-mm-aaaa */
  fechaExpedicion: string;
  tipoFactura: string | null;
  cuotaTotal: number | null;
  importeTotal: number | null;
  huella: string;
  huellaAnterior: string;
  anterior: { idEmisor: string; numSerie: string; fechaExpedicion: string } | null;
  fechaHoraHusoGen: string;
  rechazoPrevio: 'N' | 'S' | 'X' | null;
  sinRegistroPrevio: boolean;
  /** Correcciones que no entran en la huella (solo en subsanaciones). */
  datosCorregidos: DatosCorregidos | null;
}

/** Lo que una subsanación puede corregir sin tocar la huella. */
export interface DatosCorregidos {
  nombreEmisor?: string;
  receptorNombre?: string;
  receptorNif?: string;
  descripcionOperacion?: string;
}

/** La factura, lo que no está en el registro. */
export interface FacturaParaXml {
  baseImponible: number;
  tipoIva: number;
  cuotaIva: number;
  receptorNombre: string | null;
  receptorNif: string | null;
  tipoRectificativa: 'S' | 'I' | null;
  /** DescripcionOperacion ya acotada (`descripcionAeatDeFactura`). */
  descripcion: string;
  /** Solo en rectificativas: la factura que rectifica. */
  rectificada: { idEmisor: string; numSerie: string; fechaExpedicion: string; baseImponible: number; cuotaIva: number } | null;
}

function encadenamiento(r: RegistroParaXml): EncadenamientoAnterior | null {
  if (!r.huellaAnterior) return null;
  if (!r.anterior) {
    // Encadenado pero sin los datos del anterior: el XML sería inválido. No se
    // inventan; el registro no se construye.
    throw new Error('Registro encadenado sin los datos (número y fecha) de su anterior');
  }
  return {
    idEmisorFactura: r.anterior.idEmisor,
    numSerieFactura: r.anterior.numSerie,
    fechaExpedicionFactura: r.anterior.fechaExpedicion,
    huella: r.huellaAnterior,
  };
}

export function construirXmlRegistro(
  r: RegistroParaXml,
  f: FacturaParaXml,
  nombreEmisor: string,
  sistema: SistemaInformatico,
): string {
  const enc = encadenamiento(r);

  if (r.tipo === 'ANULACION') {
    return xmlRegistroAnulacion({
      facturaAnulada: { idEmisorFactura: r.idEmisor, numSerieFactura: r.numSerie, fechaExpedicionFactura: r.fechaExpedicion },
      sinRegistroPrevio: r.sinRegistroPrevio,
      rechazoPrevio: r.rechazoPrevio === 'S',
      encadenamiento: enc,
      sistemaInformatico: sistema,
      fechaHoraHusoGenRegistro: r.fechaHoraHusoGen,
      huella: r.huella,
    });
  }

  const tipoFactura = r.tipoFactura ?? '';
  const c = r.datosCorregidos ?? {};
  const receptorNif = (c.receptorNif ?? f.receptorNif ?? '').trim();
  const receptorNombre = (c.receptorNombre ?? f.receptorNombre ?? '').trim();
  const llevaDestinatario = ['F1', 'F3', 'R1', 'R2', 'R3', 'R4'].includes(tipoFactura);
  const esRect = tipoFactura.startsWith('R');

  const alta: RegistroAltaXml = {
    emisor: { nombreRazon: (c.nombreEmisor ?? nombreEmisor).trim(), nif: r.idEmisor },
    numSerieFactura: r.numSerie,
    fechaExpedicionFactura: r.fechaExpedicion,
    ...(r.tipo === 'ALTA_SUBSANACION' ? { subsanacion: true, rechazoPrevio: r.rechazoPrevio ?? 'N' } : {}),
    tipoFactura,
    ...(esRect && f.tipoRectificativa ? { tipoRectificativa: f.tipoRectificativa } : {}),
    ...(esRect && f.rectificada ? {
      facturasRectificadas: [{
        idEmisorFactura: f.rectificada.idEmisor,
        numSerieFactura: f.rectificada.numSerie,
        fechaExpedicionFactura: f.rectificada.fechaExpedicion,
      }],
    } : {}),
    // «Desglose de Base y Cuota sustituida en las Facturas Rectificativas
    // sustitutivas» (anotación del XSD): los importes de la factura ORIGINAL.
    ...(f.tipoRectificativa === 'S' && f.rectificada ? {
      importeRectificacion: { baseRectificada: f.rectificada.baseImponible, cuotaRectificada: f.rectificada.cuotaIva },
    } : {}),
    descripcionOperacion: (c.descripcionOperacion ?? f.descripcion).trim(),
    ...(llevaDestinatario ? { destinatarios: [{ nombreRazon: receptorNombre, nif: receptorNif }] } : {}),
    desglose: [{
      claveRegimen: CLAVE_REGIMEN_GENERAL,
      calificacionOperacion: 'S1',
      tipoImpositivo: f.tipoIva,
      baseImponible: f.baseImponible,
      cuotaRepercutida: f.cuotaIva,
    }],
    cuotaTotal: r.cuotaTotal ?? 0,
    importeTotal: r.importeTotal ?? 0,
    encadenamiento: enc,
    sistemaInformatico: sistema,
    fechaHoraHusoGenRegistro: r.fechaHoraHusoGen,
    huella: r.huella,
  };
  return xmlRegistroAlta(alta);
}
