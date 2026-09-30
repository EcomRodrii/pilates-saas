// Veri*Factu — la máquina de estados de un registro de facturación.
//
// Lógica pura, sin base de datos ni red. Decide qué significa cada cosa que
// puede pasar al mandar un registro a la AEAT, para que quien toca la base
// (`transmitir.ts`) solo tenga que aplicar el resultado.
//
//   PENDIENTE ─(XML congelado)─▶ LISTO ─(claim atómico)─▶ ENVIANDO ─┬─▶ REGISTRADA
//                                  ▲                               ├─▶ ACEPTADA_CON_ERRORES
//                                  │                               ├─▶ ANULADA_EN_AEAT (3000 + «Anulada»)
//                                  │                               ├─▶ RECHAZADA ─▶ (registro NUEVO de subsanación)
//                                  ├──────── REINTENTAR ◀──────────┤  (no llegó a la AEAT: seguro reenviar)
//                                  └─(consulta: no lo tiene)─ INCIERTO ◀┘ (no sabemos si llegó)
//
// ⚠️ NUNCA «timeout → reenviar». Si no sabemos si la AEAT lo recibió, el
// registro pasa a INCIERTO y solo sale de ahí preguntándole a la AEAT
// (`resolverConsulta`). Reenviar a ciegas daba un 3000 que antes se leía como
// rechazo y congelaba la cadena.
//
// ⚠️ UN REGISTRO RECHAZADO NO SE TOCA. Se queda RECHAZADA para siempre, con su
// XML y su huella. Lo que lo corrige es OTRO registro (alta de subsanación),
// con su propia posición en la cadena — ver `subsanacion.ts`.

import type { RegistroRespondido, RespuestaConsulta, EstadoRegistroDuplicado } from './respuesta.ts';
import { CODIGO_DUPLICADO } from './respuesta.ts';

export type EstadoRegistroVerifactu =
  /** Posición y anterior reservados; la huella aún no se ha calculado. */
  | 'RESERVADO'
  /** Generado y encadenado; el XML todavía no se ha congelado. */
  | 'PENDIENTE'
  /** XML congelado (no se regenera nunca). Espera turno y control de flujo. */
  | 'LISTO'
  /** Reclamado por un envío en curso (`envio_id`). */
  | 'ENVIANDO'
  /** Fallo que la AEAT NO llegó a procesar: se reenvía el MISMO XML más tarde. */
  | 'REINTENTAR'
  /** No sabemos si la AEAT lo tiene. Se consulta antes de hacer nada. */
  | 'INCIERTO'
  | 'REGISTRADA'
  | 'ACEPTADA_CON_ERRORES'
  /** La AEAT dice que ya lo tenía y que está anulado (3000 + «Anulada»). */
  | 'ANULADA_EN_AEAT'
  /** Rechazado (por la AEAT o por la validación local). Se subsana con otro registro. */
  | 'RECHAZADA'
  /** Sellado antes de que existiera la transmisión propia. Fuera de la cola: ver TODO en la migración. */
  | 'HISTORICO';

export const ESTADOS_FINALES: ReadonlySet<EstadoRegistroVerifactu> = new Set([
  'REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT', 'RECHAZADA', 'HISTORICO',
]);

/** Admitidos por la AEAT: ya no se reenvían nunca. */
export const ESTADOS_EN_AEAT: ReadonlySet<EstadoRegistroVerifactu> = new Set([
  'REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT',
]);

/**
 * Transiciones permitidas. Lo que no está aquí es un error de programación:
 * `transitar` lanza en vez de escribir un estado imposible.
 */
const TRANSICIONES: Record<EstadoRegistroVerifactu, readonly EstadoRegistroVerifactu[]> = {
  RESERVADO: ['PENDIENTE'],
  PENDIENTE: ['LISTO', 'RECHAZADA'],
  LISTO: ['ENVIANDO'],
  ENVIANDO: ['REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT', 'RECHAZADA', 'REINTENTAR', 'INCIERTO', 'LISTO'],
  // Un reintento que ya toca se reclama directamente (mismo XML congelado).
  REINTENTAR: ['LISTO', 'ENVIANDO'],
  INCIERTO: ['REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT', 'LISTO'],
  REGISTRADA: [],
  ACEPTADA_CON_ERRORES: [],
  ANULADA_EN_AEAT: [],
  RECHAZADA: [],
  HISTORICO: [],
};

export function transicionPermitida(de: EstadoRegistroVerifactu, a: EstadoRegistroVerifactu): boolean {
  return TRANSICIONES[de].includes(a);
}

export function transitar(de: EstadoRegistroVerifactu, a: EstadoRegistroVerifactu): EstadoRegistroVerifactu {
  if (!transicionPermitida(de, a)) throw new Error(`Transición Veri*Factu no permitida: ${de} → ${a}`);
  return a;
}

// ── Qué dice la AEAT de UN registro ─────────────────────────────────────────

export interface ResultadoRegistro {
  estado: 'REGISTRADA' | 'ACEPTADA_CON_ERRORES' | 'ANULADA_EN_AEAT' | 'RECHAZADA' | 'INCIERTO';
  /** El CSV del envío solo se guarda en lo que la AEAT admitió. */
  guardarCsv: boolean;
  codigoError: string | null;
  descripcionError: string | null;
  /** Solo en duplicados: el estado del registro que la AEAT ya tenía. */
  estadoDuplicado: EstadoRegistroDuplicado | null;
}

/**
 * Traduce la línea de respuesta de un registro.
 *
 * `linea` null = el envío fue aceptado pero no trae línea para este registro:
 * no sabemos qué pasó con él → INCIERTO (se consulta), nunca «registrada».
 */
export function resolverLinea(linea: RegistroRespondido | null): ResultadoRegistro {
  const vacio = { codigoError: null, descripcionError: null, estadoDuplicado: null };
  if (!linea) return { ...vacio, estado: 'INCIERTO', guardarCsv: false };
  if (linea.estado === 'Correcto') return { ...vacio, estado: 'REGISTRADA', guardarCsv: true };
  if (linea.estado === 'AceptadoConErrores') {
    return { ...vacio, estado: 'ACEPTADA_CON_ERRORES', guardarCsv: true, codigoError: linea.codigoError, descripcionError: linea.descripcionError };
  }
  if (linea.estado === 'Incorrecto') {
    // 3000 = la AEAT YA tiene este registro. No es un rechazo de datos.
    if (linea.codigoError === CODIGO_DUPLICADO && linea.duplicado?.estado) {
      const d = linea.duplicado.estado;
      return {
        estado: d === 'Correcta' ? 'REGISTRADA' : d === 'AceptadaConErrores' ? 'ACEPTADA_CON_ERRORES' : 'ANULADA_EN_AEAT',
        // El CSV de ESTE envío no acredita el registro que ya estaba: no se guarda.
        guardarCsv: false,
        codigoError: linea.codigoError,
        descripcionError: linea.descripcionError,
        estadoDuplicado: d,
      };
    }
    // Un 3000 sin el bloque que dice qué hay en la AEAT: sabemos que hay ALGO,
    // no qué. Se consulta en vez de adivinar.
    if (linea.codigoError === CODIGO_DUPLICADO) {
      return { ...vacio, estado: 'INCIERTO', guardarCsv: false, codigoError: linea.codigoError, descripcionError: linea.descripcionError };
    }
    return { ...vacio, estado: 'RECHAZADA', guardarCsv: false, codigoError: linea.codigoError, descripcionError: linea.descripcionError };
  }
  // Estado ilegible: no se inventa nada.
  return { ...vacio, estado: 'INCIERTO', guardarCsv: false };
}

// ── Qué pasa cuando no hay respuesta de negocio ─────────────────────────────

/**
 * Cómo acabó la llamada cuando no hubo una respuesta de negocio legible:
 *  · NO_ENVIADO   — falló ANTES de que la petición saliera entera (DNS, conexión
 *                   rechazada, TLS). La AEAT no la ha visto: reenviar es seguro.
 *  · SIN_RESPUESTA — la petición salió y no hubo respuesta (timeout, conexión
 *                   cortada). Pudo llegar.
 *  · ILEGIBLE     — hubo respuesta pero no se entiende (HTML de un proxy, 5xx…).
 *                   Pudo llegar.
 */
export type FalloTransporte = 'NO_ENVIADO' | 'SIN_RESPUESTA' | 'ILEGIBLE';

export function resolverFalloTransporte(f: FalloTransporte): 'REINTENTAR' | 'INCIERTO' {
  return f === 'NO_ENVIADO' ? 'REINTENTAR' : 'INCIERTO';
}

// ── SoapFault: la AEAT rechazó el ENVÍO entero ──────────────────────────────

export type ClaseFault = 'SIN_PODER' | 'SUSPENDIDO' | 'NO_HABILITADO' | 'TRANSITORIO' | 'DATOS' | 'DESCONOCIDO';

/**
 * Clasificación de los rechazos de envío (4100-4141) del catálogo en vivo de la
 * AEAT (`errores.properties`, copiado el 30-sep-2026). Criterio de Tentare a
 * partir del texto literal de cada código; no hay una tabla oficial de «qué
 * hacer» con ellos.
 */
const CLASE_POR_CODIGO: Record<string, ClaseFault> = {
  // «El titular del certificado debe ser Obligado Emisión, Colaborador Social, Apoderado o Sucesor.»
  '4112': 'SIN_PODER',
  // «No puede acceder a la consulta de facturas al no estar apoderado en los trámites necesarios.»
  '4140': 'SIN_PODER',
  // «El titular del certificado debe ser el destinatario que realiza la consulta, un Apoderado o Sucesor»
  '4132': 'SIN_PODER',
  // «…su acceso al sistema VERIFACTU ha sido suspendido temporalmente…» → verifactu@correo.aeat.es
  '4141': 'SUSPENDIDO',
  // «Servicio no habilitado en producción.»
  '4139': 'NO_HABILITADO',
  // Errores técnicos del lado de la AEAT y «Servicio no activo».
  '4108': 'TRANSITORIO', '4110': 'TRANSITORIO', '4111': 'TRANSITORIO', '4128': 'TRANSITORIO', '4134': 'TRANSITORIO',
  // Cabecera / NIF del obligado y XML: problemas de datos o de nuestro XML.
  '4102': 'DATOS', '4103': 'DATOS', '4104': 'DATOS', '4106': 'DATOS', '4107': 'DATOS', '4109': 'DATOS',
  '4113': 'DATOS', '4114': 'DATOS', '4115': 'DATOS', '4116': 'DATOS', '4118': 'DATOS', '4119': 'DATOS',
  '4135': 'DATOS', '4136': 'DATOS', '4137': 'DATOS', '4138': 'DATOS',
};

export function claseDeFault(codigo: string | null): ClaseFault {
  return (codigo && CLASE_POR_CODIGO[codigo]) || 'DESCONOCIDO';
}

export interface EfectoFault {
  clase: ClaseFault;
  /** Qué les pasa a los registros del sobre. Un fault = el envío no existió para la AEAT. */
  registros: 'LISTO' | 'REINTENTAR' | 'RECHAZADA';
  /** Efecto sobre el estudio del sobre. */
  estudio: 'PAUSADO' | null;
  /** Efecto sobre TODA la transmisión de Tentare. */
  global: 'SUSPENDIDO_AEAT' | null;
  /** Avisar a la propietaria. */
  avisar: boolean;
}

export function efectoDeFault(codigo: string | null): EfectoFault {
  const clase = claseDeFault(codigo);
  switch (clase) {
    // Sin poder: los registros están bien; lo que falta es el apoderamiento.
    // Se pausa el estudio (no se vuelve a intentar hasta que se revise) y se avisa.
    case 'SIN_PODER': return { clase, registros: 'LISTO', estudio: 'PAUSADO', global: null, avisar: true };
    // Suspensión o servicio no habilitado: afecta a todo lo que manda Tentare.
    case 'SUSPENDIDO': return { clase, registros: 'LISTO', estudio: null, global: 'SUSPENDIDO_AEAT', avisar: false };
    case 'NO_HABILITADO': return { clase, registros: 'LISTO', estudio: null, global: 'SUSPENDIDO_AEAT', avisar: false };
    // Técnico de la AEAT: se reintenta el MISMO XML con espera.
    case 'TRANSITORIO': return { clase, registros: 'REINTENTAR', estudio: null, global: null, avisar: false };
    // Datos/XML: el mismo XML fallará siempre. Rechazado (se subsana con otro
    // registro, que no existe en la AEAT → RechazoPrevio=X) y estudio en pausa
    // para no quemar el control de flujo en bucle.
    case 'DATOS': return { clase, registros: 'RECHAZADA', estudio: 'PAUSADO', global: null, avisar: true };
    // Código desconocido: no sabemos qué es. Nada se da por rechazado; se pausa
    // el estudio para que lo mire una persona.
    case 'DESCONOCIDO': return { clase, registros: 'LISTO', estudio: 'PAUSADO', global: null, avisar: true };
  }
}

// ── Consulta: sacar un registro de INCIERTO ─────────────────────────────────

export type TipoRegistro = 'ALTA' | 'ALTA_SUBSANACION' | 'ANULACION';

export interface ResultadoConsulta {
  estado: 'REGISTRADA' | 'ACEPTADA_CON_ERRORES' | 'ANULADA_EN_AEAT' | 'LISTO' | 'INCIERTO';
  /** INCIERTO que no se resuelve solo: lo mira una persona. */
  revisionManual: boolean;
  motivo: string;
}

/**
 * Qué hacer con un registro INCIERTO a la vista de lo que la AEAT tiene de esa
 * factura. La comparación es por HUELLA: es lo único que distingue «tiene ESTE
 * registro» de «tiene otro registro de la misma factura».
 */
export function resolverConsulta(
  local: { tipo: TipoRegistro; numSerieFactura: string; huella: string },
  r: RespuestaConsulta,
): ResultadoConsulta {
  if (r.fault) {
    return { estado: 'INCIERTO', revisionManual: true, motivo: `La consulta falló (${r.faultCodigo ?? 'sin código'}): ${r.faultMensaje ?? ''}`.trim() };
  }
  if (r.resultado === null) return { estado: 'INCIERTO', revisionManual: false, motivo: 'Respuesta de consulta ilegible' };
  const suyo = r.registros.find(x => x.numSerieFactura === local.numSerieFactura);
  if (r.resultado === 'SinDatos' || !suyo) {
    // La AEAT confirma que no tiene nada de esa factura: reenviar el MISMO XML es seguro.
    return { estado: 'LISTO', revisionManual: false, motivo: 'La AEAT no tiene el registro: se reenvía el mismo XML' };
  }
  if (suyo.huella !== local.huella) {
    // Tiene OTRO registro de la misma factura (p. ej. el alta original y esto
    // era una subsanación). Para una subsanación eso significa que NO llegó; para
    // un alta, que hay algo que no cuadra.
    if (local.tipo === 'ALTA_SUBSANACION') {
      return { estado: 'LISTO', revisionManual: false, motivo: 'La AEAT tiene el registro anterior, no la subsanación: se reenvía' };
    }
    return { estado: 'INCIERTO', revisionManual: true, motivo: 'La AEAT tiene un registro de esta factura con otra huella' };
  }
  if (suyo.estado === 'Correcto') return { estado: 'REGISTRADA', revisionManual: false, motivo: 'Confirmado por consulta' };
  if (suyo.estado === 'AceptadoConErrores') return { estado: 'ACEPTADA_CON_ERRORES', revisionManual: false, motivo: 'Confirmado por consulta' };
  if (suyo.estado === 'Anulado') {
    // Para un registro de anulación, que la factura figure anulada con SU huella es el éxito.
    return local.tipo === 'ANULACION'
      ? { estado: 'REGISTRADA', revisionManual: false, motivo: 'Anulación confirmada por consulta' }
      : { estado: 'ANULADA_EN_AEAT', revisionManual: false, motivo: 'La AEAT lo tiene anulado' };
  }
  return { estado: 'INCIERTO', revisionManual: true, motivo: 'Estado de la consulta ilegible' };
}

// ── Reintentos ───────────────────────────────────────────────────────────────

/** 1 min, 5 min, 15 min, 1 h, y luego cada 6 h. */
const ESPERAS_MS = [60_000, 300_000, 900_000, 3_600_000];

export function siguienteIntento(intentos: number, ahora: Date = new Date()): Date {
  const ms = ESPERAS_MS[Math.min(Math.max(intentos, 1), ESPERAS_MS.length + 1) - 1] ?? 21_600_000;
  return new Date(ahora.getTime() + ms);
}

// ── Lo que ve la factura ─────────────────────────────────────────────────────

/**
 * `facturas.verifactu_estado` es un RESUMEN para las pantallas y para el sello
 * del QR (`lib/factura-sello-cliente.ts`); el detalle vive en
 * `verifactu_registros`. Solo cuatro valores + ANULADA, a propósito: la pantalla
 * no necesita saber si está LISTO o ENVIANDO.
 */
export function estadoParaFactura(e: EstadoRegistroVerifactu): 'PENDIENTE' | 'REGISTRADA' | 'ACEPTADA_CON_ERRORES' | 'RECHAZADA' | 'ANULADA' | null {
  switch (e) {
    case 'REGISTRADA': return 'REGISTRADA';
    case 'ACEPTADA_CON_ERRORES': return 'ACEPTADA_CON_ERRORES';
    case 'ANULADA_EN_AEAT': return 'ANULADA';
    case 'RECHAZADA': return 'RECHAZADA';
    case 'HISTORICO': return null;
    default: return 'PENDIENTE';
  }
}
