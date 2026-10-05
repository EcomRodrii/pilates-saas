// Lo que pasó DE VERDAD al ejecutar una recomendación aprobada: la columna
// `recomendaciones.resultado`, que escribe `ejecutarRecomendacion`
// (lib/inngest/decision.ts) en el mismo UPDATE que la cierra como EJECUTADA o
// FALLIDA.
//
// Existe porque nadie más lo sabía. Tras «Cobrar ahora», el Centro de Control
// decía «Cobro en marcha: lo verás en Cobros» toda la sesión y, al recargar,
// «Ya no está pendiente.» tanto si se había cobrado como si se había rechazado
// la tarjeta; y en Cobros un rechazo no deja rastro (el recibo se queda como
// estaba). «Mientras dormías» sumaba como cobrado lo que el análisis PENSABA
// cobrar (`datosUsados.total`), aunque entrara una parte o nada. Ahora la
// tarjeta, Actividad y el director leen lo mismo: lo que hizo el ejecutor.
//
// Puro (sin red ni imports de servidor): lo usan el ejecutor, el director y la
// botonera del Centro de Control, y corre con `node --test`.

/** Lo que dice `cobrarReciboOffSession` de UN recibo, o por qué no se llegó a intentar. */
export interface IntentoCobro {
  ok: boolean;
  /** Estado del PaymentIntent. Con `ok`, 'processing' es un adeudo SEPA en curso: aún no es dinero. */
  status?: string;
  errorCode?: string;
  /** El motivo, ya en palabras de la propietaria (son los mensajes de lib/billing/stripe-cobros.ts). */
  error?: string;
  importe?: number;
  /**
   * Stripe cobró, pero el recibo NO ha quedado cobrado (`cerrarCobroOffSession`,
   * lib/billing/confirmar-cobro.ts): falló la escritura, o el recibo ya estaba
   * cobrado con otro cargo y este es un segundo cobro de verdad. Llega con
   * `ok: true`, y no es un cobro limpio: las rutas de cobro lo devuelven como un
   * 202 y Automatizaciones lo anota FALLIDO (lib/billing/resultado-cobro.ts).
   */
  aviso?: 'COBRADO_SIN_PERSISTIR';
}

export interface ResumenCobro {
  /** Los recibos que se fueron a cobrar. */
  recibos: number;
  /** Stripe confirmó el cargo y el recibo quedó cobrado: el dinero entró. */
  cobrados: number;
  importeCobradoEur: number;
  /** Adeudos SEPA que el banco aceptó y aún no ha confirmado: pueden devolverse días después. */
  enCurso: number;
  importeEnCursoEur: number;
  /**
   * Stripe los cobró, pero su recibo no ha quedado cobrado (`aviso:
   * 'COBRADO_SIN_PERSISTIR'`). Ni cobrados ni fallidos: hay que revisarlos antes
   * de volver a cobrarlos, porque el recibo sigue pareciendo pendiente —o ya
   * estaba cobrado con otro cargo y hay que devolver uno—. Nunca suman a `cobrados`.
   */
  sinRegistrar: number;
  importeSinRegistrarEur: number;
  motivosSinRegistrar: string[];
  /** Ya no estaban pendientes al ir a cobrarlos: otra vía los cobró, los estaba cobrando o los devolvió. */
  yaNoPendientes: number;
  /** El desenlace no se sabe todavía (Stripe no contestó, otro cobro del mismo recibo en vuelo). */
  sinConfirmar: number;
  motivosSinConfirmar: string[];
  /** No se cobraron: tarjeta rechazada, sin tarjeta, Stripe sin conectar… */
  noCobrados: number;
  motivosNoCobrados: string[];
}

export interface ResultadoEjecucion {
  /** Lo que pasó, en una frase para la propietaria. Es lo mismo que va a Actividad. */
  detalle: string;
  /** Solo en un cobro (COBRAR_RECIBOS): el desglose por recibo. */
  cobro?: ResumenCobro;
  /**
   * El ejecutor no llegó a terminar (agotó sus reintentos: `onFailure` de
   * `ejecutarRecomendacion`). No se sabe hasta dónde llegó, así que `detalle`
   * no afirma nada: dice qué revisar (`detalleInterrumpida`).
   */
  interrumpida?: true;
}

// Ni cobrado ni rechazado: el cargo puede haber entrado (y lo cerrará su webhook
// o el conciliador), o hay otro cobro del mismo recibo en marcha.
const SIN_CONFIRMAR = new Set(['ERROR_TRANSITORIO', 'COBRO_EN_MARCHA']);

const aCentimos = (n: number) => Math.round(n * 100) / 100;

// El resumen también se lee de la base de datos (la tarjeta lo pide a /estado):
// un campo que falte cuenta como cero, nunca revienta la pantalla.
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const lista = (x: unknown): string[] => (Array.isArray(x) ? x.filter((m): m is string => typeof m === 'string') : []);

export function resumirCobro(intentos: readonly IntentoCobro[]): ResumenCobro {
  const r: ResumenCobro = {
    recibos: intentos.length, cobrados: 0, importeCobradoEur: 0, enCurso: 0, importeEnCursoEur: 0,
    sinRegistrar: 0, importeSinRegistrarEur: 0, motivosSinRegistrar: [],
    yaNoPendientes: 0, sinConfirmar: 0, motivosSinConfirmar: [], noCobrados: 0, motivosNoCobrados: [],
  };
  const anotar = (lista: string[], motivo: string) => { if (!lista.includes(motivo)) lista.push(motivo); };
  for (const i of intentos) {
    const importe = typeof i.importe === 'number' && Number.isFinite(i.importe) ? i.importe : 0;
    // Antes que nada: llega con `ok: true` y no es un cobro limpio.
    if (i.ok && i.aviso === 'COBRADO_SIN_PERSISTIR') {
      r.sinRegistrar++;
      r.importeSinRegistrarEur = aCentimos(r.importeSinRegistrarEur + importe);
      anotar(r.motivosSinRegistrar, i.error?.trim() || 'Cobrado en Stripe sin quedar cobrado el recibo.');
    } else if (i.ok && i.status === 'processing') {
      r.enCurso++;
      r.importeEnCursoEur = aCentimos(r.importeEnCursoEur + importe);
    } else if (i.ok) {
      r.cobrados++;
      r.importeCobradoEur = aCentimos(r.importeCobradoEur + importe);
    } else if (i.errorCode === 'NO_PENDIENTE') {
      r.yaNoPendientes++;
    } else if (i.errorCode && SIN_CONFIRMAR.has(i.errorCode)) {
      r.sinConfirmar++;
      anotar(r.motivosSinConfirmar, i.error?.trim() || 'El cobro ha quedado sin confirmar.');
    } else {
      r.noCobrados++;
      anotar(r.motivosNoCobrados, i.error?.trim() || 'No se pudo completar el cobro.');
    }
  }
  return r;
}

/**
 * Cómo terminó un cobro, en una palabra. Decide si la recomendación queda
 * EJECUTADA (`cobroEjecutado`), el tono de la tarjeta y si enlaza a Cobros
 * (efecto-aprobar.ts, `trasDecidir`). Por orden:
 *
 *   · A_REVISAR — algo se cobró en Stripe sin quedar cobrado su recibo. Va
 *     primero aunque otros recibos entraran bien: es lo que hay que mirar antes
 *     de volver a cobrar, y no puede leerse como un éxito limpio.
 *   · COBRADO — entró dinero, o va de camino (SEPA), aunque algún recibo fallara:
 *     el desglose lo dice.
 *   · SIN_CONFIRMAR — no entró nada seguro y algo quedó sin saberse: el cargo
 *     pudo entrar, así que ni es un fallo ni se invita a cobrarlo de otra forma.
 *   · YA_NO_PENDIENTE — no quedaba nada por cobrar: otra vía lo había cobrado.
 *   · NO_COBRADO — no se cobró nada y algo falló.
 */
export type DesenlaceCobro = 'SIN_RECIBOS' | 'A_REVISAR' | 'COBRADO' | 'SIN_CONFIRMAR' | 'YA_NO_PENDIENTE' | 'NO_COBRADO';

export function desenlaceCobro(r: ResumenCobro): DesenlaceCobro {
  if (num(r.recibos) === 0) return 'SIN_RECIBOS';
  if (num(r.sinRegistrar) > 0) return 'A_REVISAR';
  if (num(r.cobrados) + num(r.enCurso) > 0) return 'COBRADO';
  if (num(r.sinConfirmar) > 0) return 'SIN_CONFIRMAR';
  if (num(r.noCobrados) === 0 && num(r.yaNoPendientes) > 0) return 'YA_NO_PENDIENTE';
  return 'NO_COBRADO';
}

/**
 * ¿Queda EJECUTADA (y no FALLIDA)? Si entró dinero o va de camino, sí, aunque
 * algún recibo no se cobrara: el desglose lo dice. Y si no quedaba nada por
 * cobrar (todos se habían pagado ya por otra vía), también: lo que pidió la
 * propietaria está hecho, y decir «No se pudo completar» con el dinero dentro
 * era falso. FALLIDA cuando no se cobró nada y algo falló o quedó sin
 * confirmar, y cuando algo se cobró sin quedar cobrado su recibo: eso necesita
 * que alguien lo mire (lo mismo que anota Automatizaciones, FALLIDO), y una
 * EJECUTADA lo daría por resuelto —y lo mediría como un éxito—.
 */
export function cobroEjecutado(r: ResumenCobro): boolean {
  const d = desenlaceCobro(r);
  return d === 'COBRADO' || d === 'YA_NO_PENDIENTE';
}

/**
 * ¿«Lo ves en Cobros»? Solo si allí hay algo que ver de este cobro —lo cobrado,
 * el adeudo en curso, el recibo que ya estaba pagado— y nada que la mande allí
 * a cobrarlo otra vez: un rechazo no deja rastro en Cobros, el recibo cobrado sin
 * registrar sigue pareciendo pendiente, y uno sin confirmar se confirma solo.
 */
export function enlazaACobros(r: ResumenCobro): boolean {
  if (num(r.sinRegistrar) > 0 || num(r.sinConfirmar) > 0) return false;
  return num(r.cobrados) + num(r.enCurso) + num(r.yaNoPendientes) > 0;
}

/** ¿Pudo moverse dinero? Lo cobrado, lo que va de camino, lo cobrado sin registrar y lo que no se sabe. */
export function pudoMoverDinero(r: ResumenCobro): boolean {
  return num(r.cobrados) + num(r.enCurso) + num(r.sinRegistrar) + num(r.sinConfirmar) > 0;
}

/** «89 €», «89,50 €». */
export function euros(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

/** Los motivos tal cual los escribe el módulo de cobros, cada uno con su punto. */
function unirMotivos(motivos: readonly string[]): string {
  return motivos.map(m => (/[.!?]$/.test(m) ? m : `${m}.`)).join(' ');
}

/** Tras dos puntos, en minúscula — salvo un nombre propio («Stripe no respondió…») o una sigla. */
function trasDosPuntos(s: string): string {
  const primera = s.split(/\s/, 1)[0] ?? '';
  if (!primera || /^Stripe/.test(primera) || /[A-ZÁÉÍÓÚÑ]/.test(primera.slice(1))) return s;
  return s.charAt(0).toLocaleLowerCase('es-ES') + s.slice(1);
}

export const PREFIJO_SIN_CONFIRMAR = 'Sin confirmar todavía';

/**
 * El desglose de un cobro en palabras: lo que se lee en la tarjeta tras
 * «Cobrar ahora» y en Actividad. Nunca da por cobrado lo que no se cobró: un
 * adeudo SEPA en curso va aparte (puede devolverse), lo cobrado en Stripe sin
 * quedar cobrado su recibo va aparte (hay que revisarlo), y lo que no se sabe
 * se dice que no se sabe.
 */
export function detalleCobro(r: ResumenCobro): string {
  const total = num(r.recibos);
  if (total === 0) return 'No había ningún recibo que cobrar.';
  const cobrados = num(r.cobrados);
  const enCurso = num(r.enCurso);
  const sinRegistrar = num(r.sinRegistrar);
  const yaNoPendientes = num(r.yaNoPendientes);
  const sinConfirmar = num(r.sinConfirmar);
  const noCobrados = num(r.noCobrados);
  const frases: string[] = [];
  if (cobrados > 0) {
    const importe = euros(num(r.importeCobradoEur));
    frases.push(cobrados === total
      ? (total === 1 ? `Cobrado: ${importe}.` : `Cobrados los ${total} recibos: ${importe}.`)
      : `Cobrados ${cobrados} de ${total} recibos: ${importe}.`);
  }
  if (enCurso > 0) {
    frases.push(`${enCurso === 1 ? 'Adeudo SEPA en curso' : `${enCurso} adeudos SEPA en curso`} (${euros(num(r.importeEnCursoEur))}): el banco tarda unos días en confirmarlo, y hasta entonces puede devolverse.`);
  }
  if (sinRegistrar > 0) {
    // El importe solo si se sabe: «(0 €)» sería falso.
    const cuanto = num(r.importeSinRegistrarEur) > 0 ? ` (${euros(num(r.importeSinRegistrarEur))})` : '';
    frases.push(total === 1
      ? `Cobrado en Stripe${cuanto}, pero el recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.`
      : sinRegistrar === 1
        ? `Uno se ha cobrado en Stripe${cuanto}, pero su recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.`
        : `${sinRegistrar} se han cobrado en Stripe${cuanto}, pero sus recibos no han quedado cobrados: revísalos antes de volver a cobrarlos.`);
  }
  if (yaNoPendientes > 0) {
    frases.push(total === 1
      ? 'Ya no estaba pendiente al ir a cobrarlo.'
      : yaNoPendientes === 1 ? 'Uno ya no estaba pendiente al ir a cobrarlo.' : `${yaNoPendientes} ya no estaban pendientes al ir a cobrarlos.`);
  }
  if (sinConfirmar > 0) {
    // Los motivos ya dicen qué pasa (y que no se cobre de otra forma).
    const motivos = trasDosPuntos(unirMotivos(lista(r.motivosSinConfirmar)));
    frases.push(total === 1
      ? `${PREFIJO_SIN_CONFIRMAR}: ${motivos}`
      : `${sinConfirmar === 1 ? 'Uno' : sinConfirmar} sin confirmar todavía: ${motivos}`);
  }
  if (noCobrados > 0) {
    const cuantos = total === 1 ? 'No se ha podido cobrar.'
      : noCobrados === total ? `No se ha podido cobrar ninguno de los ${total}.`
      : noCobrados === 1 ? 'Uno no se ha podido cobrar.' : `${noCobrados} no se han podido cobrar.`;
    frases.push(`${cuantos} ${unirMotivos(lista(r.motivosNoCobrados))}`.trim());
  }
  return frases.join(' ');
}

/**
 * Lo que dice una recomendación que el ejecutor no llegó a terminar (agotó sus
 * reintentos). No se sabe hasta dónde llegó, así que no afirma ni que se hiciera
 * ni que no: dice qué mirar antes de repetirlo. `efecto` es el que enseñaba el
 * botón (va en el evento): con «Hecho» no se mandó ni se cobró nada.
 */
export function detalleInterrumpida(accionTipo: string, efecto?: string | null): string {
  if (efecto !== 'MARCAR' && accionTipo === 'COBRAR_RECIBOS') {
    return 'No se ha podido terminar; revisa Cobros antes de volver a cobrar.';
  }
  if (efecto !== 'MARCAR' && (accionTipo === 'ENVIAR_EMAIL' || accionTipo === 'CONTACTO_MANUAL')) {
    return 'No se ha podido terminar; comprueba si le ha llegado el mensaje antes de volver a escribirle.';
  }
  return 'No se ha podido terminar; si sigue haciendo falta, volverá a aparecer.';
}

/**
 * La línea de Actividad de una recomendación aprobada, cuando el ejecutor la
 * cierra (o cuando no ha podido). Un cobro y una ejecución interrumpida se
 * describen solos —`detalleCobro` dice si entró, si no y por qué, o que no se
 * sabe—, así que no llevan delante «No se pudo completar»: con un cobro sin
 * confirmar o cobrado sin registrar, eso era falso.
 */
export function lineaActividad(p: {
  titulo: string; nombreSocia: string | null; ok: boolean; resultado: ResultadoEjecucion;
}): string {
  const { titulo, nombreSocia, ok, resultado } = p;
  if (resultado.cobro || resultado.interrumpida) {
    return nombreSocia ? `${nombreSocia}: ${resultado.detalle}` : `${titulo} — ${resultado.detalle}`;
  }
  if (!ok) return `No se pudo completar: ${titulo} — ${resultado.detalle}`;
  return nombreSocia ? `${nombreSocia}: ${resultado.detalle}` : `Gestionada: ${titulo}`;
}
