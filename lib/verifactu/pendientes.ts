// Veri*Factu — decidir QUÉ se envía y cómo se casa la respuesta con lo enviado.
//
// Lógica pura, sin base de datos ni red, para poder probarla entera. Quien la
// llama (lib/verifactu/transmitir.ts) pone las filas de `verifactu_registros` y
// guarda el resultado.
//
// ⚠️ POR QUÉ ESTO NO SE ENVÍA AL SELLAR.
// La AEAT impone control de flujo: devuelve un `TiempoEsperaEnvio` que arranca
// en 60 segundos y hay que respetarlo entre envíos. Transmitir dentro del
// sellado significaría que cobrar cinco recibos seguidos —algo tan normal como
// pulsar «cobrar todo» un lunes— dejaría el panel esperando minutos, o peor,
// mandaría cinco envíos seguidos y la AEAT los rechazaría.
//
// Así que el sellado hace lo de siempre (numerar, encadenar, guardar la huella)
// y el registro queda EN COLA. Un cron lo transmite en lotes.

import type { EstadoRegistroVerifactu, TipoRegistro } from './estado.ts';
import type { RegistroRespondido } from './respuesta.ts';
import { motivoEsperaPorAnterior, type MotivoEspera } from './politica-cadena.ts';

/**
 * Resumen que vive en `facturas.verifactu_estado` (y que usa el sello del QR).
 * NULL en base = fuera de la cola (histórico). El detalle está en
 * `verifactu_registros` — ver `estadoParaFactura` en estado.ts.
 */
export type EstadoTransmision =
  | 'PENDIENTE'
  | 'REGISTRADA'
  | 'ACEPTADA_CON_ERRORES'
  | 'RECHAZADA'
  | 'ANULADA';

/** Admitida por la AEAT y vigente: lo único que justifica imprimir el QR. */
export function yaNoSeReenvia(estado: EstadoTransmision): boolean {
  return estado === 'REGISTRADA' || estado === 'ACEPTADA_CON_ERRORES';
}

/** Una fila de `verifactu_registros`, lo justo para decidir el lote. */
export interface RegistroCola {
  id: string;
  seq: number;
  tipo: TipoRegistro;
  estado: EstadoRegistroVerifactu;
  numSerieFactura: string;
  /** dd-mm-aaaa */
  fechaExpedicion: string;
  /** ISO. Solo en REINTENTAR: no antes de esta hora. */
  proximoIntentoEn: string | null;
  /**
   * Generado antes de que el estudio empezara VERI*FACTU (barrera-activacion.ts).
   * Nunca sale solo: la cadena del estudio se para ahí hasta que se decida.
   */
  anteriorAActivacion?: boolean;
}

/**
 * Cuántos caben en un envío.
 *
 * El XSD topa en 1000 `RegistroFactura`, pero el lote se queda bastante por
 * debajo a propósito: un envío rechazado por cabecera se pierde ENTERO, y
 * perder 200 es recuperable mientras que perder 1000 en un cron que corre cada
 * pocos minutos no aporta nada a cambio.
 */
export const TAMANO_LOTE = 200;

export type DecisionLote =
  | { tipo: 'ENVIAR'; lote: RegistroCola[] }
  | { tipo: 'CONCILIAR'; registro: RegistroCola }
  | { tipo: 'ESPERAR'; motivo: MotivoEspera | 'HUECO_EN_CADENA' | 'EN_REINTENTO' | 'SIN_PREPARAR' | 'ENVIO_EN_CURSO' | 'ANTERIOR_A_LA_ACTIVACION' }
  | { tipo: 'NADA' };

const ACTIVOS: ReadonlySet<EstadoRegistroVerifactu> = new Set(['RESERVADO', 'PENDIENTE', 'LISTO', 'ENVIANDO', 'REINTENTAR', 'INCIERTO']);

function enviableAhora(r: RegistroCola, ahora: Date): boolean {
  if (r.estado === 'LISTO') return true;
  if (r.estado === 'REINTENTAR') return !r.proximoIntentoEn || new Date(r.proximoIntentoEn).getTime() <= ahora.getTime();
  return false;
}

/**
 * Qué hacer con la cadena de UN estudio en esta pasada.
 *
 * `registros` son TODOS los de la cadena del estudio (incluidos los finales: se
 * necesitan para saber qué hay delante del primero pendiente).
 *
 * ⚠️ EL ORDEN ES POR `seq`, NO POR FECHA. La cadena de huella es una secuencia:
 * mandar la 7 antes que la 6 le da a la AEAT una cadena que no cuadra.
 *
 * Reglas:
 *  · El primer registro no terminado manda. Si está INCIERTO, antes de nada se
 *    concilia (se pregunta a la AEAT); si está ENVIANDO/RESERVADO/PENDIENTE, se
 *    espera.
 *  · Lo que tiene delante lo decide `politica-cadena.ts` (rechazados e histórico).
 *  · El lote coge registros consecutivos enviables, sin dos del mismo
 *    `IDFactura` (la respuesta se casa por factura + operación y dos del mismo
 *    número serían indistinguibles).
 */
export function decidirLote(
  registros: readonly RegistroCola[],
  ahora: Date = new Date(),
  tamano: number = TAMANO_LOTE,
): DecisionLote {
  const orden = [...registros].sort((a, b) => a.seq - b.seq);
  const i0 = orden.findIndex(r => ACTIVOS.has(r.estado));
  if (i0 < 0) return { tipo: 'NADA' };

  const primero = orden[i0];
  // Hueco: falta la posición anterior en la cadena. No debería pasar nunca
  // (UNIQUE(studio_id, seq) y relleno completo); si pasa, no se manda nada.
  const anterior = i0 > 0 ? orden[i0 - 1] : null;
  if (primero.seq > 1 && (!anterior || anterior.seq !== primero.seq - 1)) return { tipo: 'ESPERAR', motivo: 'HUECO_EN_CADENA' };
  // Barrera de activación: lo generado antes de empezar VERI*FACTU no sale solo,
  // y lo posterior tampoco pasa por delante (la cadena va en orden).
  if (primero.anteriorAActivacion) return { tipo: 'ESPERAR', motivo: 'ANTERIOR_A_LA_ACTIVACION' };

  if (primero.estado === 'INCIERTO') return { tipo: 'CONCILIAR', registro: primero };
  if (primero.estado === 'ENVIANDO') return { tipo: 'ESPERAR', motivo: 'ENVIO_EN_CURSO' };
  if (primero.estado === 'RESERVADO') return { tipo: 'ESPERAR', motivo: 'ANTERIOR_RESERVADO' };
  if (primero.estado === 'PENDIENTE') return { tipo: 'ESPERAR', motivo: 'SIN_PREPARAR' };
  if (!enviableAhora(primero, ahora)) return { tipo: 'ESPERAR', motivo: 'EN_REINTENTO' };

  const bloqueo = motivoEsperaPorAnterior(anterior ? { estado: anterior.estado } : null);
  if (bloqueo) return { tipo: 'ESPERAR', motivo: bloqueo };

  const lote: RegistroCola[] = [];
  const facturasEnLote = new Set<string>();
  let previo: RegistroCola | null = anterior;
  for (let i = i0; i < orden.length && lote.length < Math.max(1, tamano); i++) {
    const r = orden[i];
    if (previo && r.seq !== previo.seq + 1) break; // hueco
    if (!ACTIVOS.has(r.estado)) {
      // Un final en medio (p. ej. un rechazo local al preparar): lo que venga
      // detrás depende de la política para ese anterior.
      if (motivoEsperaPorAnterior({ estado: r.estado })) break;
      previo = r;
      continue;
    }
    if (r.anteriorAActivacion) break;
    if (!enviableAhora(r, ahora)) break;
    const clave = `${r.numSerieFactura}|${r.fechaExpedicion}`;
    if (facturasEnLote.has(clave)) break;
    facturasEnLote.add(clave);
    lote.push(r);
    previo = r;
  }
  return lote.length > 0 ? { tipo: 'ENVIAR', lote } : { tipo: 'NADA' };
}

/**
 * Empareja lo enviado con lo respondido POR FACTURA Y OPERACIÓN, nunca por
 * posición.
 *
 * La AEAT no garantiza que devuelva las líneas en el mismo orden en que se
 * mandaron, y confiar en el índice del array es exactamente cómo se acaba
 * marcando como registrada una factura que fue rechazada — y al revés.
 * La operación (Alta/Anulacion) separa el alta y la anulación de una misma
 * factura. Un registro sin línea de respuesta recibe `null`.
 */
export function casarRespuestas<T extends Pick<RegistroCola, 'numSerieFactura' | 'tipo'>>(
  enviados: readonly T[],
  respuestas: readonly RegistroRespondido[],
): { registro: T; linea: RegistroRespondido | null }[] {
  const clave = (num: string | null, op: string | null) => `${num ?? ''}|${op ?? '?'}`;
  const porClave = new Map<string, RegistroRespondido>();
  const porNumero = new Map<string, RegistroRespondido[]>();
  for (const r of respuestas) {
    if (!r.numSerieFactura) continue;
    porClave.set(clave(r.numSerieFactura, r.operacion), r);
    porNumero.set(r.numSerieFactura, [...(porNumero.get(r.numSerieFactura) ?? []), r]);
  }
  return enviados.map(registro => {
    const op = registro.tipo === 'ANULACION' ? 'Anulacion' : 'Alta';
    const exacta = porClave.get(clave(registro.numSerieFactura, op));
    if (exacta) return { registro, linea: exacta };
    // Sin `Operacion` en la línea: vale solo si hay UNA línea para ese número
    // (un lote nunca lleva dos registros de la misma factura).
    const candidatas = porNumero.get(registro.numSerieFactura) ?? [];
    return { registro, linea: candidatas.length === 1 && candidatas[0].operacion === null ? candidatas[0] : null };
  });
}

/**
 * 50ª pasada de auditoría, hallazgo H-2: la AEAT devuelve `TiempoEsperaEnvio`
 * en CADA respuesta y hay que respetarlo antes del SIGUIENTE envío (Orden
 * HAC/1177/2024, art. 16.2). Cuando la AEAT no lo informa (primer envío, o un
 * Fault), se usa el valor inicial que fija la orden: 60 segundos. Nunca 0.
 *
 * ⚠️ ÁMBITO NO CONFIRMADO: si la espera cuenta por certificado remitente, por
 * obligado o por sistema. Mientras no se aclare, Tentare la aplica GLOBAL
 * (`verifactu_control_flujo`, clave 'global'): lo más prudente.
 */
export const ESPERA_AEAT_POR_DEFECTO_SEGUNDOS = 60;

export function esperaAntesDelSiguienteEnvioMs(tiempoEsperaSegundos: number | null): number {
  const segundos = tiempoEsperaSegundos && tiempoEsperaSegundos > 0
    ? tiempoEsperaSegundos
    : ESPERA_AEAT_POR_DEFECTO_SEGUNDOS;
  return segundos * 1000;
}
