// Veri*Factu — leer lo que contesta la AEAT.
//
// ⚠️ LA RESPUESTA NO ES UN CÓDIGO. Hay DOS niveles y confundirlos es dar por
// registrada una factura que la AEAT rechazó:
//   · Estado del ENVÍO: Correcto / ParcialmenteCorrecto / Incorrecto.
//   · Estado de CADA REGISTRO: Correcto / AceptadoConErrores / Incorrecto.
// Un envío de 500 facturas puede volver con 490 aceptadas y 10 rechazadas, y el
// estado global será `ParcialmenteCorrecto`. Hay que guardar el detalle.
//
// ⚠️ UN «Incorrecto» NO SIEMPRE ES UN RECHAZO. Con el código 3000 («Registro de
// facturación duplicado») la AEAT dice que YA TIENE ese registro, y trae un
// bloque `RegistroDuplicado` con el estado del que guarda (Correcta /
// AceptadaConErrores / Anulada). Es justo lo que pasa si reenviamos algo que sí
// llegó (timeout, caída entre su «OK» y nuestro UPDATE). Leerlo como rechazo
// congelaba en falso la cadena del estudio. Ver `estado.ts`.
//
// ⚠️ EL CSV NO SE PUEDE RECUPERAR DESPUÉS. La AEAT lo dice literalmente: si no
// se persiste en el momento, se pierde para siempre. Por eso esta función lo
// extrae siempre que venga, aunque el envío haya ido regular.
//
// Un error de cabecera (NIF no identificado, certificado no autorizado…) no
// llega como respuesta normal: llega como SoapFault y tumba el envío entero.
//
// Se parsea con expresiones regulares y no con un parser de XML por lo mismo
// que el XML se construye a mano: es un puñado de campos de forma conocida y
// una dependencia nueva en el camino fiscal no compensa. Se toleran prefijos de
// espacio de nombres arbitrarios porque la AEAT no garantiza cuáles usa.
// La forma está sacada de RespuestaSuministro.xsd y RespuestaConsultaLR.xsd
// (copias en ./xsd/).

export type EstadoEnvio = 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
export type EstadoRegistro = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';
/** `EstadoRegistroSFType`: el estado del registro que la AEAT YA tenía. */
export type EstadoRegistroDuplicado = 'Correcta' | 'AceptadaConErrores' | 'Anulada';
export type TipoOperacion = 'Alta' | 'Anulacion';

/** Código de error de la AEAT para «Registro de facturación duplicado». */
export const CODIGO_DUPLICADO = '3000';

export interface RegistroDuplicadoInfo {
  idPeticion: string | null;
  estado: EstadoRegistroDuplicado | null;
  codigoError: string | null;
  descripcionError: string | null;
}

export interface RegistroRespondido {
  /** Número de la factura tal y como lo devuelve la AEAT, si viene. */
  numSerieFactura: string | null;
  /** dd-mm-aaaa, si viene. */
  fechaExpedicionFactura: string | null;
  /** Alta o Anulacion (`Operacion/TipoOperacion`). null si no viene. */
  operacion: TipoOperacion | null;
  estado: EstadoRegistro | null;
  codigoError: string | null;
  descripcionError: string | null;
  /** Solo si la AEAT lo rechazó por duplicado (3000). */
  duplicado: RegistroDuplicadoInfo | null;
}

export interface RespuestaAeat {
  /** true si la AEAT rechazó el envío ENTERO con un SoapFault. */
  fault: boolean;
  faultMensaje: string | null;
  /** Código numérico del fault (p. ej. '4112'), si se puede leer del texto. */
  faultCodigo: string | null;
  estadoEnvio: EstadoEnvio | null;
  /** Código Seguro de Verificación de la remisión. IRRECUPERABLE después. */
  csv: string | null;
  /** Segundos que hay que esperar antes del siguiente envío. */
  tiempoEsperaSegundos: number | null;
  registros: RegistroRespondido[];
}

/** Captura el contenido de una etiqueta ignorando el prefijo de namespace. */
function sacar(xml: string, etiqueta: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${etiqueta}>`, 'i').exec(xml);
  return m ? m[1].trim() : null;
}

function sacarTodos(xml: string, etiqueta: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${etiqueta}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function quitar(xml: string, etiqueta: string): string {
  return xml.replace(new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*>[\\s\\S]*?</(?:\\w+:)?${etiqueta}>`, 'gi'), '');
}

function comoEstadoEnvio(v: string | null): EstadoEnvio | null {
  return v === 'Correcto' || v === 'ParcialmenteCorrecto' || v === 'Incorrecto' ? v : null;
}

function comoEstadoRegistro(v: string | null): EstadoRegistro | null {
  return v === 'Correcto' || v === 'AceptadoConErrores' || v === 'Incorrecto' ? v : null;
}

function comoEstadoDuplicado(v: string | null): EstadoRegistroDuplicado | null {
  return v === 'Correcta' || v === 'AceptadaConErrores' || v === 'Anulada' ? v : null;
}

function comoOperacion(v: string | null): TipoOperacion | null {
  return v === 'Alta' || v === 'Anulacion' ? v : null;
}

/**
 * El código numérico de un SoapFault de la AEAT, si el texto lo trae.
 *
 * ⚠️ El formato exacto del `faultstring` de VERI*FACTU NO está documentado. Se
 * aceptan las formas razonables («Codigo[4112].…», «4112: …», «… 4112 …»
 * dentro del rango 4100-4199 de rechazos de envío) y, si ninguna encaja, se
 * devuelve null: mejor «no sé qué código es» que inventar uno.
 */
export function codigoDeFault(mensaje: string | null): string | null {
  if (!mensaje) return null;
  const corchete = /Codigo\s*\[\s*(\d{3,5})\s*\]/i.exec(mensaje);
  if (corchete) return corchete[1];
  const inicio = /^\s*(\d{3,5})\b/.exec(mensaje);
  if (inicio) return inicio[1];
  const rango = /\b(41\d{2})\b/.exec(mensaje);
  return rango ? rango[1] : null;
}

export function parsearRespuestaAeat(xml: string): RespuestaAeat {
  const base: RespuestaAeat = {
    fault: false, faultMensaje: null, faultCodigo: null, estadoEnvio: null,
    csv: null, tiempoEsperaSegundos: null, registros: [],
  };

  // Un Fault no trae ni CSV ni registros: el envío no ha existido para la AEAT.
  if (/<(?:\w+:)?Fault\b/i.test(xml)) {
    const mensaje = sacar(xml, 'faultstring') ?? sacar(xml, 'Reason') ?? 'La AEAT rechazó el envío completo';
    return { ...base, fault: true, faultMensaje: mensaje, faultCodigo: codigoDeFault(mensaje) };
  }

  const espera = sacar(xml, 'TiempoEsperaEnvio');
  const registros = sacarTodos(xml, 'RespuestaLinea').map(parsearLinea);

  return {
    ...base,
    estadoEnvio: comoEstadoEnvio(sacar(xml, 'EstadoEnvio')),
    csv: sacar(xml, 'CSV'),
    tiempoEsperaSegundos: espera === null ? null : Number(espera) || null,
    registros,
  };
}

function parsearLinea(linea: string): RegistroRespondido {
  const bloqueDuplicado = sacar(linea, 'RegistroDuplicado');
  // Lo de la línea se lee SIN el bloque del duplicado: ese bloque trae su propio
  // CodigoErrorRegistro/DescripcionErrorRegistro (los del registro que ya estaba).
  const propia = quitar(linea, 'RegistroDuplicado');
  const operacion = sacar(propia, 'Operacion');
  return {
    numSerieFactura: sacar(propia, 'NumSerieFactura'),
    fechaExpedicionFactura: sacar(propia, 'FechaExpedicionFactura'),
    operacion: comoOperacion(operacion === null ? null : (sacar(operacion, 'TipoOperacion') ?? null)),
    estado: comoEstadoRegistro(sacar(propia, 'EstadoRegistro')),
    codigoError: sacar(propia, 'CodigoErrorRegistro'),
    descripcionError: sacar(propia, 'DescripcionErrorRegistro'),
    duplicado: bloqueDuplicado === null ? null : {
      idPeticion: sacar(bloqueDuplicado, 'IdPeticionRegistroDuplicado'),
      estado: comoEstadoDuplicado(sacar(bloqueDuplicado, 'EstadoRegistroDuplicado')),
      codigoError: sacar(bloqueDuplicado, 'CodigoErrorRegistro'),
      descripcionError: sacar(bloqueDuplicado, 'DescripcionErrorRegistro'),
    },
  };
}

/**
 * ¿Se puede dar por bueno lo enviado de esta factura?
 *
 * «AceptadoConErrores» CUENTA COMO REGISTRADA: la AEAT la ha admitido y le ha
 * puesto una marca (códigos 2000-2008, p. ej. huella incorrecta o primer
 * registro cuando ya había otros). Tratarla como fallo llevaría a reenviarla, y
 * reenviar un registro ya admitido es peor que la marca.
 */
export function registroAceptado(r: RegistroRespondido): boolean {
  return r.estado === 'Correcto' || r.estado === 'AceptadoConErrores';
}

/**
 * ¿Merece la pena reintentar este envío entero?
 *
 * Solo los fallos de transporte y los rechazos de envío por causas pasajeras.
 * Un `Incorrecto` de registro es un problema de datos: reintentarlo tal cual
 * vuelve a fallar igual, y encima consume el control de flujo.
 */
export function convieneReintentarEnvio(r: RespuestaAeat): boolean {
  if (r.fault) return false;
  return r.estadoEnvio === null;
}

// ── Consulta (ConsultaFactuSistemaFacturacion) ───────────────────────────────

/** Estado de un registro que la AEAT tiene, normalizado. */
export type EstadoConsultado = 'Correcto' | 'AceptadoConErrores' | 'Anulado';

export interface RegistroConsultado {
  numSerieFactura: string | null;
  fechaExpedicionFactura: string | null;
  /** La huella del registro que tiene la AEAT (NO la del anterior). */
  huella: string | null;
  estado: EstadoConsultado | null;
}

export interface RespuestaConsulta {
  fault: boolean;
  faultMensaje: string | null;
  faultCodigo: string | null;
  /** 'ConDatos' / 'SinDatos'; null si no se entiende la respuesta. */
  resultado: 'ConDatos' | 'SinDatos' | null;
  registros: RegistroConsultado[];
}

/**
 * El XSD de respuesta dice Correcto/AceptadoConErrores/Anulado y el ejemplo de
 * la propia AEAT enseña «Correcta». Se aceptan los dos géneros: la AEAT no es
 * consistente consigo misma y no vamos a leer mal un estado por una «a».
 */
function comoEstadoConsultado(v: string | null): EstadoConsultado | null {
  if (v === 'Correcto' || v === 'Correcta') return 'Correcto';
  if (v === 'AceptadoConErrores' || v === 'AceptadaConErrores') return 'AceptadoConErrores';
  if (v === 'Anulado' || v === 'Anulada') return 'Anulado';
  return null;
}

export function parsearRespuestaConsulta(xml: string): RespuestaConsulta {
  const base: RespuestaConsulta = { fault: false, faultMensaje: null, faultCodigo: null, resultado: null, registros: [] };
  if (/<(?:\w+:)?Fault\b/i.test(xml)) {
    const mensaje = sacar(xml, 'faultstring') ?? sacar(xml, 'Reason') ?? 'La AEAT rechazó la consulta';
    return { ...base, fault: true, faultMensaje: mensaje, faultCodigo: codigoDeFault(mensaje) };
  }
  const res = sacar(xml, 'ResultadoConsulta');
  const registros = sacarTodos(xml, 'RegistroRespuestaConsultaFactuSistemaFacturacion').map(bloque => {
    const datos = sacar(bloque, 'DatosRegistroFacturacion') ?? '';
    // La huella del registro, no la del `RegistroAnterior` que va dentro del
    // encadenamiento con la misma etiqueta.
    const datosSinCadena = quitar(datos, 'Encadenamiento');
    const idFactura = sacar(bloque, 'IDFactura') ?? '';
    // `EstadoRegistro` va anidado dentro de otro `EstadoRegistro`: se busca el
    // valor de texto, no el bloque.
    const estado = /<(?:\w+:)?EstadoRegistro>\s*(Correct[oa]|Aceptad[oa]ConErrores|Anulad[oa])\s*</.exec(bloque)?.[1] ?? null;
    return {
      numSerieFactura: sacar(idFactura, 'NumSerieFactura'),
      fechaExpedicionFactura: sacar(idFactura, 'FechaExpedicionFactura'),
      huella: sacar(datosSinCadena, 'Huella'),
      estado: comoEstadoConsultado(estado),
    };
  });
  return {
    ...base,
    resultado: res === 'ConDatos' || res === 'SinDatos' ? res : null,
    registros,
  };
}
