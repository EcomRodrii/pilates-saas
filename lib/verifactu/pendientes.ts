// Veri*Factu — decidir QUÉ se envía y qué se hace con la respuesta.
//
// Lógica pura, sin base de datos ni red, para poder probarla entera. Quien la
// llama (lib/verifactu/transmitir.ts) pone las filas y guarda el resultado.
//
// ⚠️ POR QUÉ ESTO NO SE ENVÍA AL SELLAR.
// La AEAT impone control de flujo: devuelve un `TiempoEsperaEnvio` que arranca
// en 60 segundos y hay que respetarlo entre envíos. Transmitir dentro del
// sellado significaría que cobrar cinco recibos seguidos —algo tan normal como
// pulsar «cobrar todo» un lunes— dejaría el panel esperando minutos, o peor,
// mandaría cinco envíos seguidos y la AEAT los rechazaría.
//
// Así que el sellado hace lo de siempre (numerar, encadenar, guardar la huella)
// y deja la factura EN COLA. Un cron la transmite en lotes. Es la misma forma
// que ya tiene el repo para el sellado que falla y se reintenta.

/** Estado de transmisión de una factura. NULL en base = todavía sin intentar. */
export type EstadoTransmision =
  | 'PENDIENTE'
  | 'REGISTRADA'
  | 'ACEPTADA_CON_ERRORES'
  | 'RECHAZADA';

export interface FacturaPendiente {
  id: string;
  studioId: string;
  numeroCompleto: string;
  /** dd-mm-yyyy */
  fechaExpedicion: string;
  verifactuSeq: number;
  huella: string;
  huellaAnterior: string;
}

/**
 * Cuántas caben en un envío.
 *
 * El XSD topa en 1000 `RegistroFactura`, pero el lote se queda bastante por
 * debajo a propósito: un envío rechazado por cabecera se pierde ENTERO, y
 * perder 200 es recuperable mientras que perder 1000 en un cron que corre cada
 * pocos minutos no aporta nada a cambio.
 */
export const TAMANO_LOTE = 200;

/**
 * Ordena y corta lo que va en el próximo envío.
 *
 * ⚠️ EL ORDEN ES POR `verifactu_seq`, NO POR FECHA. La cadena de huella es una
 * secuencia: mandar la 7 antes que la 6 le da a la AEAT una cadena que no
 * cuadra. Con fecha de emisión se ordenaría mal en cuanto dos facturas del
 * mismo día llegaran desordenadas.
 */
export function loteAEnviar(
  pendientes: readonly FacturaPendiente[],
  tamano: number = TAMANO_LOTE,
): FacturaPendiente[] {
  return [...pendientes]
    .sort((a, b) => a.verifactuSeq - b.verifactuSeq)
    .slice(0, Math.max(1, tamano));
}

/**
 * Un hueco en la secuencia significa que falta por enviar una factura anterior
 * a las que tenemos delante.
 *
 * Enviar la 8 cuando la 7 no ha salido nunca deja a la AEAT con una cadena
 * rota: la 8 declara como anterior una huella de la que Hacienda no tiene
 * registro. Mejor esperar a que la 7 se resuelva.
 */
export function hayHuecoAntesDe(
  lote: readonly FacturaPendiente[],
  ultimaSeqRegistrada: number | null,
): boolean {
  if (lote.length === 0) return false;
  const primera = lote[0].verifactuSeq;
  // La primera de todas (seq 1) no tiene nada delante.
  if (primera === 1) return false;
  return primera !== (ultimaSeqRegistrada ?? 0) + 1;
}

export interface ResultadoRegistro {
  numSerieFactura: string | null;
  estado: 'Correcto' | 'AceptadoConErrores' | 'Incorrecto' | null;
  codigoError: string | null;
  descripcionError: string | null;
}

/** Traduce lo que dice la AEAT de cada registro a lo que guardamos. */
export function estadoDesdeRespuesta(r: ResultadoRegistro): EstadoTransmision {
  if (r.estado === 'Correcto') return 'REGISTRADA';
  if (r.estado === 'AceptadoConErrores') return 'ACEPTADA_CON_ERRORES';
  if (r.estado === 'Incorrecto') return 'RECHAZADA';
  // Sin estado reconocible no se marca nada: se deja PENDIENTE y se reintenta.
  // Inventar «REGISTRADA» aquí sería dar por buena una factura que no consta.
  return 'PENDIENTE';
}

/**
 * Empareja lo enviado con lo respondido POR NÚMERO DE FACTURA, no por posición.
 *
 * La AEAT no garantiza que devuelva las líneas en el mismo orden en que se
 * mandaron, y confiar en el índice del array es exactamente cómo se acaba
 * marcando como registrada una factura que fue rechazada — y al revés.
 * Una factura sin línea de respuesta se queda PENDIENTE.
 */
export function casarRespuestas(
  enviadas: readonly FacturaPendiente[],
  respuestas: readonly ResultadoRegistro[],
): { factura: FacturaPendiente; estado: EstadoTransmision; error: string | null }[] {
  const porNumero = new Map<string, ResultadoRegistro>();
  for (const r of respuestas) {
    if (r.numSerieFactura) porNumero.set(r.numSerieFactura, r);
  }
  return enviadas.map(factura => {
    const r = porNumero.get(factura.numeroCompleto);
    if (!r) return { factura, estado: 'PENDIENTE' as const, error: null };
    const estado = estadoDesdeRespuesta(r);
    const error = r.codigoError
      ? `${r.codigoError}${r.descripcionError ? ` · ${r.descripcionError}` : ''}`
      : null;
    return { factura, estado, error };
  });
}

/** Una factura registrada o aceptada con errores ya no se reenvía. */
export function yaNoSeReenvia(estado: EstadoTransmision): boolean {
  return estado === 'REGISTRADA' || estado === 'ACEPTADA_CON_ERRORES';
}
