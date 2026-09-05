// Veri*Factu — el XML que se le manda a la AEAT.
//
// ⚠️ EL ORDEN DE LOS ELEMENTOS NO ES ESTÉTICO. `RegistroFacturacionAltaType` es
// una `<sequence>` en el XSD oficial, así que un campo fuera de sitio es un XML
// inválido y la AEAT lo rechaza entero. El orden de abajo está copiado del
// esquema real (SuministroInformacion.xsd, descargado de agenciatributaria.gob.es),
// no de la documentación ni de memoria.
//
// Se construye a mano, sin librería de XML, por lo mismo que el resto del repo
// evita dependencias en el camino del dinero: son ~15 campos con un orden fijo
// y un escapado que hay que controlar al detalle. Lo que sí se hace es escapar
// SIEMPRE, incluso lo que "no puede" traer caracteres raros: el nombre de un
// estudio con «&» ya existe en producción.
//
// Fuente: docs/VERIFACTU-INVESTIGACION-TECNICA.md §1, §5 y §7.

/** El fichero vive en `tikeV1.0/` pero su targetNamespace apunta a `tike/`.
 *  Copiar la ruta del fichero como namespace es un error silencioso. */
export const NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const NS_SI = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
export const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';

/** Única versión admitida hoy por el esquema (`VersionType` = 1.0). */
export const ID_VERSION = '1.0';

/** SHA-256. Es el único valor que usa Tentare y el que fija el motor de huella. */
export const TIPO_HUELLA_SHA256 = '01';

export function escaparXml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(nombre: string, valor: string | number): string {
  return `<sf:${nombre}>${escaparXml(String(valor))}</sf:${nombre}>`;
}

/** Importe tal y como lo quiere el esquema: punto decimal, dos decimales. */
export function importeXml(n: number): string {
  return n.toFixed(2);
}

/** Quién emite. Va en la cabecera y también dentro de cada registro. */
export interface EmisorVerifactu {
  nombreRazon: string;
  nif: string;
}

/**
 * Identificación del software que emite, obligatoria en cada registro.
 *
 * ⚠️ El ámbito de la cadena de huella es (obligado emisor + sistema
 * informático). Cambiar `idSistemaInformatico` o `numeroInstalacion` INICIA UNA
 * CADENA NUEVA para ese estudio a ojos de la AEAT — que es justo lo que
 * contempla su error admisible 2007. No se tocan sin saber lo que se hace.
 */
export interface SistemaInformatico {
  nombreRazon: string;
  nif: string;
  nombreSistemaInformatico: string;
  /** Exactamente 2 caracteres alfanuméricos. */
  idSistemaInformatico: string;
  version: string;
  numeroInstalacion: string;
  soloVerifactu: boolean;
  multiOT: boolean;
  indicadorMultiplesOT: boolean;
}

/** Una línea de IVA. El esquema admite de 1 a 12. */
export interface LineaDesglose {
  /** '01' IVA, '02' IPSI... Opcional: sin él, la AEAT asume IVA. */
  impuesto?: string;
  /** 'S1' sujeta no exenta, 'S2' inversión del sujeto pasivo, 'N1'/'N2' no sujeta. */
  calificacionOperacion?: string;
  /** 'E1'…'E6' si la operación está exenta. Excluyente con calificación. */
  operacionExenta?: string;
  tipoImpositivo?: number;
  baseImponible: number;
  cuotaRepercutida?: number;
}

export interface EncadenamientoAnterior {
  idEmisorFactura: string;
  numSerieFactura: string;
  /** dd-mm-yyyy */
  fechaExpedicionFactura: string;
  huella: string;
}

export interface RegistroAltaXml {
  emisor: EmisorVerifactu;
  numSerieFactura: string;
  /** dd-mm-yyyy */
  fechaExpedicionFactura: string;
  /** F1, F2, R1…R5 */
  tipoFactura: string;
  /** Solo en rectificativas: 'S' (sustitución) o 'I' (diferencias). */
  tipoRectificativa?: string;
  descripcionOperacion: string;
  desglose: LineaDesglose[];
  cuotaTotal: number;
  importeTotal: number;
  /** null = es el primer registro de la cadena de este emisor+sistema. */
  encadenamiento: EncadenamientoAnterior | null;
  sistemaInformatico: SistemaInformatico;
  /** ISO-8601 con huso, p. ej. 2026-09-05T10:20:30+02:00 */
  fechaHoraHusoGenRegistro: string;
  /** La huella YA calculada y persistida. Nunca se recalcula para reenviar. */
  huella: string;
}

function xmlDesglose(lineas: LineaDesglose[]): string {
  const detalles = lineas.map(l => {
    const partes: string[] = [];
    if (l.impuesto) partes.push(tag('Impuesto', l.impuesto));
    // El esquema los ofrece como alternativas: una operación está calificada o
    // está exenta, no las dos cosas.
    if (l.operacionExenta) partes.push(tag('OperacionExenta', l.operacionExenta));
    else if (l.calificacionOperacion) partes.push(tag('CalificacionOperacion', l.calificacionOperacion));
    if (l.tipoImpositivo !== undefined) partes.push(tag('TipoImpositivo', importeXml(l.tipoImpositivo)));
    partes.push(tag('BaseImponibleOimporteNoSujeto', importeXml(l.baseImponible)));
    if (l.cuotaRepercutida !== undefined) partes.push(tag('CuotaRepercutida', importeXml(l.cuotaRepercutida)));
    return `<sf:DetalleDesglose>${partes.join('')}</sf:DetalleDesglose>`;
  });
  return `<sf:Desglose>${detalles.join('')}</sf:Desglose>`;
}

function xmlSistema(s: SistemaInformatico): string {
  const si = (b: boolean) => (b ? 'S' : 'N');
  return (
    '<sf:SistemaInformatico>' +
    tag('NombreRazon', s.nombreRazon) +
    tag('NIF', s.nif) +
    tag('NombreSistemaInformatico', s.nombreSistemaInformatico) +
    tag('IdSistemaInformatico', s.idSistemaInformatico) +
    tag('Version', s.version) +
    tag('NumeroInstalacion', s.numeroInstalacion) +
    tag('TipoUsoPosibleSoloVerifactu', si(s.soloVerifactu)) +
    tag('TipoUsoPosibleMultiOT', si(s.multiOT)) +
    tag('IndicadorMultiplesOT', si(s.indicadorMultiplesOT)) +
    '</sf:SistemaInformatico>'
  );
}

/**
 * Un `RegistroAlta` completo, en el orden EXACTO de la secuencia del XSD.
 *
 * Si añades un campo, mira dónde cae en `RegistroFacturacionAltaType` — no lo
 * pongas donde quede bonito.
 */
export function xmlRegistroAlta(r: RegistroAltaXml): string {
  const partes: string[] = [
    tag('IDVersion', ID_VERSION),
    '<sf:IDFactura>' +
      tag('IDEmisorFactura', r.emisor.nif) +
      tag('NumSerieFactura', r.numSerieFactura) +
      tag('FechaExpedicionFactura', r.fechaExpedicionFactura) +
      '</sf:IDFactura>',
    tag('NombreRazonEmisor', r.emisor.nombreRazon),
    tag('TipoFactura', r.tipoFactura),
  ];

  if (r.tipoRectificativa) partes.push(tag('TipoRectificativa', r.tipoRectificativa));

  partes.push(tag('DescripcionOperacion', r.descripcionOperacion));
  partes.push(xmlDesglose(r.desglose));
  partes.push(tag('CuotaTotal', importeXml(r.cuotaTotal)));
  partes.push(tag('ImporteTotal', importeXml(r.importeTotal)));

  partes.push(
    '<sf:Encadenamiento>' +
      (r.encadenamiento === null
        ? '<sf:PrimerRegistro>S</sf:PrimerRegistro>'
        : '<sf:RegistroAnterior>' +
          tag('IDEmisorFactura', r.encadenamiento.idEmisorFactura) +
          tag('NumSerieFactura', r.encadenamiento.numSerieFactura) +
          tag('FechaExpedicionFactura', r.encadenamiento.fechaExpedicionFactura) +
          tag('Huella', r.encadenamiento.huella) +
          '</sf:RegistroAnterior>') +
      '</sf:Encadenamiento>',
  );

  partes.push(xmlSistema(r.sistemaInformatico));
  partes.push(tag('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro));
  partes.push(tag('TipoHuella', TIPO_HUELLA_SHA256));
  partes.push(tag('Huella', r.huella));

  return `<sf:RegistroAlta>${partes.join('')}</sf:RegistroAlta>`;
}

export interface SobreRegFactu {
  /** Quién está obligado a expedir: el ESTUDIO, siempre. */
  obligado: EmisorVerifactu;
  /**
   * Solo si los registros los genera un representante/asesor del obligado.
   * Con certificado propio del estudio va vacío; con certificado de Tentare
   * como colaborador social, aquí va Tentare.
   */
  representante?: EmisorVerifactu;
  /** Ya construidos con `xmlRegistroAlta`. Máximo 1000 (tope del XSD). */
  registros: string[];
}

/** El sobre SOAP completo, listo para enviar. */
export function sobreSoapRegFactu(s: SobreRegFactu): string {
  const persona = (p: EmisorVerifactu, nombre: string) =>
    `<sf:${nombre}>${tag('NombreRazon', p.nombreRazon)}${tag('NIF', p.nif)}</sf:${nombre}>`;

  const cabecera =
    '<sf:Cabecera>' +
    persona(s.obligado, 'ObligadoEmision') +
    (s.representante ? persona(s.representante, 'Representante') : '') +
    '</sf:Cabecera>';

  const registros = s.registros
    .map(r => `<sfLR:RegistroFactura>${r}</sfLR:RegistroFactura>`)
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SI}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    '<sfLR:RegFactuSistemaFacturacion>' +
    cabecera +
    registros +
    '</sfLR:RegFactuSistemaFacturacion>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>'
  );
}
