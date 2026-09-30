// Veri*Factu — el XML que se le manda a la AEAT.
//
// ⚠️ EL ORDEN DE LOS ELEMENTOS NO ES ESTÉTICO. `RegistroFacturacionAltaType` es
// una `<sequence>` en el XSD oficial, así que un campo fuera de sitio es un XML
// inválido y la AEAT lo rechaza entero. El orden de abajo está copiado del
// esquema real (SuministroInformacion.xsd, descargado de agenciatributaria.gob.es),
// no de la documentación ni de memoria. Una copia sin tocar de los XSD vive en
// `lib/verifactu/xsd/` y `xml-xsd.test.ts` valida contra ellos lo que sale de aquí.
//
// Se construye a mano, sin librería de XML, por lo mismo que el resto del repo
// evita dependencias en el camino del dinero: son ~15 campos con un orden fijo
// y un escapado que hay que controlar al detalle. Lo que sí se hace es escapar
// SIEMPRE, incluso lo que "no puede" traer caracteres raros: el nombre de un
// estudio con «&» ya existe en producción.
//
// ⚠️ EL XSD NO ES TODA LA VERDAD. La AEAT valida además reglas de negocio que el
// esquema no expresa (documento «Validaciones», v1.2.2). `validarRegistroAlta`
// recoge las que tocan a Tentare —p. ej. `ClaveRegimen` obligatoria con IVA
// (error 1245) o `Destinatarios` obligatorio en F1/R1-R4 (error 1189)—, y los
// constructores se niegan a producir un registro que las incumpla: un registro
// que sale mal no se arregla reenviándolo, se arregla con otro registro.

/** El fichero vive en `tikeV1.0/` pero su targetNamespace apunta a `tike/`.
 *  Copiar la ruta del fichero como namespace es un error silencioso. */
export const NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const NS_SI = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
export const NS_CONSULTA = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/ConsultaLR.xsd';
export const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';

/** Única versión admitida hoy por el esquema (`VersionType` = 1.0). */
export const ID_VERSION = '1.0';

/** SHA-256. Es el único valor que usa Tentare y el que fija el motor de huella. */
export const TIPO_HUELLA_SHA256 = '01';

/**
 * Clave de régimen del IVA para las operaciones de Tentare: `01`, «Operación de
 * régimen general» (lista L8A). Un estudio de Pilates factura en régimen general;
 * si algún día hubiera otro caso (criterio de caja = 07, recargo de
 * equivalencia = 18…), se decide por factura, no se cambia aquí.
 */
export const CLAVE_REGIMEN_GENERAL = '01';

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

/** Destinatario identificado con NIF español (`PersonaFisicaJuridicaType`). */
export type DestinatarioVerifactu = EmisorVerifactu;

/** El identificador de una factura para la AEAT: emisor + número + fecha. */
export interface IdFacturaXml {
  idEmisorFactura: string;
  numSerieFactura: string;
  /** dd-mm-yyyy */
  fechaExpedicionFactura: string;
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
  /** '01' IVA, '02' IPSI, '03' IGIC, '05' otros. Sin él, la AEAT asume IVA. */
  impuesto?: string;
  /**
   * Clave de régimen (lista L8A). OBLIGATORIA si el impuesto es IVA/IPSI/IGIC o
   * no se informa (error 1245). Tentare usa `CLAVE_REGIMEN_GENERAL`.
   */
  claveRegimen?: string;
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
  /**
   * Alta de subsanación (`Subsanacion=S`). Ver `lib/verifactu/subsanacion.ts`
   * para la combinación con `rechazoPrevio` que corresponde a cada caso.
   */
  subsanacion?: boolean;
  /** 'N' (o ausente), 'S' o 'X' — cuadro de operativas de alta de la AEAT. */
  rechazoPrevio?: 'N' | 'S' | 'X';
  /** F1, F2, R1…R5 */
  tipoFactura: string;
  /** Solo en rectificativas: 'S' (sustitución) o 'I' (diferencias). */
  tipoRectificativa?: string;
  /** Solo en rectificativas: qué factura(s) rectifica. Opcional para la AEAT. */
  facturasRectificadas?: IdFacturaXml[];
  /**
   * Obligatorio si `tipoRectificativa = 'S'` y prohibido en otro caso
   * (Validaciones §6). Base y cuota de la(s) factura(s) sustituida(s).
   */
  importeRectificacion?: { baseRectificada: number; cuotaRectificada: number };
  descripcionOperacion: string;
  /** Obligatorio en F1, F3, R1-R4; prohibido en F2 y R5 (error 1189). */
  destinatarios?: DestinatarioVerifactu[];
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

export interface RegistroAnulacionXml {
  /** La factura que se anula (su identificador ante la AEAT). */
  facturaAnulada: IdFacturaXml;
  /** `SinRegistroPrevio=S`: la factura nunca llegó a la AEAT. */
  sinRegistroPrevio?: boolean;
  /** `RechazoPrevio=S`: una anulación anterior de esta factura fue rechazada. */
  rechazoPrevio?: boolean;
  encadenamiento: EncadenamientoAnterior | null;
  sistemaInformatico: SistemaInformatico;
  fechaHoraHusoGenRegistro: string;
  huella: string;
}

// ── Reglas que el XSD no expresa ─────────────────────────────────────────────

const TIPOS_FACTURA = new Set(['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5']);
const TIPOS_CON_DESTINATARIO = new Set(['F1', 'F3', 'R1', 'R2', 'R3', 'R4']);
const TIPOS_SIN_DESTINATARIO = new Set(['F2', 'R5']);
const TIPOS_RECTIFICATIVA = new Set(['R1', 'R2', 'R3', 'R4', 'R5']);
/** Impuestos para los que la AEAT exige ClaveRegimen (Validaciones §15.6). */
const IMPUESTOS_CON_CLAVE_REGIMEN = new Set(['01', '02', '03']);
const FECHA_AEAT = /^\d{2}-\d{2}-\d{4}$/;
const HUELLA = /^[0-9A-F]{64}$/;

function erroresComunes(
  errores: string[],
  s: SistemaInformatico,
  enc: EncadenamientoAnterior | null,
  ts: string,
  huella: string,
): void {
  if (s.nif.length !== 9) errores.push('SistemaInformatico.NIF debe tener 9 caracteres');
  if (!s.nombreRazon.trim() || s.nombreRazon.length > 120) errores.push('SistemaInformatico.NombreRazon vacío o > 120');
  if (!/^[A-Za-z0-9]{2}$/.test(s.idSistemaInformatico)) errores.push('IdSistemaInformatico debe tener 2 caracteres alfanuméricos');
  if (!s.numeroInstalacion || s.numeroInstalacion.length > 100) errores.push('NumeroInstalacion vacío o > 100');
  if (!s.version || s.version.length > 50) errores.push('Version vacía o > 50');
  if (s.nombreSistemaInformatico.length > 30) errores.push('NombreSistemaInformatico > 30');
  if (enc) {
    if (enc.idEmisorFactura.length !== 9) errores.push('RegistroAnterior.IDEmisorFactura debe tener 9 caracteres');
    if (!FECHA_AEAT.test(enc.fechaExpedicionFactura)) errores.push('RegistroAnterior.FechaExpedicionFactura no es dd-mm-aaaa');
    if (!HUELLA.test(enc.huella)) errores.push('RegistroAnterior.Huella no es SHA-256 en hex mayúsculas');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(ts)) errores.push('FechaHoraHusoGenRegistro sin huso ISO-8601');
  if (!HUELLA.test(huella)) errores.push('Huella no es SHA-256 en hex mayúsculas');
}

/**
 * Las reglas de la AEAT que puede incumplir un registro de Tentare, en local y
 * antes de enviarlo. Devuelve la lista de problemas (vacía = válido). Cada una
 * lleva el código de error de la AEAT al que evita llegar cuando lo hay.
 */
export function validarRegistroAlta(r: RegistroAltaXml): string[] {
  const errores: string[] = [];
  const tipo = r.tipoFactura;
  if (!TIPOS_FACTURA.has(tipo)) errores.push(`TipoFactura desconocido: ${tipo}`);
  if (r.emisor.nif.length !== 9) errores.push('IDEmisorFactura debe tener 9 caracteres');
  if (!r.emisor.nombreRazon.trim() || r.emisor.nombreRazon.length > 120) errores.push('NombreRazonEmisor vacío o > 120');
  if (!r.numSerieFactura || r.numSerieFactura.length > 60) errores.push('NumSerieFactura vacío o > 60');
  if (!FECHA_AEAT.test(r.fechaExpedicionFactura)) errores.push('FechaExpedicionFactura no es dd-mm-aaaa');
  if (!r.descripcionOperacion.trim() || r.descripcionOperacion.length > 500) errores.push('DescripcionOperacion vacía o > 500');

  // Subsanación (Validaciones §2 «RechazoPrevio»).
  if (r.rechazoPrevio === 'X' && !r.subsanacion) errores.push('RechazoPrevio=X exige Subsanacion=S');
  if (r.rechazoPrevio === 'S' && !r.subsanacion) errores.push('RechazoPrevio=S exige Subsanacion=S');

  // Rectificativas (Validaciones §3, §4 y §6).
  const esRect = TIPOS_RECTIFICATIVA.has(tipo);
  if (esRect && !r.tipoRectificativa) errores.push(`${tipo} exige TipoRectificativa`);
  if (!esRect && r.tipoRectificativa) errores.push(`TipoRectificativa solo en R1-R5, no en ${tipo}`);
  if (r.tipoRectificativa && r.tipoRectificativa !== 'S' && r.tipoRectificativa !== 'I') errores.push('TipoRectificativa debe ser S o I');
  if (!esRect && r.facturasRectificadas?.length) errores.push('FacturasRectificadas solo en R1-R5');
  if (r.tipoRectificativa === 'S' && !r.importeRectificacion) errores.push('TipoRectificativa=S exige ImporteRectificacion');
  if (r.tipoRectificativa !== 'S' && r.importeRectificacion) errores.push('ImporteRectificacion solo con TipoRectificativa=S');
  for (const f of r.facturasRectificadas ?? []) {
    if (f.idEmisorFactura.length !== 9 || !FECHA_AEAT.test(f.fechaExpedicionFactura)) errores.push('FacturasRectificadas con identificador inválido');
  }

  // Destinatarios (error 1189 y su contrario).
  const nDest = r.destinatarios?.length ?? 0;
  if (TIPOS_CON_DESTINATARIO.has(tipo) && nDest === 0) errores.push(`${tipo} exige Destinatarios (AEAT 1189)`);
  if (TIPOS_SIN_DESTINATARIO.has(tipo) && nDest > 0) errores.push(`${tipo} no admite Destinatarios`);
  for (const d of r.destinatarios ?? []) {
    if (d.nif.length !== 9) errores.push('Destinatario con NIF que no tiene 9 caracteres');
    if (!d.nombreRazon.trim() || d.nombreRazon.length > 120) errores.push('Destinatario sin NombreRazon o > 120');
  }

  // Desglose (Validaciones §15.6: ClaveRegimen; XSD: 1..12 y la elección).
  if (r.desglose.length < 1 || r.desglose.length > 12) errores.push('Desglose debe tener entre 1 y 12 líneas');
  for (const l of r.desglose) {
    const impuesto = l.impuesto ?? '01';
    if (IMPUESTOS_CON_CLAVE_REGIMEN.has(impuesto) && !l.claveRegimen) errores.push('ClaveRegimen obligatoria con IVA/IPSI/IGIC (AEAT 1245)');
    if (!IMPUESTOS_CON_CLAVE_REGIMEN.has(impuesto) && l.claveRegimen) errores.push('ClaveRegimen solo con IVA/IPSI/IGIC (AEAT 1260)');
    if (!!l.calificacionOperacion === !!l.operacionExenta) errores.push('Cada línea lleva CalificacionOperacion O OperacionExenta, una sola');
  }

  erroresComunes(errores, r.sistemaInformatico, r.encadenamiento, r.fechaHoraHusoGenRegistro, r.huella);
  return errores;
}

export function validarRegistroAnulacion(r: RegistroAnulacionXml): string[] {
  const errores: string[] = [];
  const f = r.facturaAnulada;
  if (f.idEmisorFactura.length !== 9) errores.push('IDEmisorFacturaAnulada debe tener 9 caracteres');
  if (!f.numSerieFactura || f.numSerieFactura.length > 60) errores.push('NumSerieFacturaAnulada vacío o > 60');
  if (!FECHA_AEAT.test(f.fechaExpedicionFactura)) errores.push('FechaExpedicionFacturaAnulada no es dd-mm-aaaa');
  erroresComunes(errores, r.sistemaInformatico, r.encadenamiento, r.fechaHoraHusoGenRegistro, r.huella);
  return errores;
}

/** Un registro que no pasa las reglas locales. No se envía: se subsana. */
export class RegistroInvalidoError extends Error {
  readonly errores: string[];
  constructor(errores: string[]) {
    super(`Registro Veri*Factu inválido: ${errores.join('; ')}`);
    this.name = 'RegistroInvalidoError';
    this.errores = errores;
  }
}

// ── Construcción ─────────────────────────────────────────────────────────────

function xmlDesglose(lineas: LineaDesglose[]): string {
  const detalles = lineas.map(l => {
    const partes: string[] = [];
    // Orden de `DetalleType`: Impuesto, ClaveRegimen, (Calificacion|Exenta),
    // TipoImpositivo, BaseImponibleOimporteNoSujeto, …, CuotaRepercutida.
    if (l.impuesto) partes.push(tag('Impuesto', l.impuesto));
    if (l.claveRegimen) partes.push(tag('ClaveRegimen', l.claveRegimen));
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

function xmlEncadenamiento(enc: EncadenamientoAnterior | null): string {
  return (
    '<sf:Encadenamiento>' +
    (enc === null
      ? '<sf:PrimerRegistro>S</sf:PrimerRegistro>'
      : '<sf:RegistroAnterior>' +
        tag('IDEmisorFactura', enc.idEmisorFactura) +
        tag('NumSerieFactura', enc.numSerieFactura) +
        tag('FechaExpedicionFactura', enc.fechaExpedicionFactura) +
        tag('Huella', enc.huella) +
        '</sf:RegistroAnterior>') +
    '</sf:Encadenamiento>'
  );
}

function xmlIdFactura(nombre: string, f: IdFacturaXml): string {
  return (
    `<sf:${nombre}>` +
    tag('IDEmisorFactura', f.idEmisorFactura) +
    tag('NumSerieFactura', f.numSerieFactura) +
    tag('FechaExpedicionFactura', f.fechaExpedicionFactura) +
    `</sf:${nombre}>`
  );
}

/**
 * Un `RegistroAlta` completo, en el orden EXACTO de la secuencia del XSD.
 * Lanza `RegistroInvalidoError` si incumple las reglas de `validarRegistroAlta`.
 *
 * Si añades un campo, mira dónde cae en `RegistroFacturacionAltaType` — no lo
 * pongas donde quede bonito.
 */
export function xmlRegistroAlta(r: RegistroAltaXml): string {
  const errores = validarRegistroAlta(r);
  if (errores.length > 0) throw new RegistroInvalidoError(errores);

  const partes: string[] = [
    tag('IDVersion', ID_VERSION),
    xmlIdFactura('IDFactura', {
      idEmisorFactura: r.emisor.nif,
      numSerieFactura: r.numSerieFactura,
      fechaExpedicionFactura: r.fechaExpedicionFactura,
    }),
    tag('NombreRazonEmisor', r.emisor.nombreRazon),
  ];
  if (r.subsanacion) partes.push(tag('Subsanacion', 'S'));
  if (r.rechazoPrevio && r.rechazoPrevio !== 'N') partes.push(tag('RechazoPrevio', r.rechazoPrevio));
  partes.push(tag('TipoFactura', r.tipoFactura));
  if (r.tipoRectificativa) partes.push(tag('TipoRectificativa', r.tipoRectificativa));
  if (r.facturasRectificadas?.length) {
    partes.push(
      '<sf:FacturasRectificadas>' +
        r.facturasRectificadas.map(f => xmlIdFactura('IDFacturaRectificada', f)).join('') +
        '</sf:FacturasRectificadas>',
    );
  }
  if (r.importeRectificacion) {
    partes.push(
      '<sf:ImporteRectificacion>' +
        tag('BaseRectificada', importeXml(r.importeRectificacion.baseRectificada)) +
        tag('CuotaRectificada', importeXml(r.importeRectificacion.cuotaRectificada)) +
        '</sf:ImporteRectificacion>',
    );
  }
  partes.push(tag('DescripcionOperacion', r.descripcionOperacion));
  if (r.destinatarios?.length) {
    partes.push(
      '<sf:Destinatarios>' +
        r.destinatarios.map(d => `<sf:IDDestinatario>${tag('NombreRazon', d.nombreRazon)}${tag('NIF', d.nif)}</sf:IDDestinatario>`).join('') +
        '</sf:Destinatarios>',
    );
  }
  partes.push(xmlDesglose(r.desglose));
  partes.push(tag('CuotaTotal', importeXml(r.cuotaTotal)));
  partes.push(tag('ImporteTotal', importeXml(r.importeTotal)));
  partes.push(xmlEncadenamiento(r.encadenamiento));
  partes.push(xmlSistema(r.sistemaInformatico));
  partes.push(tag('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro));
  partes.push(tag('TipoHuella', TIPO_HUELLA_SHA256));
  partes.push(tag('Huella', r.huella));

  return `<sf:RegistroAlta>${partes.join('')}</sf:RegistroAlta>`;
}

/**
 * Un `RegistroAnulacion` completo, en el orden de `RegistroFacturacionAnulacionType`.
 * Lanza `RegistroInvalidoError` si no pasa `validarRegistroAnulacion`.
 */
export function xmlRegistroAnulacion(r: RegistroAnulacionXml): string {
  const errores = validarRegistroAnulacion(r);
  if (errores.length > 0) throw new RegistroInvalidoError(errores);

  const f = r.facturaAnulada;
  const partes: string[] = [
    tag('IDVersion', ID_VERSION),
    '<sf:IDFactura>' +
      tag('IDEmisorFacturaAnulada', f.idEmisorFactura) +
      tag('NumSerieFacturaAnulada', f.numSerieFactura) +
      tag('FechaExpedicionFacturaAnulada', f.fechaExpedicionFactura) +
      '</sf:IDFactura>',
  ];
  if (r.sinRegistroPrevio) partes.push(tag('SinRegistroPrevio', 'S'));
  if (r.rechazoPrevio) partes.push(tag('RechazoPrevio', 'S'));
  partes.push(xmlEncadenamiento(r.encadenamiento));
  partes.push(xmlSistema(r.sistemaInformatico));
  partes.push(tag('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro));
  partes.push(tag('TipoHuella', TIPO_HUELLA_SHA256));
  partes.push(tag('Huella', r.huella));
  return `<sf:RegistroAnulacion>${partes.join('')}</sf:RegistroAnulacion>`;
}

// ── Sobres SOAP ──────────────────────────────────────────────────────────────

export interface SobreRegFactu {
  /** Quién está obligado a expedir: el ESTUDIO, siempre. */
  obligado: EmisorVerifactu;
  /**
   * Solo para la colaboración social «transitiva» (obligado → asesor →
   * plataforma), que es para lo que la AEAT lo añadió (Descripción del servicio
   * web, v0.4.0). Con apoderamiento directo —la vía de Tentare— va vacío: quien
   * remite queda identificado por su certificado.
   */
  representante?: EmisorVerifactu;
  /** Ya construidos con `xmlRegistroAlta`/`xmlRegistroAnulacion`. Máximo 1000. */
  registros: string[];
}

/**
 * El sobre SOAP completo, listo para enviar.
 *
 * ⚠️ `Cabecera` y `RegistroFactura` son elementos LOCALES de `SuministroLR.xsd`
 * (elementFormDefault="qualified"), así que van en el espacio de nombres de
 * SuministroLR (`sfLR:`), no en el de SuministroInformacion (`sf:`). Hasta
 * sep-2026 la cabecera salía como `sf:Cabecera`: un XML que el esquema rechaza
 * entero. El ejemplo oficial usa `sum:Cabecera` con `sum` = SuministroLR.
 */
export function sobreSoapRegFactu(s: SobreRegFactu): string {
  const persona = (p: EmisorVerifactu, nombre: string) =>
    `<sf:${nombre}>${tag('NombreRazon', p.nombreRazon)}${tag('NIF', p.nif)}</sf:${nombre}>`;

  const cabecera =
    '<sfLR:Cabecera>' +
    persona(s.obligado, 'ObligadoEmision') +
    (s.representante ? persona(s.representante, 'Representante') : '') +
    '</sfLR:Cabecera>';

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

export interface ConsultaRegistro {
  obligado: EmisorVerifactu;
  /** Año (AAAA) de la fecha de expedición de la factura buscada. */
  ejercicio: string;
  /** Mes (01-12) de la fecha de expedición. */
  periodo: string;
  /** Si se informa, la consulta se acota a esa factura. */
  numSerieFactura?: string;
}

/** Ejercicio y periodo de imputación a partir de una fecha dd-mm-aaaa. */
export function periodoDeFecha(fechaAeat: string): { ejercicio: string; periodo: string } {
  const [, mm, aaaa] = fechaAeat.split('-');
  return { ejercicio: aaaa, periodo: mm };
}

/**
 * Sobre de `ConsultaFactuSistemaFacturacion` (solo remisión voluntaria). Sirve
 * para averiguar si la AEAT tiene ya un registro cuando no se sabe si llegó
 * (estado INCIERTO), en vez de reenviarlo a ciegas.
 *
 * Mismo criterio de espacios de nombres que el alta: `Cabecera`, `FiltroConsulta`,
 * `PeriodoImputacion` y `NumSerieFactura` son locales de ConsultaLR.xsd; lo que
 * hay dentro es de SuministroInformacion (ejemplo oficial, Descripción SWeb §9).
 */
export function sobreSoapConsulta(c: ConsultaRegistro): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:con="${NS_CONSULTA}" xmlns:sf="${NS_SI}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    '<con:ConsultaFactuSistemaFacturacion>' +
    '<con:Cabecera>' +
    tag('IDVersion', ID_VERSION) +
    `<sf:ObligadoEmision>${tag('NombreRazon', c.obligado.nombreRazon)}${tag('NIF', c.obligado.nif)}</sf:ObligadoEmision>` +
    '</con:Cabecera>' +
    '<con:FiltroConsulta>' +
    `<con:PeriodoImputacion>${tag('Ejercicio', c.ejercicio)}${tag('Periodo', c.periodo)}</con:PeriodoImputacion>` +
    (c.numSerieFactura ? `<con:NumSerieFactura>${escaparXml(c.numSerieFactura)}</con:NumSerieFactura>` : '') +
    '</con:FiltroConsulta>' +
    '</con:ConsultaFactuSistemaFacturacion>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>'
  );
}
