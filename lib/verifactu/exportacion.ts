// Veri*Factu — exportación de los registros de facturación de un estudio.
//
// Para qué: el mandato (cláusula 8) promete poner a disposición del estudio la
// información necesaria para la continuidad de su facturación, y el estudio la
// necesita para su gestoría o para conservarla. Sale en dos formatos:
//   · CSV, para abrirlo en Excel: un registro por fila, con su estado en la AEAT
//     y si encadena con el anterior.
//   · XML, con cada `sf:RegistroAlta`/`sf:RegistroAnulacion` EXACTAMENTE como se
//     congeló (el mismo texto que viaja a la AEAT), más su estado y su CSV.
//
// Lógica pura, sin base de datos: la lectura está en exportacion-servidor.ts.
// Los dos formatos se generan por trozos para que la ruta los emita en stream.

import type { EstadoRegistroVerifactu, TipoRegistro } from './estado.ts';
import { NS_SI, escaparXml } from './xml.ts';
import { SIF } from './sif.ts';

export interface RegistroExportable {
  seq: number;
  tipo: TipoRegistro;
  idEmisor: string;
  numSerie: string;
  /** dd-mm-aaaa, como va en el registro. */
  fechaExpedicion: string;
  tipoFactura: string | null;
  cuotaTotal: number | null;
  importeTotal: number | null;
  /** '' en el primer registro de la cadena. */
  huellaAnterior: string;
  huella: string | null;
  /** La fecha y hora que entra en la huella, tal cual. */
  fechaHoraHusoGen: string | null;
  estado: EstadoRegistroVerifactu;
  /** Código seguro de verificación que devuelve la AEAT al admitirlo. */
  csv: string | null;
  codigoError: string | null;
  descripcionError: string | null;
  /** Solo en la exportación XML. NULL mientras no se ha preparado para el envío. */
  xmlRegistro?: string | null;
  xmlSha256?: string | null;
}

export interface CabeceraExportacion {
  nombreObligado: string;
  nifObligado: string;
  numeroInstalacion: string;
  /** ISO. */
  exportadoEn: string;
}

/**
 * Si cada registro apunta a la huella del que tiene delante.
 * 'SIN_HUELLA': el anterior aún no la tiene calculada, no se puede saber.
 */
export type Encadenado = 'SI' | 'NO' | 'SIN_HUELLA';

function ordenados(registros: readonly RegistroExportable[]): RegistroExportable[] {
  return [...registros].sort((a, b) => a.seq - b.seq);
}

/**
 * Se calcula al exportar, no se copia de ninguna columna: es la comprobación que
 * haría la gestoría con la hoja delante. Un hueco en la posición cuenta como NO.
 * `registros` tiene que ser la cadena ENTERA del estudio, ordenada por `seq`.
 */
export function encadenamientos(registros: readonly RegistroExportable[]): Encadenado[] {
  return registros.map((r, i) => {
    if (r.seq === 1) return r.huellaAnterior === '' ? 'SI' : 'NO';
    const anterior = i > 0 ? registros[i - 1] : null;
    if (!anterior || anterior.seq !== r.seq - 1) return 'NO';
    if (!anterior.huella) return 'SIN_HUELLA';
    return r.huellaAnterior === anterior.huella ? 'SI' : 'NO';
  });
}

const ETIQUETA_TIPO: Record<TipoRegistro, string> = {
  ALTA: 'Alta',
  ALTA_SUBSANACION: 'Alta (subsanación)',
  ANULACION: 'Anulación',
};

const ETIQUETA_ESTADO: Record<EstadoRegistroVerifactu, string> = {
  RESERVADO: 'Sin enviar',
  PENDIENTE: 'Sin enviar',
  LISTO: 'Sin enviar',
  REINTENTAR: 'Sin enviar (se reintentará)',
  ENVIANDO: 'Enviándose',
  INCIERTO: 'Envío sin confirmar',
  REGISTRADA: 'Registrado en la AEAT',
  ACEPTADA_CON_ERRORES: 'Aceptado por la AEAT con errores',
  ANULADA_EN_AEAT: 'Anulado en la AEAT',
  RECHAZADA: 'Rechazado por la AEAT',
  HISTORICO: 'No enviado (anterior al envío a la AEAT)',
};

const ETIQUETA_ENCADENADO: Record<Encadenado, string> = { SI: 'Sí', NO: 'No', SIN_HUELLA: '' };

function importe(n: number | null): string {
  return n == null ? '' : Number(n).toFixed(2).replace('.', ',');
}

// Punto y coma y BOM: lo que abre Excel en español sin preguntar (mismo criterio
// que lib/fichaje/csv-jornadas.ts). Una celda de texto que empieza por = + - @
// se prefija con ' para que la hoja no la ejecute como fórmula; los importes
// negativos de una rectificativa no, que son números.
function celda(v: string): string {
  const esNumero = /^-?\d+(,\d+)?$/.test(v);
  const segura = !esNumero && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

export const CABECERA_CSV = [
  'Posición', 'Tipo de registro', 'NIF del emisor', 'Número de factura', 'Fecha de expedición',
  'Tipo de factura', 'Cuota total', 'Importe total', 'Fecha y hora de generación', 'Huella',
  'Huella anterior', 'Encadena con el anterior', 'Estado', 'Código seguro de verificación (AEAT)',
  'Código de error', 'Descripción del error',
] as const;

/** El CSV por trozos: la cabecera y luego una línea por registro. */
export function* csvRegistros(registros: readonly RegistroExportable[]): Generator<string> {
  const orden = ordenados(registros);
  const cadena = encadenamientos(orden);
  yield '﻿' + CABECERA_CSV.map(celda).join(';') + '\r\n';
  for (let i = 0; i < orden.length; i++) {
    const r = orden[i];
    yield [
      String(r.seq),
      ETIQUETA_TIPO[r.tipo] ?? r.tipo,
      r.idEmisor,
      r.numSerie,
      r.fechaExpedicion,
      r.tipoFactura ?? '',
      importe(r.cuotaTotal),
      importe(r.importeTotal),
      r.fechaHoraHusoGen ?? '',
      r.huella ?? '',
      r.huellaAnterior,
      ETIQUETA_ENCADENADO[cadena[i]],
      ETIQUETA_ESTADO[r.estado] ?? r.estado,
      r.csv ?? '',
      r.codigoError ?? '',
      r.descripcionError ?? '',
    ].map(celda).join(';') + '\r\n';
  }
}

function atributos(pares: Record<string, string | number | null | undefined>): string {
  return Object.entries(pares)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => ` ${k}="${escaparXml(String(v))}"`)
    .join('');
}

/**
 * El XML por trozos. La raíz declara el espacio de nombres `sf` que usan los
 * registros congelados (no lo llevan dentro: en el envío lo declara el sobre),
 * así que cada fragmento se copia sin tocar un byte.
 *
 * No es un documento del esquema de la AEAT (el de envío topa en 1000 registros
 * y no tiene sitio para el estado ni el CSV), sino un contenedor: lo que valida
 * contra SuministroInformacion.xsd es cada registro de dentro.
 */
export function* xmlRegistros(registros: readonly RegistroExportable[], c: CabeceraExportacion): Generator<string> {
  const orden = ordenados(registros);
  const cadena = encadenamientos(orden);
  yield '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- Registros de facturación generados por el sistema informático de facturación. ' +
    'Cada sf:RegistroAlta o sf:RegistroAnulacion es el texto exacto que se generó para la AEAT; ' +
    'sha256 es su resumen. Un Registro sin contenido aún no se ha preparado para el envío. -->\n' +
    `<RegistrosFacturacion xmlns:sf="${NS_SI}"` +
    atributos({
      sistema: SIF.nombre, idSistema: SIF.id, version: SIF.version, numeroInstalacion: c.numeroInstalacion,
      nifObligado: c.nifObligado, nombreObligado: c.nombreObligado, exportadoEn: c.exportadoEn, registros: orden.length,
    }) + '>\n';
  for (let i = 0; i < orden.length; i++) {
    const r = orden[i];
    const attrs = atributos({
      posicion: r.seq, tipo: r.tipo, estado: r.estado, numSerie: r.numSerie, fechaExpedicion: r.fechaExpedicion,
      huella: r.huella,
      encadenaConAnterior: cadena[i] === 'SIN_HUELLA' ? null : String(cadena[i] === 'SI'),
      csvAeat: r.csv, codigoError: r.codigoError, descripcionError: r.descripcionError,
      sha256: r.xmlRegistro ? r.xmlSha256 : null,
    });
    yield r.xmlRegistro
      ? `  <Registro${attrs}>${r.xmlRegistro}</Registro>\n`
      : `  <Registro${attrs}/>\n`;
  }
  yield '</RegistrosFacturacion>\n';
}

/** `registros-verifactu-2026-09-30.csv`, con la fecha del estudio. */
export function nombreFichero(formato: 'csv' | 'xml', exportadoEn: Date): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(exportadoEn);
  return `registros-verifactu-${dia}.${formato}`;
}
