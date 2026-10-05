// Qué pasa DE VERDAD al pulsar el botón principal de una recomendación del
// Centro de Control. Lo hace el servidor (`ejecutarRecomendacion`,
// lib/inngest/decision.ts, tras DECISION_APPROVED), y este módulo lo dice antes
// del clic para que el botón no prometa otra cosa. El veredicto pintaba un
// «Hecho» genérico que, según la recomendación, cobraba la tarjeta de una socia
// o le mandaba un email o un WhatsApp (reescrito con IA si el estudio la tiene
// encendida): quien lo pulsaba creía estar marcando algo como hecho.
//
// Puro (sin red ni imports de servidor), como mensajes-socia.ts: lo usan GET
// /api/decisiones, que lo expone como `efecto` en cada recomendación, las rutas
// de aprobar y de «Ya la he contactado», el ejecutor, el Action Center de Inicio
// y la botonera del veredicto y de las filas
// (components/decision/acciones-recomendacion.tsx). Un solo dueño del rótulo del
// botón principal: si el ejecutor cambia lo que hace con un tipo de acción, este
// fichero cambia con él, y su test lo ata leyendo el ejecutor.
import { mensajeParaSocia } from './mensajes-socia.ts';
import { desenlaceCobro, detalleCobro, enlazaACobros, type ResultadoEjecucion, type ResumenCobro } from './resultado-ejecucion.ts';

export type EfectoAprobar = 'COBRAR' | 'ENVIAR_EMAIL' | 'ENVIAR_MENSAJE' | 'MARCAR';

const EFECTOS: readonly EfectoAprobar[] = ['COBRAR', 'ENVIAR_EMAIL', 'ENVIAR_MENSAJE', 'MARCAR'];

/** Lo mínimo de una recomendación para saber qué hace aprobarla — vale la del servidor y la de la API. */
export interface RecomendacionParaEfecto {
  tipo: string;
  accion: { tipo: string; canal?: unknown; reciboIds?: unknown };
  socioId: string | null;
  datosUsados: Record<string, string | number | boolean>;
}

// ─── Por dónde le llega el mensaje a la socia ────────────────────────────────

/**
 * Por dónde le llegaría el mensaje a la socia si se aprueba ahora. Es lo que
 * mira el ejecutor antes de enviar (`ejecutarContactoSocia`, `ejecutarEnvioEmail`):
 * WhatsApp solo en un contacto de canal WhatsApp, con su teléfono y el WhatsApp
 * Business del estudio conectado; email, con su email y el envío configurado.
 * Los datos los trae el servidor (lib/decision/canales-socia.ts).
 */
export interface CanalesSocia {
  whatsapp: boolean;
  email: boolean;
}

/** `RESEND_API_KEY` puesta y que no sea el marcador de ejemplo (`re_XXXX…`). */
export function emailConfigurado(apiKey: string | null | undefined): boolean {
  return !!apiKey && !apiKey.startsWith('re_XXXX');
}

export function canalesSocia(p: {
  accion: { tipo: string; canal?: unknown };
  socia: { email?: string | null; telefono?: string | null } | null;
  whatsappConectado: boolean;
  emailConfigurado: boolean;
}): CanalesSocia {
  return {
    whatsapp: p.accion.tipo === 'CONTACTO_MANUAL' && p.accion.canal === 'WHATSAPP' && !!p.socia?.telefono && p.whatsappConectado,
    email: !!p.socia?.email && p.emailConfigurado,
  };
}

export function puedeEscribirle(c: CanalesSocia): boolean {
  return c.whatsapp || c.email;
}

// ─── El efecto y su rótulo ───────────────────────────────────────────────────

/** Hay un mensaje escrito para ELLA (no el motivo de la propietaria). El nombre del estudio no lo cambia: de ahí el ''. */
function hayMensajeParaSocia(r: RecomendacionParaEfecto): boolean {
  return !!r.socioId && !!mensajeParaSocia(r.tipo, r.datosUsados, '');
}

/**
 * `canales`: por dónde le llegaría el mensaje ahora (lo calcula el servidor). Sin
 * él —una respuesta sin `efecto`, un mock— se da por hecho que hay por dónde: el
 * servidor lo vuelve a calcular al aprobar y, si no coincide, responde 409.
 */
export function efectoAlAprobar(r: RecomendacionParaEfecto, canales?: CanalesSocia): EfectoAprobar {
  switch (r.accion.tipo) {
    case 'COBRAR_RECIBOS':
      return 'COBRAR';
    case 'ENVIAR_EMAIL':
      // `ejecutarEnvioEmail`: sin mensaje para ella o sin email al que mandarlo
      // no hay envío, así que el botón no lo promete. Con «Hecho» el ejecutor
      // solo la marca.
      return hayMensajeParaSocia(r) && (!canales || canales.email) ? 'ENVIAR_EMAIL' : 'MARCAR';
    case 'CONTACTO_MANUAL':
      // `ejecutarContactoSocia`: sin socia o sin mensaje para ella, aprobar no
      // manda nada. Y sin canal tampoco: una clienta dada de alta solo con
      // teléfono, en un estudio sin WhatsApp Business conectado, recibía un
      // «Enviarle el mensaje» que no le enviaba nada y se daba por hecho. Ahí el
      // botón es «Hecho», con el de WhatsApp al lado para escribirle a mano.
      return hayMensajeParaSocia(r) && (!canales || puedeEscribirle(canales)) ? 'ENVIAR_MENSAJE' : 'MARCAR';
    default:
      // MARCAR_GESTIONADO: avisos de horario, de equipo… informativos, sin efecto fuera.
      return 'MARCAR';
  }
}

export const ROTULO_EFECTO: Readonly<Record<EfectoAprobar, string>> = {
  COBRAR: 'Cobrar ahora',
  ENVIAR_EMAIL: 'Enviar email',
  ENVIAR_MENSAJE: 'Enviarle el mensaje',
  MARCAR: 'Hecho',
};

/**
 * «Ya la he contactado»: la propietaria ya le ha escrito o la ha llamado por su
 * cuenta, y aprobar le mandaría OTRO mensaje. Solo tiene sentido donde aprobar
 * le escribe a la socia. Nunca en un cobro: quedaría EJECUTADO sin que entrara
 * un euro, y se mediría como si se hubiera intentado cobrar (`medirOutcomeFn`).
 * La ruta lo vuelve a comprobar en el servidor con esta misma función.
 */
export function admiteYaContactada(efecto: EfectoAprobar): boolean {
  return efecto === 'ENVIAR_MENSAJE' || efecto === 'ENVIAR_EMAIL';
}

export function esEfectoAprobar(v: unknown): v is EfectoAprobar {
  return typeof v === 'string' && (EFECTOS as readonly string[]).includes(v);
}

/**
 * El efecto que trae la API o, si no viene (una respuesta de antes de este
 * campo, un mock), el que sale de aquí con los mismos datos. Es la misma
 * función en los dos lados, así que no hay dos criterios.
 */
export function efectoDe(r: RecomendacionParaEfecto & { efecto?: unknown }): EfectoAprobar {
  return esEfectoAprobar(r.efecto) ? r.efecto : efectoAlAprobar(r);
}

// ─── Qué recibos cobra «Cobrar ahora» ────────────────────────────────────────

/** Los recibos que cobraría aprobar un COBRAR_RECIBOS: los que enseña su tarjeta. */
export function recibosDeLaAccion(accion: { tipo: string; reciboIds?: unknown }): string[] {
  return Array.isArray(accion.reciboIds) ? accion.reciboIds.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * ¿Los recibos que vio la propietaria son los que cobraría el ejecutor AHORA?
 * Como conjunto. RECUPERAR_PAGOS es UNA recomendación por estudio que cada
 * análisis refresca en el sitio, con el mismo id: la tarjeta que dice «2 pagos,
 * 60 €» puede tener debajo 5 recibos y 150 € si el análisis corrió después de
 * abrir la pantalla. Sin esta comparación se cobraban los 5.
 */
export function mismosRecibos(vistos: unknown, actuales: readonly string[]): boolean {
  if (!Array.isArray(vistos) || !vistos.every(x => typeof x === 'string')) return false;
  const a = new Set(vistos as string[]);
  const b = new Set(actuales);
  return a.size === b.size && [...a].every(x => b.has(x));
}

export const PANTALLA_DESACTUALIZADA = 'La pantalla está desactualizada: recárgala para ver qué hace ahora este botón.';
export const RECIBOS_CAMBIADOS = 'Lo que hay que cobrar ha cambiado desde que abriste la pantalla: recárgala para ver qué se cobraría ahora.';

/**
 * Lo que /aprobar comprueba antes de aprobar nada: que el botón que vio la
 * propietaria (`visto`, el cuerpo de la petición) dijera lo que la
 * recomendación hace AHORA —una pestaña abierta antes de que cambiara, o de
 * cuando el veredicto decía «Hecho» a todo, o una socia que ya no tiene por
 * dónde recibir el mensaje—, y en un cobro, que enseñara los mismos recibos. Si
 * no, el error de un 409: nada se cobra ni se envía sin que el botón lo haya
 * dicho. Si sí, lo que va en el evento al ejecutor, que no hará más que eso.
 */
export function comprobarAprobacion(
  r: RecomendacionParaEfecto,
  visto: unknown,
  canales?: CanalesSocia,
): { ok: true; efecto: EfectoAprobar; reciboIds: string[] | null } | { ok: false; error: string } {
  const v = (visto && typeof visto === 'object' ? visto : {}) as { efecto?: unknown; reciboIds?: unknown };
  const efecto = efectoAlAprobar(r, canales);
  if (v.efecto !== efecto) return { ok: false, error: PANTALLA_DESACTUALIZADA };
  if (efecto !== 'COBRAR') return { ok: true, efecto, reciboIds: null };
  const recibos = recibosDeLaAccion(r.accion);
  if (!mismosRecibos(v.reciboIds, recibos)) return { ok: false, error: RECIBOS_CAMBIADOS };
  return { ok: true, efecto, reciboIds: recibos };
}

/**
 * Lo que cobra el ejecutor: los recibos de la recomendación que además aprobó
 * la propietaria (van en el evento). Cierra el hueco entre comprobar y aprobar,
 * en el que un análisis aún podía refrescar la fila. Sin lista aprobada (un
 * evento encolado antes de este cambio), los de la recomendación.
 */
export function recibosACobrar(deLaRecomendacion: readonly string[], aprobados: unknown): string[] {
  if (!Array.isArray(aprobados)) return [...deLaRecomendacion];
  const ok = new Set(aprobados.filter((x): x is string => typeof x === 'string'));
  return deLaRecomendacion.filter(id => ok.has(id));
}

/**
 * La otra mitad de `recibosACobrar`: los que aprobó la propietaria y ya no están
 * en la recomendación (un análisis la refrescó entre que se comprobó y se aprobó,
 * y los sacó: casi siempre porque ya no estaban pendientes). No se cobran, pero
 * tampoco se callan: entran en el desglose como «ya no estaba pendiente», en vez
 * de desaparecer de lo que la propietaria aprobó sin que nadie se lo diga.
 */
export function recibosAprobadosFuera(deLaRecomendacion: readonly string[], aprobados: unknown): string[] {
  if (!Array.isArray(aprobados)) return [];
  const siguen = new Set(deLaRecomendacion);
  return [...new Set(aprobados.filter((x): x is string => typeof x === 'string'))].filter(id => !siguen.has(id));
}

/** Lo que el ejecutor anota de un recibo aprobado que ya no estaba en la recomendación. */
export const FUERA_DE_LA_RECOMENDACION = 'Ya no estaba en la recomendación';

// ─── Lo que va donde los botones cuando ya no está pendiente ────────────────

/** Sigue esperando a que alguien decida. Sin `estado` (una respuesta incompleta) se da por abierta. */
export function sigueAbierta(estado: string | null | undefined): boolean {
  return !estado || estado === 'PENDIENTE';
}

/** Lo que la pantalla sabe de un cobro aprobado mientras pregunta cómo ha ido (use-decisiones.ts). */
export const TEXTO_COBRO_EN_MARCHA = 'Cobro en marcha. En cuanto termine, verás aquí cómo ha ido.';
export const TEXTO_COBRO_TARDANDO = 'El cobro está tardando más de lo normal. Cuando termine, verás cómo ha ido en Actividad.';

export type TipoTrasDecidir =
  /** Aprobado y sin cerrar: la pantalla pregunta cada pocos segundos (con tope). */
  | 'COBRO_EN_MARCHA'
  /** Se agotó el tope de preguntar sin que cerrara. */
  | 'COBRO_TARDANDO'
  /** Cerrado: el desglose de lo que se cobró y lo que no (`detalleCobro`). */
  | 'COBRO_TERMINADO'
  /**
   * Hay que mirarlo antes de repetir nada: se cobró en Stripe sin quedar cobrado
   * su recibo, o el ejecutor no llegó a terminar. Ni éxito ni fallo.
   */
  | 'A_REVISAR'
  /** No se sabe todavía si el cargo entró: ni rojo de fallo ni invitación a cobrarlo de otra forma. */
  | 'SIN_CONFIRMAR'
  | 'FALLIDA'
  | 'YA_NO_PENDIENTE';

export interface TrasDecidir {
  tipo: TipoTrasDecidir;
  texto: string;
  /** «Lo ves en Cobros»: solo si allí hay algo que ver de este cobro (`enlazaACobros`). */
  enlaceACobros?: true;
}

/**
 * El tono de lo que va donde los botones. El rojo es solo para lo que falló de
 * verdad: un cobro sin confirmar puede haber entrado, y uno cobrado sin
 * registrar entró — pintarlos como un fallo invitaba a cobrarlos de otra forma.
 */
export type TonoTrasDecidir = 'fallo' | 'aviso' | 'normal' | 'apagado';
export const TONO_TRAS_DECIDIR: Readonly<Record<TipoTrasDecidir, TonoTrasDecidir>> = {
  COBRO_EN_MARCHA: 'normal',
  COBRO_TARDANDO: 'normal',
  COBRO_TERMINADO: 'normal',
  A_REVISAR: 'aviso',
  SIN_CONFIRMAR: 'normal',
  FALLIDA: 'fallo',
  YA_NO_PENDIENTE: 'apagado',
};

const conPunto = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** Lo que dice la tarjeta de un cobro cerrado, según lo que guardó el ejecutor (`desenlaceCobro`). */
function cobroCerrado(cobro: ResumenCobro): TrasDecidir {
  const texto = detalleCobro(cobro);
  const enlace = enlazaACobros(cobro) ? { enlaceACobros: true as const } : {};
  switch (desenlaceCobro(cobro)) {
    case 'SIN_RECIBOS':
      return { tipo: 'FALLIDA', texto: `No se ha podido cobrar: ${texto.toLowerCase()}` };
    case 'A_REVISAR':
      return { tipo: 'A_REVISAR', texto };
    case 'SIN_CONFIRMAR':
      return { tipo: 'SIN_CONFIRMAR', texto };
    case 'NO_COBRADO':
      return { tipo: 'FALLIDA', texto, ...enlace };
    case 'COBRADO':
    case 'YA_NO_PENDIENTE':
      return { tipo: 'COBRO_TERMINADO', texto, ...enlace };
  }
}

/**
 * Lo que va donde los botones cuando la recomendación ya no está pendiente:
 * `null` mientras lo esté (van los botones). Un cobro aprobado no desaparece
 * como si ya estuviera cobrado: lo cobra el ejecutor después y puede fallar,
 * así que dice que está en marcha hasta saber cómo terminó, y entonces lo dice
 * (`resultado`, que guarda el ejecutor). Una recomendación que falló dice por
 * qué, no «Ya no está pendiente».
 */
export function trasDecidir(
  efecto: EfectoAprobar,
  estado: string | null | undefined,
  opciones: { resultado?: ResultadoEjecucion | null; tardando?: boolean } = {},
): TrasDecidir | null {
  if (sigueAbierta(estado)) return null;
  const { resultado, tardando } = opciones;
  // El ejecutor no llegó a terminar (`onFailure`): no se sabe qué hizo, y el
  // detalle dice qué revisar antes de repetirlo. Ni «No se ha podido cobrar»
  // —pudo cobrar— ni el motivo en Actividad.
  if (estado === 'FALLIDA' && resultado?.interrumpida && resultado.detalle) {
    return { tipo: 'A_REVISAR', texto: conPunto(resultado.detalle) };
  }
  if (efecto === 'COBRAR') {
    if (estado === 'APROBADA') {
      return tardando ? { tipo: 'COBRO_TARDANDO', texto: TEXTO_COBRO_TARDANDO } : { tipo: 'COBRO_EN_MARCHA', texto: TEXTO_COBRO_EN_MARCHA };
    }
    if ((estado === 'EJECUTADA' || estado === 'FALLIDA') && resultado?.cobro) return cobroCerrado(resultado.cobro);
    // Cerrado antes de que el ejecutor guardara su resultado: lo que pasó solo está en Actividad.
    if (estado === 'FALLIDA') return { tipo: 'FALLIDA', texto: 'No se ha podido cobrar: el motivo está en Actividad.' };
    if (estado === 'EJECUTADA') return { tipo: 'YA_NO_PENDIENTE', texto: 'Ya no está pendiente: el resultado está en Actividad.' };
  }
  if (estado === 'FALLIDA') {
    return {
      tipo: 'FALLIDA',
      texto: resultado?.detalle ? `No se ha podido completar. ${conPunto(resultado.detalle)}` : 'No se ha podido completar: el motivo está en Actividad.',
    };
  }
  return { tipo: 'YA_NO_PENDIENTE', texto: 'Ya no está pendiente.' };
}
