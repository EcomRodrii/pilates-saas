// ─────────────────────────────────────────────────────────────────────────────
// Dueño ÚNICO de «este recibo está cobrado».
//
// Historia corta: F-12/F-13 juntó aquí el webhook de Checkout y el conciliador,
// que eran gemelos divergentes. Pero seguían quedando otros escritores de
// COBRADO, cada uno con su orden de efectos y sus huecos:
//   · `confirmarCobroExitoso` (SEPA / tarjeta guardada) mandaba el email ANTES
//     de sellar, así que salía sin número de factura; no marcaba
//     `factura_pendiente_sellar` y SEPA no guardaba el cargo;
//   · `cobrarReciboOffSession` (stripe-cobros.ts) leía el recibo y luego lo
//     actualizaba SIN filtro de estado;
//   · `entregarPlanComprado` sellaba por su cuenta y el webhook mandaba el
//     email en cada reentrega.
//
// Ahora hay dos piezas:
//
//  1. `confirmarCobro` — UN compare-and-set a COBRADO, filtrado por los estados
//     que admite quien confirma (`estadosAdmitidosPorOrigen`), por el cargo
//     (`filtroCargoEnCas`: un EN_CURSO solo lo cierra su propio cargo, un
//     DEVUELTO con ese mismo cargo no se resucita) y por las guardas de
//     reembolso, con `conciliado_por` en el mismo UPDATE. Si no toca filas
//     distingue reentrega (`ya_estaba`), devuelto (`devuelto`) y otro cargo
//     distinto (se reporta, nunca un éxito silencioso). Solo quien GANA la
//     transición aplica efectos.
//
//  2. `aplicarEfectosCobro` — renovación → factura → caja → créditos →
//     aviso → email, en ese orden (ver `efectosEnOrden`). Cada paso es
//     best-effort: el dinero ya entró y ningún efecto puede deshacer el cobro.
//     Todos son idempotentes salvo el email, que solo se pide cuando se ganó
//     la transición. Se puede volver a llamar para reparar.
//
// Los envoltorios de cada camino (`confirmarCobroRecibo`,
// `confirmarCobroExitoso`, `cerrarCobroOffSession`) viven aquí también, para
// poder probarlos: sus módulos de origen no cargan en `node --test`.
//
// Las reglas puras viven en `cobro-confirmado-reglas.ts`, con tests.
//
// ⚠️ Lo que sigue siendo de cada llamador es lo que necesita el objeto vivo de
// Stripe: verificar importe, resolver el estudio por la cuenta que firma,
// detectar Bizum vs tarjeta, la Idempotency-Key. Eso no se trae aquí.
//
// Un fallo de sellado deja `factura_pendiente_sellar`, que el conciliador
// horario reintenta sobre cobros RECIENTES — nunca retroactivo sin límite:
// sellar HOY una factura de hace semanas tiene implicación fiscal real (en qué
// trimestre se declara), y eso lo decide una persona, no un cron.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as SentryNext from '@sentry/nextjs';
import { aplicarRenovacionServidor } from './renovacion-server.ts';
import { sellarFacturaDeRecibo, type ResultadoSellado } from './sellar-factura-server.ts';
import { evaluarFeature } from './billing-rules.ts';
import { hoyEnEstudio } from '../utils.ts';
import {
  conciliadoPorDe, efectosEnOrden, efectosEnReentrega, esRenovacion, estadosAdmitidosPorOrigen,
  facturaIdCheckout, facturaIdMetodoGuardado, facturaIdParaReintento, filtroCargoEnCas,
  refIdCreditoRenovacion, resolverSinFilas,
  type OrigenCobro, type PasoEfecto,
} from './cobro-confirmado-reglas.ts';

export type { OrigenCobro } from './cobro-confirmado-reglas.ts';

// Fuera del runtime de Next (`node --test`) el paquete no expone
// `captureMessage`/`captureException` y llamarlos lanza. Aquí eso importa: los
// avisos están en los caminos de fallo que los tests SÍ recorren (factura sin
// sellar, segundo cargo), y un aviso no puede tumbar los efectos de un cobro.
const sentry = SentryNext as Partial<typeof SentryNext>;
const Sentry = {
  captureMessage: (...a: Parameters<typeof SentryNext.captureMessage>) => { sentry.captureMessage?.(...a); },
  captureException: (...a: Parameters<typeof SentryNext.captureException>) => { sentry.captureException?.(...a); },
};

// 'tpv' = el mostrador cobrando un recibo por datáfono o Bizum. Se distingue
// de 'manual' a propósito: 'manual' es alguien marcándolo sin que nadie lo
// confirme, 'tpv' es Stripe diciendo que sí.
export type FuenteConfirmacion = 'webhook' | 'conciliador' | 'tpv';

/** Quién estaba delante, para el apunte de caja. */
export interface ActorCobro { userId: string | null; nombre: string | null }

export interface ParamsConfirmarCobro {
  studioId: string;
  reciboId: string;
  /** Con qué se cobró de verdad (va a `recibos.metodo_cobro`). */
  metodo: string;
  origen: OrigenCobro;
  /** El cargo real, para poder devolverlo desde el panel. Solo se escribe si viene. */
  paymentIntentId: string | null;
  /** Pedir el email de justificante SI esta llamada gana la transición. */
  avisarSocia: boolean;
  /** Id de la factura de este canal (ver `facturaIdCheckout`/`facturaIdMetodoGuardado`). */
  facturaId: string;
  actor?: ActorCobro;
  /** `false` = este camino nunca cierra un DEVUELTO (SEPA / tarjeta guardada). */
  admitirDevuelto?: boolean;
}

export type ResultadoConfirmarCobro =
  | {
      ok: true;
      transicion: 'aplicada' | 'ya_estaba' | 'devuelto';
      numeroFactura?: string;
      /** `false` solo si en ESTA llamada se intentó sellar y falló. */
      selladoOk: boolean;
    }
  | {
      ok: false;
      codigo: 'NO_ENCONTRADO' | 'NO_COBRABLE' | 'PERSISTENCIA';
      error: string;
      /** Con NO_COBRABLE: el estado en que se encontró el recibo. */
      estado?: string | null;
    };

/** Los efectos, inyectables para poder probar el orden sin red ni BD. */
export interface DependenciasEfectos {
  renovar: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<unknown>;
  sellar: (admin: SupabaseClient, p: { studioId: string; reciboId: string; facturaId: string }) => Promise<ResultadoSellado>;
  apuntarCaja: (admin: SupabaseClient, p: { studioId: string; reciboId: string; actor: ActorCobro | null }) => Promise<void>;
  otorgarCreditos: (admin: SupabaseClient, p: { studioId: string; reciboId: string; socioId: string }) => Promise<void>;
  notificar: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<void>;
  enviarEmail: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<void>;
}

// El dinero pasó por el mostrador: que cuadre el arqueo. Idempotente por id
// derivado del recibo (`mov-rec-<recibo>`, ON CONFLICT DO NOTHING), y la propia
// RPC decide si procede (sin caja abierta, o SEPA/transferencia, no apunta).
async function apuntarCobroEnCajaServidor(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; actor: ActorCobro | null },
): Promise<void> {
  const { error } = await admin.rpc('apuntar_cobro_en_caja', {
    p_studio_id: p.studioId, p_recibo_id: p.reciboId,
    p_por: p.actor?.userId ?? null, p_por_nombre: p.actor?.nombre ?? null,
  });
  if (error) throw new Error(error.message);
}

// Créditos RENOVACION_PLAN, en servidor. Decisión del fundador (14-sep): se dan
// en CUALQUIER cobro de una renovación —tarjeta guardada, SEPA, web,
// mostrador—, una sola vez por recibo. Hasta ahora solo los daba el panel al
// marcar cobrado a mano.
//
// Misma RPC y mismo gate de plan que `otorgarCreditosServidor`
// (supabase-data-admin.ts, no exportada). La unicidad la pone la BD:
// `reward_actions` UNIQUE (studio_id, trigger, ref_id) con el ref_id que
// comparten panel y servidor (`refIdCreditoRenovacion`). Un segundo intento
// choca ahí y la RPC devuelve `otorgado = false` sin sumar nada.
async function otorgarCreditosRenovacionServidor(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; socioId: string },
): Promise<void> {
  if (await evaluarFeature(admin, p.studioId, 'gamificacion')) return;
  const { error } = await admin.rpc('otorgar_credito_disparador', {
    p_studio_id: p.studioId, p_socio_id: p.socioId,
    p_trigger: 'RENOVACION_PLAN', p_ref_id: refIdCreditoRenovacion(p.reciboId), p_config_id: null,
  });
  // «No toca conceder» (sin regla activa, etc.) no es un error de sistema.
  if (error && !/SIN_REGLA_ACTIVA|CONDICION_NO_CUMPLIDA|REF_ID_NO_DERIVADO/.test(error.message)) {
    throw new Error(error.message);
  }
}

const DEPENDENCIAS: DependenciasEfectos = {
  renovar: aplicarRenovacionServidor,
  sellar: sellarFacturaDeRecibo,
  apuntarCaja: apuntarCobroEnCajaServidor,
  otorgarCreditos: otorgarCreditosRenovacionServidor,
  notificar: async (admin, p) => {
    const { emitirPagoRealizado } = await import('../notifications/emit.ts');
    await emitirPagoRealizado(admin, p);
  },
  enviarEmail: async (admin, p) => {
    const { enviarEmailReciboWebhook } = await import('../emails/enviar-recibo-webhook.ts');
    await enviarEmailReciboWebhook(admin, p);
  },
};

export interface ParamsEfectosCobro {
  studioId: string;
  reciboId: string;
  metodo: string | null;
  origen: OrigenCobro;
  facturaId: string;
  /** Mandar el email. Solo `true` si quien llama ganó la transición. */
  avisarSocia: boolean;
  /** `false` cuando la entrega ya la hizo el llamador (compra web). */
  renovar?: boolean;
  notificar?: boolean;
  /** Reparación de un cobro que ya estaba: un sellado fallido no se re-reporta a Sentry. */
  reparacion?: boolean;
  actor?: ActorCobro;
  /** Si el llamador ya lo sabe (el CAS lo devuelve), se ahorra la lectura. */
  recibo?: { socioId: string | null; esRenovacion: boolean };
}

export interface ResultadoEfectosCobro {
  pasos: PasoEfecto[];
  selladoOk: boolean;
  numeroFactura?: string;
}

/**
 * Efectos de un cobro ya confirmado. Idempotente y seguro de repetir (salvo el
 * email, que solo sale con `avisarSocia`). Nunca lanza.
 */
export async function aplicarEfectosCobro(
  admin: SupabaseClient,
  p: ParamsEfectosCobro,
  deps: Partial<DependenciasEfectos> = {},
): Promise<ResultadoEfectosCobro> {
  const d: DependenciasEfectos = { ...DEPENDENCIAS, ...deps };
  const base = { studioId: p.studioId, reciboId: p.reciboId };

  let recibo = p.recibo;
  if (!recibo) {
    try {
      const { data } = await admin.from('recibos')
        .select('socio_id, es_renovacion').eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
      recibo = { socioId: (data?.socio_id as string | null) ?? null, esRenovacion: esRenovacion(data) };
    } catch {
      // Sin poder leerlo no se dan créditos; el resto de efectos sigue.
      recibo = { socioId: null, esRenovacion: false };
    }
  }

  const pasos = efectosEnOrden({
    origen: p.origen, metodo: p.metodo, avisarSocia: p.avisarSocia,
    esRenovacion: recibo.esRenovacion && !!recibo.socioId,
    renovar: p.renovar, notificar: p.notificar,
  });

  let selladoOk = true;
  let numeroFactura: string | undefined;

  const marcarFacturaPendiente = async (detalle: unknown) => {
    selladoOk = false;
    try {
      await admin.from('recibos').update({ factura_pendiente_sellar: true })
        .eq('id', p.reciboId).eq('studio_id', p.studioId);
    } catch (e) {
      console.error('[aplicarEfectosCobro] no se pudo marcar la factura pendiente', p.reciboId, e);
    }
    if (p.reparacion) {
      // El camino que ganó la transición ya lo reportó segundos antes: capturarlo
      // otra vez duplicaría el aviso en CADA cobro de un estudio sin NIF.
      console.error('[aplicarEfectosCobro] reparación: factura sin sellar', p.reciboId, detalle);
      return;
    }
    Sentry.captureMessage('[confirmarCobro] cobro OK pero factura sin sellar', {
      level: 'warning', tags: { area: 'cobros', tipo: 'facturacion' },
      extra: { reciboId: p.reciboId, studioId: p.studioId, origen: p.origen, error: String(detalle) },
    });
  };

  // Sellada (ahora o antes): si quedó marca de un intento fallido, se quita.
  // Solo toca la fila si la marca estaba puesta, así que repetirlo no escribe.
  const limpiarFacturaPendiente = async () => {
    try {
      await admin.from('recibos').update({ factura_pendiente_sellar: false })
        .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('factura_pendiente_sellar', true);
    } catch (e) {
      console.error('[aplicarEfectosCobro] no se pudo quitar la marca de factura pendiente', p.reciboId, e);
    }
  };

  for (const paso of pasos) {
    try {
      switch (paso) {
        case 'renovacion':
          await d.renovar(admin, base);
          break;
        case 'factura': {
          const r = await d.sellar(admin, { ...base, facturaId: p.facturaId });
          if (r.ok) {
            const n = r.factura?.numeroCompleto;
            if (typeof n === 'string') numeroFactura = n;
            await limpiarFacturaPendiente();
          } else {
            await marcarFacturaPendiente(r.error);
          }
          break;
        }
        case 'caja':
          await d.apuntarCaja(admin, { ...base, actor: p.actor ?? null });
          break;
        case 'creditos':
          await d.otorgarCreditos(admin, { ...base, socioId: recibo.socioId as string });
          break;
        case 'notificacion':
          await d.notificar(admin, base);
          break;
        case 'email':
          await d.enviarEmail(admin, base);
          break;
      }
    } catch (e) {
      if (paso === 'factura') {
        await marcarFacturaPendiente(e instanceof Error ? e.message : e);
        continue;
      }
      Sentry.captureException(e instanceof Error ? e : new Error(`Fallo en el efecto ${paso} del cobro`), {
        level: 'warning', tags: { area: 'cobros', tipo: `efecto-${paso}` },
        extra: { reciboId: p.reciboId, studioId: p.studioId, origen: p.origen },
      });
    }
  }

  return { pasos, selladoOk, ...(numeroFactura ? { numeroFactura } : {}) };
}

/**
 * La única transición a COBRADO del servidor. Ver la cabecera del módulo.
 */
export async function confirmarCobro(
  admin: SupabaseClient,
  p: ParamsConfirmarCobro,
  deps: Partial<DependenciasEfectos> = {},
): Promise<ResultadoConfirmarCobro> {
  const ahoraISO = new Date().toISOString();
  // P-9 (auditoría 21ª pasada): `fecha_cobro` es `date`, no `timestamptz` como
  // `conciliado_en` — con `ahoraISO` un cobro a la 01:30 de Madrid se fechaba
  // el día anterior (mismo bug que ya documenta `hoyEnEstudio`).
  const hoy = hoyEnEstudio(new Date(ahoraISO));
  const conciliadoPor = conciliadoPorDe(p.origen);

  let consulta = admin
    .from('recibos')
    .update({
      estado: 'COBRADO', fecha_cobro: hoy, metodo_cobro: p.metodo,
      ...(p.metodo === 'SEPA' ? { sepa_estado: 'succeeded' } : {}),
      ...(p.paymentIntentId ? { stripe_payment_intent_id: p.paymentIntentId } : {}),
      // Pagado: deja de haber una sesión abierta que reutilizar.
      checkout_session_id: null,
      ...(conciliadoPor ? { conciliado_en: ahoraISO, conciliado_por: conciliadoPor } : {}),
    })
    // Acotado al tenant y a los estados que admite QUIEN confirma. Queda fuera
    // COBRADO, para no reescribir `fecha_cobro` con un evento tardío o
    // duplicado.
    //
    // Las dos guardas de reembolso son las mismas columnas que mira
    // `esReciboCobrable`: un recibo que se le está devolviendo a la socia NO se
    // resucita por aquí. El tercer discriminante (`importe_devuelto >=
    // importe`) no se replica: PostgREST no compara dos columnas entre sí, y
    // hacerlo en TS sería leer-y-escribir con carrera. La puerta que decide si
    // se le puede COBRAR es /api/stripe/checkout, que sí lo comprueba.
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    .in('estado', estadosAdmitidosPorOrigen(p.origen, { admitirDevuelto: p.admitirDevuelto }))
    .is('reembolso_stripe_id', null)
    .is('reembolso_solicitado_en', null);
  // DEVUELTO y EN_CURSO atados al cargo que llega (ver `filtroCargoEnCas`).
  const filtroCargo = filtroCargoEnCas(p.paymentIntentId);
  if (filtroCargo) consulta = consulta.or(filtroCargo);

  const { data: marcado, error } = await consulta.select('id, socio_id, es_renovacion').maybeSingle();
  if (error) return { ok: false, codigo: 'PERSISTENCIA', error: error.message };

  if (!marcado) {
    const { data: fila, error: errLeer } = await admin.from('recibos')
      .select('estado, stripe_payment_intent_id').eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
    if (errLeer) return { ok: false, codigo: 'PERSISTENCIA', error: errLeer.message };
    const decision = resolverSinFilas(
      fila as { estado: string | null; stripe_payment_intent_id: string | null } | null,
      p.paymentIntentId,
    );
    switch (decision.tipo) {
      case 'no_encontrado':
        return { ok: false, codigo: 'NO_ENCONTRADO', error: 'Recibo no encontrado' };
      case 'ya_estaba': {
        // Lo único que se repite es el apunte de caja del mostrador: el segundo
        // camino que llega (TPV o webhook) lo hacía siempre y reparaba así uno
        // fallido. Idempotente. Ni email ni créditos.
        const d: DependenciasEfectos = { ...DEPENDENCIAS, ...deps };
        for (const paso of efectosEnReentrega(p.origen)) {
          if (paso !== 'caja') continue;
          try {
            await d.apuntarCaja(admin, { studioId: p.studioId, reciboId: p.reciboId, actor: p.actor ?? null });
          } catch (e) {
            Sentry.captureException(e instanceof Error ? e : new Error('Fallo al apuntar en caja un cobro ya confirmado'), {
              level: 'warning', tags: { area: 'cobros', tipo: 'efecto-caja' },
              extra: { reciboId: p.reciboId, studioId: p.studioId, origen: p.origen },
            });
          }
        }
        return { ok: true, transicion: 'ya_estaba', selladoOk: true };
      }
      case 'devuelto':
        return { ok: true, transicion: 'devuelto', selladoOk: true };
      case 'otro_cobro':
        // Auditoría 2026-09-16 (PAY-2): sin cargo guardado, el caso más probable
        // de doble cobro real es el mostrador cerrando el recibo a mano SIN
        // expirar la Checkout Session que la socia ya tenía abierta. Se avisa
        // AUNQUE no se sepa con qué se cerró.
        Sentry.captureMessage(decision.anterior
          ? '[confirmarCobro] SEGUNDO cobro del mismo recibo: hay que devolver uno'
          : '[confirmarCobro] cobro real sobre un recibo ya COBRADO sin cargo registrado: revisar y devolver', {
          level: 'error', tags: { area: 'cobros' },
          extra: {
            reciboId: p.reciboId, studioId: p.studioId, origen: p.origen,
            paymentIntentCobrado: decision.anterior, paymentIntentDuplicado: p.paymentIntentId,
          },
        });
        return { ok: false, codigo: 'NO_COBRABLE', error: 'Este recibo ya estaba cobrado, o en cobro, con otro cargo: hay que devolver uno de los dos.', estado: fila?.estado as string | null };
      case 'no_cobrable':
        Sentry.captureMessage(decision.estado === 'ANULADO'
          ? '[confirmarCobro] pago sobre un recibo ANULADO: hay que devolverlo'
          : '[confirmarCobro] cobro sobre un recibo que no admite cobro', {
          // Con Stripe de por medio el dinero YA entró: es un error. A mano es
          // una acción que se rechaza y ya.
          level: p.origen === 'manual' ? 'warning' : 'error', tags: { area: 'cobros' },
          extra: { reciboId: p.reciboId, studioId: p.studioId, origen: p.origen, estado: decision.estado, paymentIntentId: p.paymentIntentId },
        });
        return { ok: false, codigo: 'NO_COBRABLE', error: `Este recibo no admite este cobro (estado: ${decision.estado ?? 'desconocido'}).`, estado: decision.estado };
    }
  }

  const efectos = await aplicarEfectosCobro(admin, {
    studioId: p.studioId, reciboId: p.reciboId, metodo: p.metodo, origen: p.origen,
    facturaId: p.facturaId, avisarSocia: p.avisarSocia, actor: p.actor,
    recibo: {
      socioId: (marcado.socio_id as string | null) ?? null,
      esRenovacion: esRenovacion(marcado as { es_renovacion?: boolean | null }),
    },
  }, deps);

  return {
    ok: true, transicion: 'aplicada', selladoOk: efectos.selladoOk,
    ...(efectos.numeroFactura ? { numeroFactura: efectos.numeroFactura } : {}),
  };
}

export type ResultadoConfirmarCobroRecibo =
  | {
      ok: true;
      /** `false` = no hubo transición en esta llamada (ya estaba, o devuelto con ese cargo). */
      actualizado: boolean;
    }
  | { ok: false; error: string; codigo: 'NO_ENCONTRADO' | 'NO_COBRABLE' | 'PERSISTENCIA'; estado?: string | null };

/**
 * Confirma el cobro de un recibo pagado por Checkout Session (portal, enlace
 * público, widget embebido) o por el TPV del mostrador. Envoltorio de
 * `confirmarCobro` con el nombre de siempre.
 */
export async function confirmarCobroRecibo(
  admin: SupabaseClient,
  params: {
    studioId: string;
    reciboId: string;
    metodoCobro: string;
    paymentIntentId: string | null;
    fuente: FuenteConfirmacion;
    /** Solo TPV: quién cobraba, para el apunte de caja. */
    actor?: ActorCobro;
  },
): Promise<ResultadoConfirmarCobroRecibo> {
  const { studioId, reciboId, metodoCobro, paymentIntentId, fuente } = params;
  const r = await confirmarCobro(admin, {
    studioId, reciboId, metodo: metodoCobro,
    origen: fuente, paymentIntentId,
    avisarSocia: true, facturaId: facturaIdCheckout(reciboId), actor: params.actor,
  });

  // Libro de intentos de cobro (PAY-4), el que contesta a «me habéis cobrado
  // dos veces». Se anota aquí y no en `confirmarCobro` porque solo este envoltorio
  // conoce el origen 'checkout' del libro.
  if (r.ok && r.transicion === 'aplicada') {
    if (paymentIntentId) {
      await registrarIntentoCobro(admin, { paymentIntentId, studioId, reciboId, origen: 'checkout', desenlace: 'cobrado' });
    }
    return { ok: true, actualizado: true };
  }

  // Auditoría 2026-09-22 (M-1): el cargo existe en Stripe pero el recibo NO
  // quedó cerrado por él (otro cargo, o un estado que no admite cobro): el
  // desenlace honesto es 'pendiente', y es la anotación que permite detectar un
  // segundo cobro. Con la reentrega del MISMO cargo (`ya_estaba`/`devuelto`) el
  // recibo ya lo refleja, y anotar 'pendiente' pisaría el 'cobrado' con el que
  // se cerró.
  if (!r.ok && r.codigo === 'NO_COBRABLE' && paymentIntentId) {
    await registrarIntentoCobro(admin, { paymentIntentId, studioId, reciboId, origen: 'checkout', desenlace: 'pendiente' });
  }

  if (!r.ok) {
    // Un recibo ANULADO (perdonado al cancelar la cuota) o ya cobrado con otro
    // cargo que aun así cobra: el dinero entró, no se marca ni se entrega nada y
    // `confirmarCobro` ya avisó para devolverlo. Devolver error haría que Stripe
    // reintentara para siempre un evento que no se va a poder aplicar nunca.
    if (r.codigo === 'NO_COBRABLE' && (r.estado === 'ANULADO' || r.estado === 'COBRADO')) return { ok: true, actualizado: false };
    return { ok: false, error: r.error, codigo: r.codigo };
  }
  return { ok: true, actualizado: false };
}

// Confirma un cobro que Stripe ya liquidó (`payment_intent.succeeded`) de un
// recibo cobrado con SEPA o tarjeta guardada. Lo usan el webhook y el backstop
// SEPA de `lib/inngest/dunning.ts` (vía la reexportación de dunning-server.ts).
//
// SEPA: el adeudo es asíncrono y el webhook ES el camino normal.
// TARJETA (D-6, auditoría 20-ago): `cobrarReciboOffSession` ya cierra el recibo
// de forma síncrona, así que aquí el webhook es la RED: recoge el
// COBRADO_SIN_PERSISTIR y la respuesta perdida con la clave de idempotencia ya
// expirada (ver lib/billing/clasificar-error-cobro.ts).
//
// `studioId` viene siempre de una fuente fiable del llamante (la cuenta
// Connect del evento, o el propio recibo ya acotado por estudio), nunca de la
// metadata del PaymentIntent.
export async function confirmarCobroExitoso(
  params: {
    admin: SupabaseClient;
    reciboId: string;
    studioId: string;
    metodo: 'SEPA' | 'TARJETA';
    /** El cargo real, para poder devolverlo desde el panel. Solo se escribe si viene. */
    paymentIntentId?: string | null;
    /** F-12/F-13: quién lo confirma, para `recibos.conciliado_por`. */
    fuente: 'webhook' | 'conciliador';
  },
  deps: Partial<DependenciasEfectos> = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, reciboId, studioId, metodo, fuente } = params;
  // TARJETA usa el MISMO id de factura que `cobrarReciboOffSession`: si el
  // camino síncrono ya selló, esto colisiona y no duplica.
  const facturaId = facturaIdMetodoGuardado(reciboId, metodo);

  const r = await confirmarCobro(admin, {
    studioId, reciboId, metodo, origen: fuente,
    paymentIntentId: params.paymentIntentId ?? null,
    // Este camino nunca cerró un DEVUELTO: un adeudo SEPA se puede devolver
    // hasta 8 semanas después, y la reentrega del succeeded original no puede
    // resucitarlo, tenga o no cargo guardado.
    admitirDevuelto: false,
    // Transición real: en SEPA es el camino normal; en TARJETA significa que el
    // webhook acaba de RECUPERAR un cobro que el camino síncrono perdió —
    // avisar a la socia es lo correcto: nadie más lo hará.
    avisarSocia: true,
    facturaId,
  }, deps);

  // ⚠️ Auditoría 2026-09-23 (PAY-2): el libro `cobros_intentos` solo lo escribía
  // el camino de CHECKOUT. El detector `detectar_dobles_cobros` agrupa por
  // `recibo_id` y cuenta PaymentIntents distintos, así que era ciego justo en el
  // camino duplicable: la clave de idempotencia de Stripe vive ~24 h y el barrido
  // de dunning corre cada 24 h, de modo que un segundo cargo real off-session
  // nunca producía la segunda fila que el detector busca.
  //   · Transición real: este cargo cerró este recibo → 'cobrado' (firme).
  //   · NO_COBRABLE (otro cargo, anulado…): el cargo existe en Stripe pero NO
  //     cerró el recibo → 'pendiente', que es lo que permite ver el segundo cobro.
  //   · `ya_estaba`: la reentrega del MISMO cargo, ya anotado por quien lo cerró;
  //     anotar aquí 'pendiente' no lo degradaría (precedencia de
  //     `registrarIntentoCobro`) pero tampoco aporta nada.
  if (params.paymentIntentId) {
    if (r.ok && r.transicion === 'aplicada') {
      await registrarIntentoCobro(admin, { paymentIntentId: params.paymentIntentId, studioId, reciboId, origen: 'off_session', desenlace: 'cobrado' });
    } else if (!r.ok && r.codigo === 'NO_COBRABLE') {
      await registrarIntentoCobro(admin, { paymentIntentId: params.paymentIntentId, studioId, reciboId, origen: 'off_session', desenlace: 'pendiente' });
    }
  }

  if (!r.ok) {
    // 'Recibo no encontrado' lo usa el webhook para detectar un cobro que
    // apunta a un recibo inexistente o de OTRO estudio.
    if (r.codigo === 'NO_ENCONTRADO') return { ok: false, error: 'Recibo no encontrado' };
    // DEVUELTO no se toca y, como siempre, no se pide reintento: queda
    // reportado por `confirmarCobro` si no era una simple reentrega. Igual con un
    // recibo ANULADO (el estudio lo perdonó al cancelar la cuota) o ya cobrado con
    // otro cargo/sin cargo registrado: el dinero entró, no se renueva ni se sella
    // nada, `confirmarCobro` ya avisó para devolverlo y reintentar no lo arregla.
    if (r.codigo === 'NO_COBRABLE' && (r.estado === 'DEVUELTO' || r.estado === 'ANULADO' || r.estado === 'COBRADO')) return { ok: true };
    return { ok: false, error: r.error };
  }

  // Ya COBRADO con este cargo. En TARJETA es el caso NORMAL —el webhook llega
  // para cada cargo y `cobrarReciboOffSession` ya lo cerró de forma síncrona—;
  // en SEPA, una reentrega. Se repara en silencio lo idempotente (la única red
  // si el proceso murió entre la transición y sus efectos) pero SIN email, que
  // no es idempotente y ya lo pidió quien ganó. El aviso al estudio, como
  // antes: la reentrega SEPA lo repetía (deduplicado por recibo), la de tarjeta
  // nunca lo emitió.
  if (r.transicion === 'ya_estaba') {
    await aplicarEfectosCobro(admin, {
      studioId, reciboId, metodo, origen: fuente, facturaId,
      avisarSocia: false, reparacion: true, notificar: metodo === 'SEPA',
    }, deps);
  }
  return { ok: true };
}

export type CierreOffSession = { aviso?: undefined; error?: undefined } | { aviso: 'COBRADO_SIN_PERSISTIR'; error: string };

/**
 * Cierre de `cobrarReciboOffSession` tras un `succeeded`: Stripe YA cobró. La
 * transición es un compare-and-set sobre lo que se comprobó antes de cobrar;
 * antes era un UPDATE sin filtro de estado y, si el recibo cambiaba entre medias
 * (lo cobraba el mostrador, lo cerraba el webhook), se pisaba sin enterarse
 * nadie.
 *
 * `avisarSocia: false` y sin aviso al estudio: este camino síncrono nunca los
 * ha enviado, y empezar ahora sería un cambio de producto, no un arreglo.
 *
 * Devuelve `COBRADO_SIN_PERSISTIR` cuando no pudo dejarlo cerrado —el llamante
 * NO debe darlo por hecho—. `ya_estaba` (el webhook de este mismo cargo llegó
 * antes) es un cierre correcto.
 */
export async function cerrarCobroOffSession(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; socioId: string; metodo: string; paymentIntentId: string },
  deps: Partial<DependenciasEfectos> = {},
): Promise<CierreOffSession> {
  const confirmado = await confirmarCobro(admin, {
    studioId: p.studioId, reciboId: p.reciboId, metodo: p.metodo,
    origen: 'off_session', paymentIntentId: p.paymentIntentId,
    avisarSocia: false, facturaId: facturaIdMetodoGuardado(p.reciboId, p.metodo),
  }, deps);
  if (confirmado.ok && confirmado.transicion !== 'devuelto') return {};

  const detalle = confirmado.ok ? 'el recibo figura devuelto con este cargo' : `${confirmado.codigo}: ${confirmado.error}`;
  // La idempotency key evita el doble cargo, pero el recibo quedaría sin
  // cerrar y podría reaparecer para cobro. No se traga.
  Sentry.captureException(new Error(`Cobro OK en Stripe pero no se pudo marcar el recibo COBRADO: ${detalle}`), {
    level: 'error',
    tags: { area: 'cobros', tipo: 'reconciliacion' },
    extra: { reciboId: p.reciboId, socioId: p.socioId, paymentIntentId: p.paymentIntentId },
  });
  return {
    aviso: 'COBRADO_SIN_PERSISTIR',
    error: 'El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.',
  };
}

/**
 * Reintenta el sellado de facturas de cobros ya confirmados pero cuyo sellado
 * falló (`factura_pendiente_sellar`), acotado a las últimas `horas` — nunca
 * retroactivo sin límite (ver cabecera del módulo). Lo llama el conciliador
 * horario; devuelve cuántas se sellaron.
 */
export async function reintentarFacturasPendientesDeSellar(
  admin: SupabaseClient,
  horas: number,
): Promise<number> {
  const desde = new Date(Date.now() - horas * 3600_000).toISOString();
  const { data: pendientes } = await admin
    .from('recibos')
    .select('id, studio_id, metodo_cobro, conciliado_por')
    .eq('factura_pendiente_sellar', true)
    .eq('estado', 'COBRADO')
    .gte('fecha_cobro', desde.slice(0, 10))
    .limit(200);
  if (!pendientes?.length) return 0;

  let selladas = 0;
  for (const rec of pendientes as { id: string; studio_id: string; metodo_cobro: string | null; conciliado_por: string | null }[]) {
    // El id del canal que lo intentó primero, no `fac-checkout-` para todos.
    const res = await sellarFacturaDeRecibo(admin, {
      studioId: rec.studio_id, reciboId: rec.id, facturaId: facturaIdParaReintento(rec),
    });
    if (res.ok) {
      await admin.from('recibos').update({ factura_pendiente_sellar: false })
        .eq('id', rec.id).eq('studio_id', rec.studio_id);
      selladas++;
    } else {
      Sentry.captureMessage('[reintentarFacturasPendientesDeSellar] sigue sin poder sellar', {
        level: 'warning', tags: { area: 'cobros', tipo: 'facturacion' },
        extra: { reciboId: rec.id, studioId: rec.studio_id, error: res.error },
      });
    }
  }
  return selladas;
}

// Auditoría 23ª pasada (4-sep-2026), P-3. Tercer gemelo del mismo bloque:
// las dos ramas de app/api/stripe/webhook/route.ts (checkout.session.completed
// y el checkout embebido/Modo B) ya consumían el código de descuento al
// entregar el plan; lib/inngest/conciliar-cobros.ts —la red de recuperación,
// el camino REAL en 4 de cada 6 cobros según su propia cabecera— no lo
// mencionaba en ninguna línea. Un código de un solo uso quedaba reutilizable
// indefinidamente cada vez que era el conciliador quien rescataba el cobro.
//
// Best-effort a propósito, igual que sus dos hermanas: el pago ya está
// cobrado y el plan ya entregado, así que un fallo aquí no puede tumbar el
// evento — pero sí queda en Sentry, porque un código que no se descuenta de
// su límite es un uso gratis que nadie contó.
//
// `consumir_codigo_descuento` no es idempotente por sí sola (solo protege
// contra concurrencia del POS, no contra un reintento del MISMO evento). El
// INSERT en `codigos_descuento_consumos` es el compare-and-set real: gana el
// primer intento, un reintento choca por PK (23505) y se salta el consumo
// sin sumar un uso de más — mismo criterio que `entregarPlanComprado`.
export async function consumirCodigoDescuentoSiAplica(
  admin: SupabaseClient,
  params: { codigoDescuentoId: string | null | undefined; reciboId: string; studioId: string; socioId: string; fuente: string },
): Promise<void> {
  const { codigoDescuentoId, reciboId, studioId, socioId, fuente } = params;
  if (!codigoDescuentoId) return;
  const { error: errMarcarConsumo } = await admin
    .from('codigos_descuento_consumos')
    .insert({ recibo_id: reciboId, codigo_id: codigoDescuentoId, socio_id: socioId });
  if (!errMarcarConsumo) {
    const { data: usosTras, error: errConsumo } = await admin.rpc('consumir_codigo_descuento', { p_codigo_id: codigoDescuentoId });
    if (errConsumo) {
      Sentry.captureMessage(`[${fuente}] plan entregado pero el código de descuento no se consumió`, {
        level: 'warning', tags: { area: 'cobros' },
        extra: { codigoDescuentoId, studioId, reciboId, detalle: String(errConsumo) },
      });
    } else if (usosTras == null) {
      // ⚠️ 26ª pasada. `consumir_codigo_descuento` es un `UPDATE … RETURNING
      // usos` con el tope y el `activo` en su propio WHERE: si el código se
      // agotó o se desactivó ENTRE la validación y el cobro, no da error —
      // simplemente no toca ninguna fila y devuelve NULL. Aquí se descartaba
      // `data`, así que el descuento ya estaba aplicado al importe cobrado y
      // el contador de usos no lo registraba nunca: el tope se rebasaba en
      // silencio y no quedaba ni rastro para reconstruirlo después.
      //
      // No se revierte el cobro a propósito —el dinero ya se movió y quitarle
      // el descuento a posteriori sería peor—, pero el estudio tiene que poder
      // enterarse de que su campaña se pasó del tope.
      Sentry.captureMessage(`[${fuente}] descuento aplicado sobre un código agotado o desactivado`, {
        level: 'warning', tags: { area: 'cobros' },
        extra: { codigoDescuentoId, studioId, reciboId },
      });
    }
  } else if (errMarcarConsumo.code === '23505') {
    // P-5 (26ª pasada): el mismo 23505 tiene ahora DOS causas distintas, y no
    // son lo mismo. La PK (`recibo_id`) es el reintento de siempre —este
    // mismo evento ya se procesó, no pasa nada—. El UNIQUE nuevo
    // (`codigo_id, socio_id`) es que esta socia YA había canjeado este
    // código en OTRO recibo: el descuento se calculó y se cobró igual (se
    // aplica ANTES del cobro, en resolverDescuentoCheckout), así que el
    // dinero ya se movió de menos — no se puede deshacer aquí, pero el
    // estudio tiene que enterarse, mismo criterio que el código agotado de
    // más abajo. Se distingue por el nombre del índice en el mensaje de
    // Postgres, igual que ya se hace con roturas conocidas en otros sitios.
    if (/codigos_descuento_consumos_codigo_socio_unq/i.test(errMarcarConsumo.message ?? '')) {
      Sentry.captureMessage(`[${fuente}] descuento aplicado dos veces a la misma socia`, {
        level: 'warning', tags: { area: 'cobros' },
        extra: { codigoDescuentoId, studioId, reciboId, socioId },
      });
    }
    // Choque por `recibo_id` (reintento del mismo evento): no es un error, no
    // se reporta nada — mismo criterio de siempre.
  } else {
    Sentry.captureMessage(`[${fuente}] no se pudo registrar el consumo del código de descuento`, {
      level: 'warning', tags: { area: 'cobros' },
      extra: { codigoDescuentoId, studioId, reciboId, detalle: String(errMarcarConsumo) },
    });
  }
}

// PAY-4: Registrar intento de cobro para auditoría y doble cobro detection
export async function registrarIntentoCobro(
  admin: SupabaseClient,
  params: {
    paymentIntentId: string;
    studioId: string;
    reciboId: string;
    origen: 'checkout' | 'off_session' | 'webhook' | 'manual';
    desenlace: 'cobrado' | 'fallido' | 'pendiente' | 'reintentando';
  },
): Promise<void> {
  // ⚠️ Auditoría 2026-09-23: esta función NUNCA puede lanzar. Desde PAY-2 se
  // llama también desde `cobrarReciboOffSession` y `confirmarCobroExitoso`,
  // es decir, DESPUÉS de que Stripe haya cobrado de verdad. Un rechazo de la
  // promesa (red caída al leer `recibos`, no un `error` devuelto) subiría al
  // catch del llamador y convertiría un cobro correcto en un fallo aparente,
  // con el dinero ya en la cuenta del estudio. Anotar el libro es importante;
  // no lo es tanto como no mentir sobre un cobro. Mismo criterio y mismo
  // motivo que el catch de `aplicarRenovacionServidor`.
  try {
    await registrarIntentoCobroInterno(admin, params);
  } catch (e) {
    try {
      Sentry.captureException(e instanceof Error ? e : new Error('no se pudo anotar el intento de cobro'), {
        level: 'error', tags: { area: 'cobros', tipo: 'auditoria-cobros' },
        extra: { ...params },
      });
    } catch { /* el aviso es best-effort; no lanzar, no */ }
  }
}

async function registrarIntentoCobroInterno(
  admin: SupabaseClient,
  params: Parameters<typeof registrarIntentoCobro>[1],
): Promise<void> {
  const { paymentIntentId, studioId, reciboId, origen, desenlace } = params;
  const { data: recibo, error: errorRecibo } = await admin.from('recibos')
    .select('importe').eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
  if (!recibo) {
    // Un intento de cobro sin fila en el libro es exactamente lo que este libro
    // existe para evitar. Que el recibo no aparezca no es «nada que anotar»:
    // o el id no es de este estudio, o la lectura falló.
    Sentry.captureMessage('[registrarIntentoCobro] intento de cobro SIN anotar: no se resolvió el recibo', {
      level: 'warning', tags: { area: 'cobros', tipo: 'auditoria-cobros' },
      extra: { paymentIntentId, reciboId, studioId, origen, desenlace, error: errorRecibo?.message },
    });
    return;
  }

  // ⚠️ Auditoría 2026-09-22: era un `insert` plano que se tragaba el 23505 como
  // «idempotencia funcionando». Desde que el mismo PaymentIntent puede anotarse
  // dos veces (primero 'pendiente' si el recibo no era cobrable en ese instante,
  // luego 'cobrado' cuando sí lo marca), tragarse el choque dejaba el libro
  // diciendo 'pendiente' de un cargo que SÍ se cobró — justo el dato con el que
  // se contesta a «me habéis cobrado dos veces». La tabla ya se diseñó para
  // esto: tiene `actualizado_en` y policy de UPDATE para `service_role`.
  // ⚠️ Auditoría 2026-09-23 (PAY-1): el upsert del 22-sep es SIMÉTRICO, y la
  // transición que de verdad ocurre en el camino normal es la INVERSA de la
  // que se quería permitir. `confirmarCobroRecibo` acota su UPDATE con
  // `.in('estado', [...ESTADOS_COBRABLES, 'EN_CURSO'])`, y COBRADO no está en
  // esa lista: la SEGUNDA entrega del mismo evento (reenvío desde el Dashboard,
  // carrera con el conciliador, expiración de la reclamación de idempotencia a
  // los 120 s) cae siempre en la rama `if (!marcado)` y escribe 'pendiente'
  // encima del 'cobrado' que la primera entrega dejó. El libro que existe para
  // contestar «me habéis cobrado dos veces» acababa diciendo 'pendiente' de
  // cargos que sí se cobraron — la regresión exacta del arreglo M-1.
  //
  // Precedencia explícita: 'cobrado' y 'fallido' son DESENLACES FIRMES y
  // pisan lo que hubiera; 'pendiente' y 'reintentando' son estados de tránsito
  // y solo se anotan si no hay ya una fila para ese PaymentIntent. Así la
  // transición 'pendiente' → 'cobrado' sigue funcionando (que es lo que M-1
  // necesitaba) y la inversa deja de ser posible.
  const esDesenlaceFirme = desenlace === 'cobrado' || desenlace === 'fallido';
  const { error } = await admin.from('cobros_intentos').upsert({
    payment_intent_id: paymentIntentId,
    studio_id: studioId,
    recibo_id: reciboId,
    // ⚠️ Auditoría 2026-09-21: aquí iba `recibo.importe` a pelo, y
    // `recibos.importe` son EUROS (`numeric`) mientras la columna es
    // `importe_centimos integer`. Un recibo de 85,50 € se anotaba como `86`
    // (Postgres redondea numeric→int): el libro que existe para contestar «me
    // habéis cobrado dos veces» guardaba importes 100× menores y redondeados,
    // justo el dato con el que se compara un doble cargo. La conversión es la
    // misma que ya hacen el webhook y `cobrarReciboOffSession`.
    importe_centimos: Math.round(Number(recibo.importe) * 100),
    origen,
    desenlace,
  }, { onConflict: 'payment_intent_id', ignoreDuplicates: !esDesenlaceFirme });

  // ⚠️ El fallo NO se traga (auditoría 2026-09-19).
  //
  // Aquí había un `.then(() => {}).catch(() => {})` que, además de no
  // compilar (`PromiseLike<void>` no tiene `.catch` → TS2339, y con él caía
  // el build entero), silenciaba cualquier error de escritura. La tabla
  // `cobros_intentos` NO EXISTÍA en producción —su migración figuraba como
  // aplicada pero nunca llegó a crearla—, así que este insert fallaba
  // siempre y nadie se enteró: el libro que contesta a «me habéis cobrado
  // dos veces» llevaba días vacío aparentando funcionar.
  //
  // El 23505 sigue tolerándose por si acaso (una carrera con otro escritor que
  // no pase por el `onConflict`), pero desde que esto es un upsert ya no es el
  // camino normal: un reintento del webhook con el mismo intent ACTUALIZA la
  // fila en vez de chocar.
  if (error && error.code !== '23505') {
    Sentry.captureMessage('[registrarIntentoCobro] no se pudo anotar el intento de cobro', {
      level: 'error', tags: { area: 'cobros', tipo: 'auditoria-cobros' },
      extra: { paymentIntentId, reciboId, studioId, origen, desenlace, error: error.message, code: error.code },
    });
  }
}
