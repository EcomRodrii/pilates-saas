// Veri*Factu — leer lo que contesta la AEAT.
//
// ⚠️ LA RESPUESTA NO ES UN CÓDIGO. Hay DOS niveles y confundirlos es dar por
// registrada una factura que la AEAT rechazó:
//   · Estado del ENVÍO: Correcto / ParcialmenteCorrecto / Incorrecto.
//   · Estado de CADA REGISTRO: Correcto / AceptadoConErrores / Incorrecto.
// Un envío de 500 facturas puede volver con 490 aceptadas y 10 rechazadas, y el
// estado global será `ParcialmenteCorrecto`. Hay que guardar el detalle.
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

export type EstadoEnvio = 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
export type EstadoRegistro = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';

export interface RegistroRespondido {
  /** Número de la factura tal y como lo devuelve la AEAT, si viene. */
  numSerieFactura: string | null;
  estado: EstadoRegistro | null;
  codigoError: string | null;
  descripcionError: string | null;
}

export interface RespuestaAeat {
  /** true si la AEAT rechazó el envío ENTERO con un SoapFault. */
  fault: boolean;
  faultMensaje: string | null;
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

function comoEstadoEnvio(v: string | null): EstadoEnvio | null {
  return v === 'Correcto' || v === 'ParcialmenteCorrecto' || v === 'Incorrecto' ? v : null;
}

function comoEstadoRegistro(v: string | null): EstadoRegistro | null {
  return v === 'Correcto' || v === 'AceptadoConErrores' || v === 'Incorrecto' ? v : null;
}

export function parsearRespuestaAeat(xml: string): RespuestaAeat {
  const base: RespuestaAeat = {
    fault: false, faultMensaje: null, estadoEnvio: null,
    csv: null, tiempoEsperaSegundos: null, registros: [],
  };

  // Un Fault no trae ni CSV ni registros: el envío no ha existido para la AEAT.
  if (/<(?:\w+:)?Fault\b/i.test(xml)) {
    return {
      ...base,
      fault: true,
      faultMensaje: sacar(xml, 'faultstring') ?? sacar(xml, 'Reason') ?? 'La AEAT rechazó el envío completo',
    };
  }

  const espera = sacar(xml, 'TiempoEsperaEnvio');
  const registros = sacarTodos(xml, 'RespuestaLinea').map(linea => ({
    numSerieFactura: sacar(linea, 'NumSerieFactura'),
    estado: comoEstadoRegistro(sacar(linea, 'EstadoRegistro')),
    codigoError: sacar(linea, 'CodigoErrorRegistro'),
    descripcionError: sacar(linea, 'DescripcionErrorRegistro'),
  }));

  return {
    ...base,
    estadoEnvio: comoEstadoEnvio(sacar(xml, 'EstadoEnvio')),
    csv: sacar(xml, 'CSV'),
    tiempoEsperaSegundos: espera === null ? null : Number(espera) || null,
    registros,
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
