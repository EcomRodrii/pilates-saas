// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — emisores de dominio (server-only).
//
// Azúcar para que los módulos de negocio publiquen eventos en UNA línea sin
// preocuparse de reunir las variables de plantilla. Cada emisor reúne los datos
// de display (clase, cuándo, socia, importe…) y llama a `publish` (engine.ts).
// TODO best-effort: envuelto en try/catch; una notificación jamás rompe el negocio.
//
// (Optimización futura: sacar la reunión de variables del hilo del request. Para
// miles/día esto ya es suficiente.)
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { publish } from './engine.ts';
import { EVENTOS } from './catalog.ts';
import { cuandoEstudio, horaEstudio, fechaCortaEstudio, TZ_ESTUDIO } from '@/lib/utils';

function cuandoLargo(iso: string): string {
  try {
    return cuandoEstudio(new Date(iso));
  } catch { return ''; }
}

// Reúne los datos comunes de una sesión (clase, cuándo, sala, slug del estudio).
async function ctxSesion(admin: SupabaseClient, studioId: string, sesionId: string) {
  const { data: ses } = await admin.from('sesiones')
    .select('inicio, tipo_clase_id, sala_id').eq('id', sesionId).maybeSingle();
  const [{ data: tipo }, { data: studio }, { data: sala }] = await Promise.all([
    ses?.tipo_clase_id ? admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('studios').select('slug').eq('id', studioId).maybeSingle(),
    ses?.sala_id ? admin.from('salas').select('nombre').eq('id', ses.sala_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    clase: (tipo?.nombre as string | null) ?? 'tu clase',
    cuando: ses?.inicio ? cuandoLargo(ses.inicio as string) : '',
    slug: (studio?.slug as string | null) ?? '',
    sala: sala?.nombre ? ` en ${sala.nombre}` : '',
    sesionId,
  };
}

// Reserva creada: avisa a la socia (confirmada / lista de espera) y, si queda
// confirmada, a la propietaria (nueva inscripción).
export async function emitirReserva(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; socioId: string; estado: 'CONFIRMADA' | 'LISTA_ESPERA' },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: socio } = await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle();
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'Una clienta';
    const base = { ...ctx, socioId: p.socioId, socia };
    const dedup = `reserva:${p.sesionId}:${p.socioId}:${p.estado}`;

    if (p.estado === 'CONFIRMADA') {
      await publish({ type: EVENTOS.RESERVA_CONFIRMADA, studioId: p.studioId, data: base, resource: { type: 'sesion', id: p.sesionId }, dedupKey: dedup });
      await publish({ type: EVENTOS.RESERVA_CREADA, studioId: p.studioId, data: base, resource: { type: 'sesion', id: p.sesionId }, dedupKey: `${dedup}:owner` });
    } else {
      await publish({ type: EVENTOS.RESERVA_LISTA_ESPERA, studioId: p.studioId, data: base, resource: { type: 'sesion', id: p.sesionId }, dedupKey: dedup });
    }
  } catch (e) {
    console.error('[notifications] emitirReserva:', e instanceof Error ? e.message : e);
  }
}

// Fase 8 "Booking Experience Engine" (CRO): la visitante ya identificada
// dejó algo a medias en el widget. `sesionId` opcional: viene de "cerró el
// modal de reserva ya iniciado" (con clase concreta) — falta en "canceló el
// pago en Stripe" (compra de plan, sin sesión de clase asociada). Un solo
// dedupKey por sesión de clase/socia/día evita reabrir el modal y volver a
// cerrarlo mande dos correos; sin sesionId, por socia/día (una vez basta).
// Es también el mitigante REAL del endpoint público sin JWT que dispara
// esto (app/api/public/evento/route.ts): pase lo que pase con el rate
// limit, nadie recibe más de un email por día por este camino — revisado
// explícitamente por tentare-seguridad (docs/cro-analytics-widget-diseno.md §5.2).
export async function emitirReservaAbandonada(
  admin: SupabaseClient,
  p: { studioId: string; socioId: string; sesionId?: string | null },
): Promise<void> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    let claseTexto = '';
    if (p.sesionId) {
      const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
      claseTexto = ` una plaza en ${ctx.clase} (${ctx.cuando})`;
    }
    // Fecha LOCAL del estudio, no UTC (auditoría de esta sesión): con
    // `toISOString()` el "día" cambiaba a medianoche UTC en vez de a
    // medianoche en España, dejando una ventana de ~1-2h cada noche sin la
    // única defensa real de este endpoint sin JWT (comentario de arriba) —
    // mismo idiom ya usado en portal-sugerencias.ts/agenda.ts.
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ_ESTUDIO });
    const dedup = p.sesionId
      ? `reserva-abandonada:${p.sesionId}:${p.socioId}:${hoy}`
      : `reserva-abandonada:${p.socioId}:${hoy}`;
    await publish({
      type: EVENTOS.RESERVA_ABANDONADA, studioId: p.studioId,
      data: { slug: (studio?.slug as string | null) ?? '', socioId: p.socioId, claseTexto },
      resource: { type: 'socio', id: p.socioId },
      dedupKey: dedup,
    });
  } catch (e) {
    console.error('[notifications] emitirReservaAbandonada:', e instanceof Error ? e.message : e);
  }
}

// Reserva cancelada: confirmación a la socia. Importa sobre todo cuando la
// cancela el SISTEMA (corte por no confirmar riesgo de plantón, o Fase 2a:
// rechazo/expiración de una aprobación pendiente): si no, se encuentra sin
// plaza sin saber por qué. Prioridad BAJA y solo in-app.
//
// `motivo`: por defecto la cancelación normal (texto de siempre, sin
// añadido). Fase 2a reutiliza este mismo evento para el resultado de una
// aprobación pendiente en vez de crear uno nuevo — mismo hecho (la reserva no
// sigue adelante), solo cambia por qué se lo explicamos. Fase 2b añade
// 'oferta_caducada' — historia de negocio DISTINTA de 'expirada' (esa es "la
// clase ya ha empezado", esta es "no aceptaste la plaza liberada a tiempo").
export async function emitirReservaCancelada(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; socioId: string; reservaId: string; motivo?: 'rechazada' | 'expirada' | 'oferta_caducada' | 'plaza_ya_ocupada' | 'clase_ya_empezada' | 'clase_cancelada' },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const motivoTexto = p.motivo === 'rechazada'
      ? ' La propietaria no ha podido confirmarla.'
      : p.motivo === 'expirada'
        ? ' No se aprobó a tiempo: la clase ya ha empezado.'
        : p.motivo === 'oferta_caducada'
          ? ' No aceptaste la plaza a tiempo y se ha ofrecido a la siguiente en la lista.'
          // Aceptó dentro de plazo, pero la plaza ya no estaba: mientras su
          // oferta seguía viva, otra persona reservó el hueco por la vía normal
          // (una reserva en LISTA_ESPERA no ocupa aforo). No es culpa suya, así
          // que el texto no puede sonar a que llegó tarde — y se le compensa con
          // una recuperación, que es lo que menciona el final de la frase.
          : p.motivo === 'plaza_ya_ocupada'
            ? ' La plaza se ocupó justo antes de que aceptaras. Te hemos guardado una recuperación para otra clase.'
            : p.motivo === 'clase_ya_empezada'
              ? ' La clase ya había empezado cuando aceptaste. Te hemos guardado una recuperación para otra clase.'
              // El estudio canceló la clase mientras su oferta seguía viva
              // (migr 20260829120000: la RPC ya no la deja confirmar sobre una
              // clase cancelada). Tampoco es culpa suya: misma compensación.
              : p.motivo === 'clase_cancelada'
                ? ' El estudio canceló la clase. Te hemos guardado una recuperación para otra clase.'
                : '';
    await publish({
      type: EVENTOS.RESERVA_CANCELADA, studioId: p.studioId,
      data: { ...ctx, socioId: p.socioId, motivoTexto },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `reserva-cancelada:${p.reservaId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirReservaCancelada:', e instanceof Error ? e.message : e);
  }
}

// Plaza fija no materializada: el cron nocturno (materializar-plazas) no ha
// podido generar la reserva de esta semana para "tu reformer fijo". dedupKey
// por (sesión, socia) — con el UNIQUE(studio_id, dedup_key) del motor, cada
// semana que falla genera como mucho un aviso, para siempre, sin necesidad de
// un "último periodo avisado" tipo Fase 2b de gestoría.
export async function emitirPlazaFijaNoMaterializada(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; socioId: string; motivo: 'sesion_cancelada' | 'suscripcion_pausada' | 'sin_aforo' },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const motivoTexto = p.motivo === 'sesion_cancelada'
      ? ' Esa clase está cancelada esta semana.'
      : p.motivo === 'suscripcion_pausada'
        ? ' Tu suscripción está en pausa, así que no la hemos reservado por ti.'
        : ' Esta semana está completa — resérvala manualmente si quieres entrar en lista de espera.';
    await publish({
      type: EVENTOS.RESERVA_PLAZA_FIJA_NO_MATERIALIZADA, studioId: p.studioId,
      data: { ...ctx, socioId: p.socioId, motivoTexto },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `plaza-fija-no-materializada:${p.sesionId}:${p.socioId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPlazaFijaNoMaterializada:', e instanceof Error ? e.message : e);
  }
}

// Reserva pendiente de aprobar: avisa al mostrador (propietaria/manager/
// recepción) de que hace falta decidir antes de que empiece la clase.
export async function emitirReservaPendienteAprobacion(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; socioId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: socio } = await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle();
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'Una clienta';
    await publish({
      type: EVENTOS.RESERVA_PENDIENTE_APROBACION, studioId: p.studioId,
      data: { ...ctx, socioId: p.socioId, socia },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `reserva-pendiente:${p.sesionId}:${p.socioId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirReservaPendienteAprobacion:', e instanceof Error ? e.message : e);
  }
}

// I-3: pagado por el checkout embebido pero la clase concreta no se pudo
// reservar — avisa al mostrador para que lo resuelva a mano con la socia.
//
// `situacion` cubre los TRES momentos en que ese hecho es cierto, con un solo
// evento (ver el comentario de sus plantillas en catalog.ts):
//  · 'sin-reserva' — reservarPlazaTrasPagoPublico devolvió !ok: no hay fila en
//    `reservas` (clase cancelada, ya empezada, o llena sin lista de espera).
//  · 'en-espera'   — devolvió ok con estado LISTA_ESPERA: la reserva existe,
//    pero la clase se llenó entre crear el PaymentIntent y confirmar el pago.
//    Desde el panel es indistinguible de quien se apuntó a la cola por gusto,
//    y aquí hay dinero cobrado: el mostrador tiene que saberlo HOY.
//  · 'cerrada'     — la clase pasó y nunca se liberó sitio (barrido diario).
//
// ⚠️ dedupKey PROPIA por situación: `uq_notification_dedup` es un UNIQUE
// permanente, así que si 'cerrada' reusara la clave de 'en-espera' el segundo
// aviso —el que de verdad pide una decisión— se descartaría en silencio.
export type SituacionPagadaSinPlaza = 'sin-reserva' | 'en-espera' | 'cerrada';

const SITUACION_PAGADA_SIN_PLAZA: Record<SituacionPagadaSinPlaza, { texto: string; dedup: string }> = {
  'sin-reserva': {
    texto: ' pero no se pudo confirmar su plaza.',
    dedup: 'reserva-pagada-sin-plaza',
  },
  'en-espera': {
    texto: ' y se quedó en lista de espera: la clase se llenó justo antes de confirmarla. Su crédito está intacto.',
    dedup: 'reserva-pagada-en-espera',
  },
  cerrada: {
    texto: ' y nunca llegó a liberarse sitio. Su pago sigue en su cuenta sin usar.',
    dedup: 'espera-sin-plaza-cerrada',
  },
};

export async function emitirReservaPagadaSinPlaza(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; socioId: string; situacion?: SituacionPagadaSinPlaza },
): Promise<void> {
  try {
    const situacion = p.situacion ?? 'sin-reserva';
    const { texto, dedup } = SITUACION_PAGADA_SIN_PLAZA[situacion];
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: socio } = await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle();
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'Una clienta';
    await publish({
      type: EVENTOS.RESERVA_PAGADA_SIN_PLAZA, studioId: p.studioId,
      // `cerrada` decide el deepLink de la plantilla: con la clase ya pasada lo
      // útil es su ficha (ahí está el botón de devolver el recibo), no el
      // calendario de una clase a la que ya no puede ir.
      data: { ...ctx, socioId: p.socioId, socia, situacion: texto, cerrada: situacion === 'cerrada' },
      resource: { type: 'sesion', id: p.sesionId },
      // Sin dedup por paymentIntentId a propósito: si el webhook reintenta el
      // MISMO evento no debe duplicarse, y no hay más de un pago por
      // (sesión, socia) en este camino — reservarPlazaTrasPagoPublico ya lo
      // impide (mismo criterio que emitirReservaPendienteAprobacion).
      dedupKey: `${dedup}:${p.sesionId}:${p.socioId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirReservaPagadaSinPlaza:', e instanceof Error ? e.message : e);
  }
}

// Plaza liberada: a la socia promovida de la lista de espera.
export async function emitirPlazaLiberada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; socioId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.RESERVA_PLAZA_LIBERADA, studioId: p.studioId,
      data: { ...ctx, socioId: p.socioId }, resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `plaza-liberada:${p.sesionId}:${p.socioId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPlazaLiberada:', e instanceof Error ? e.message : e);
  }
}

// Fase 2b: oferta de plaza de lista de espera — avisa a la socia que le toca
// (mismo turno que hoy sería confirmación instantánea si el estudio no
// exigiera plazo) que tiene hasta `expiraEn` para aceptar.
export async function emitirOfertaListaEspera(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; socioId: string; expiraEn: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const hora = horaEstudio(p.expiraEn);
    await publish({
      type: EVENTOS.RESERVA_OFERTA_LISTA_ESPERA, studioId: p.studioId,
      data: { ...ctx, socioId: p.socioId, hora },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `oferta-espera:${p.sesionId}:${p.socioId}:${p.expiraEn}`,
    });
  } catch (e) {
    console.error('[notifications] emitirOfertaListaEspera:', e instanceof Error ? e.message : e);
  }
}

// Pago fallido: a la propietaria y a la socia afectada.
export async function emitirPagoFallido(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<void> {
  try {
    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id').eq('id', p.reciboId).maybeSingle();
    if (!recibo) return;
    const { data: socio } = recibo.socio_id
      ? await admin.from('socios').select('nombre, apellidos').eq('id', recibo.socio_id).maybeSingle()
      : { data: null };
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.PAGO_FALLIDO, studioId: p.studioId,
      data: {
        concepto: recibo.concepto ?? 'una cuota', importe: recibo.importe,
        socia: `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'una clienta',
        socioId: recibo.socio_id, slug: (studio?.slug as string | null) ?? '',
      },
      resource: { type: 'recibo', id: p.reciboId },
      dedupKey: `pago-fallido:${p.reciboId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPagoFallido:', e instanceof Error ? e.message : e);
  }
}

// Fase 3: cargo de penalización ya cobrado — a la socia. Sin EMAIL en el
// catálogo a propósito: el recibo (ReciboEmail) ya se manda por separado con
// el mismo concepto/importe.
export async function emitirPagoPenalizacion(
  admin: SupabaseClient, p: { studioId: string; socioId: string; importe: number; penalizacionId: string },
): Promise<void> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.PAGO_PENALIZACION, studioId: p.studioId,
      data: { importe: p.importe, socioId: p.socioId, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'socio', id: p.socioId },
      dedupKey: `pago-penalizacion:${p.penalizacionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPagoPenalizacion:', e instanceof Error ? e.message : e);
  }
}

// Fase 3: el guard de consentimiento (o cualquier otro motivo futuro) bloqueó
// un cobro de penalización — a la propietaria, accionable por su parte.
export async function emitirPenalizacionBloqueada(
  admin: SupabaseClient, p: { studioId: string; socioId: string; motivo: 'consentimiento'; importe?: number; penalizacionId: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.PAGO_PENALIZACION_BLOQUEADA, studioId: p.studioId,
      data: { socioId: p.socioId, importe: p.importe ?? 0 },
      resource: { type: 'socio', id: p.socioId },
      dedupKey: `pago-penalizacion-bloqueada:${p.penalizacionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPenalizacionBloqueada:', e instanceof Error ? e.message : e);
  }
}

// Se ha devuelto dinero (reembolso total o parcial) o se ha perdido una
// disputa. Lo accionable NO es el dinero —ya se movió en Stripe pase lo que
// pase— sino que la socia conserva lo que se le entregó (el bono recargado, el
// mes extendido) hasta que alguien lo revise.
//
// `dedupKey` por DEVOLUCIÓN y no por recibo: un mismo cobro puede tener dos
// reembolsos parciales, o un parcial y luego un chargeback, y cada uno es un
// hecho que hay que contar.
export async function emitirDevolucion(
  admin: SupabaseClient,
  p: {
    studioId: string; socioId: string | null; devolucionId: string;
    importe: number; origen: 'REEMBOLSO_TOTAL' | 'REEMBOLSO_PARCIAL' | 'CHARGEBACK';
  },
): Promise<void> {
  try {
    const { data: socio } = p.socioId
      ? await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle()
      : { data: null };
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'una clienta';
    const esChargeback = p.origen === 'CHARGEBACK';
    await publish({
      type: esChargeback ? EVENTOS.PAGO_CHARGEBACK_PERDIDO : EVENTOS.PAGO_DEVUELTO,
      studioId: p.studioId,
      data: {
        importe: p.importe, socia, socioId: p.socioId,
        // Solo se nombra cuando es parcial: en una devolución normal, decir
        // "(total)" es ruido.
        tipoTexto: p.origen === 'REEMBOLSO_PARCIAL' ? ' (devolución parcial)' : '',
      },
      resource: { type: 'devolucion', id: p.devolucionId },
      dedupKey: `devolucion:${p.devolucionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirDevolucion:', e instanceof Error ? e.message : e);
  }
}

// P-2 (17ª auditoría): reembolso de una venta de POS (datáfono/Bizum
// presencial). `socioId` es `null` con normalidad — la mayoría de ventas de
// mostrador son anónimas, sin ficha ligada.
export async function emitirVentaPosDevuelta(
  admin: SupabaseClient,
  p: { studioId: string; socioId: string | null; ventaPosId: string; importe: number },
): Promise<void> {
  try {
    const { data: socio } = p.socioId
      ? await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle()
      : { data: null };
    const nombre = socio ? `${socio.nombre ?? ''} ${socio.apellidos ?? ''}`.trim() : '';
    await publish({
      type: EVENTOS.VENTA_POS_DEVUELTA,
      studioId: p.studioId,
      data: { importe: p.importe, deQuien: nombre ? ` a ${nombre}` : '' },
      resource: { type: 'venta_pos', id: p.ventaPosId },
      dedupKey: `venta_pos_devuelta:${p.ventaPosId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirVentaPosDevuelta:', e instanceof Error ? e.message : e);
  }
}

// D-8: la devolución FALLÓ días después de crearse — la clienta NO recibió el
// dinero. `dedupKey` por refund.id: los DOS tipos de evento de Stripe
// (`refund.failed` y `charge.refund.updated`) llegan con event.id distintos y
// la reclamación de idempotencia no los dedupea entre sí — el dedupKey sí.
export async function emitirDevolucionFallida(
  admin: SupabaseClient,
  p: {
    studioId: string; socioId: string | null; reciboId: string; refundId: string;
    importe: number; sesionesTexto: string;
  },
): Promise<void> {
  try {
    const { data: socio } = p.socioId
      ? await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle()
      : { data: null };
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'una clienta';
    await publish({
      type: EVENTOS.PAGO_DEVOLUCION_FALLIDA,
      studioId: p.studioId,
      data: { importe: p.importe, socia, socioId: p.socioId, sesionesTexto: p.sesionesTexto },
      resource: { type: 'recibo', id: p.reciboId },
      dedupKey: `devolucion-fallida:${p.refundId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirDevolucionFallida:', e instanceof Error ? e.message : e);
  }
}

// Disputa/chargeback de Stripe: el cargo ya se había cobrado y ahora la
// socia lo impugna ante su banco. `plazoUnix` es evidence_details.due_by de
// Stripe (segundos epoch, puede venir null si Stripe aún no lo ha fijado).
export async function emitirPagoDisputado(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; plazoUnix: number | null },
): Promise<void> {
  try {
    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id').eq('id', p.reciboId).maybeSingle();
    if (!recibo) return;
    const { data: socio } = recibo.socio_id
      ? await admin.from('socios').select('nombre, apellidos').eq('id', recibo.socio_id).maybeSingle()
      : { data: null };
    const plazo = p.plazoUnix
      ? fechaCortaEstudio(new Date(p.plazoUnix * 1000))
      : 'la fecha que indique Stripe';
    await publish({
      type: EVENTOS.PAGO_DISPUTADO, studioId: p.studioId,
      data: {
        concepto: recibo.concepto ?? 'una cuota', importe: recibo.importe,
        socia: `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'una clienta',
        socioId: recibo.socio_id, plazo,
      },
      resource: { type: 'recibo', id: p.reciboId },
      // Una disputa por recibo (Stripe no reabre la misma dos veces).
      dedupKey: `pago-disputado:${p.reciboId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPagoDisputado:', e instanceof Error ? e.message : e);
  }
}

// Clase casi llena (≥90% del aforo): a la propietaria. Dirigido por evento (al
// crear una reserva), no por cron. Dedup por sesión → un aviso por clase.
export async function emitirClaseCasiLlena(
  admin: SupabaseClient, p: { studioId: string; sesionId: string },
): Promise<void> {
  try {
    const { data: ses } = await admin.from('sesiones').select('aforo_maximo').eq('id', p.sesionId).maybeSingle();
    const aforo = Number(ses?.aforo_maximo ?? 0);
    if (aforo <= 0) return;
    const { count } = await admin.from('reservas')
      .select('id', { count: 'exact', head: true })
      .eq('sesion_id', p.sesionId).eq('estado', 'CONFIRMADA');
    const ocupadas = count ?? 0;
    const pct = Math.round((ocupadas / aforo) * 100);
    if (pct < 90) return;
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.CLASE_CASI_LLENA, studioId: p.studioId,
      data: { ...ctx, ocupadas, aforo, porcentaje: pct },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `casi-llena:${p.sesionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirClaseCasiLlena:', e instanceof Error ? e.message : e);
  }
}

// Autoservicio de instructora (20260731100000): se ha creado a sí misma una
// clase nueva. Solo informativa para la propietaria — sin push/email
// (declarado así en el catálogo), visible en su centro de notificaciones.
export async function emitirClaseCreadaPorInstructor(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; instructorId: string },
): Promise<void> {
  try {
    const [ctx, { data: instructora }] = await Promise.all([
      ctxSesion(admin, p.studioId, p.sesionId),
      admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle(),
    ]);
    await publish({
      type: EVENTOS.CLASE_CREADA_POR_INSTRUCTOR, studioId: p.studioId,
      data: { ...ctx, instructora: (instructora?.nombre as string | null) ?? 'Una instructora' },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `clase-creada-instructor:${p.sesionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirClaseCreadaPorInstructor:', e instanceof Error ? e.message : e);
  }
}

// Clase cancelada: a cada socia apuntada. Lo usa la cancelación desde el
// calendario (vía ruta), además del flujo de sustituciones (avisarAlumnas).
export async function emitirClaseCancelada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      // ctx entero (incluye sesionId): la audiencia 'socias-de-la-sesion' lo lee
      // de data. Sin él no resolvía a nadie y el aviso se perdía en silencio.
      type: EVENTOS.CLASE_CANCELADA, studioId: p.studioId,
      data: { ...ctx },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `clase-cancelada:${p.sesionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirClaseCancelada:', e instanceof Error ? e.message : e);
  }
}

// Clase modificada (cambio de horario/sala) → socias apuntadas. Recibe los datos
// de display YA formateados desde el cliente (con los valores NUEVOS), para no
// depender de que la escritura optimista haya llegado a la BD al leer la sesión.
// Devuelve a cuántas SOCIAS se ha avisado de verdad (la instructora entrante
// también recibe aviso, pero no cuenta: quien pregunta es la dueña y lo que
// quiere saber es cuántas alumnas se han enterado).
export async function emitirClaseModificada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; clase: string; cuando: string; sala: string; instructora?: string },
): Promise<number> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    // La socia ve la nueva instructora en el cuerpo ({sala}{instructora}); vacío
    // si no cambió. Con separador para no pegarla a la sala.
    const instructoraTxt = p.instructora ? ` · con ${p.instructora}` : '';
    const creadas = await publish({
      type: EVENTOS.CLASE_MODIFICADA, studioId: p.studioId,
      data: { clase: p.clase, cuando: p.cuando, sala: p.sala, sesionId: p.sesionId, instructora: instructoraTxt, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'sesion', id: p.sesionId },
      // La instructora entra en la clave: si solo cambia ella (misma hora y sala),
      // sin esto el aviso se descartaría como duplicado del cambio anterior.
      dedupKey: `clase-modificada:${p.sesionId}:${p.cuando}:${p.sala}:${p.instructora ?? ''}`,
    });
    return creadas.filter(c => c.destinatario.role === 'SOCIA').length;
  } catch (e) {
    console.error('[notifications] emitirClaseModificada:', e instanceof Error ? e.message : e);
    return 0;
  }
}

// Pago realizado: a la socia (confirmación de cobro).
export async function emitirPagoRealizado(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<void> {
  try {
    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id').eq('id', p.reciboId).maybeSingle();
    if (!recibo?.socio_id) return;
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.PAGO_REALIZADO, studioId: p.studioId,
      data: { concepto: recibo.concepto ?? 'tu cuota', importe: recibo.importe, socioId: recibo.socio_id, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'recibo', id: p.reciboId },
      dedupKey: `pago-ok:${p.reciboId}`,
    });
    // Al mostrador: el aviso de "ha entrado dinero" (toast+cha-ching en tiempo
    // real de la campana). Mismo recibo, evento propio — ver comentario del
    // catálogo (VENTA_REGISTRADA) sobre por qué no es la misma regla que la de
    // arriba.
    const { data: socio } = await admin.from('socios').select('nombre, apellidos').eq('id', recibo.socio_id).maybeSingle();
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'Una clienta';
    await publish({
      type: EVENTOS.VENTA_REGISTRADA, studioId: p.studioId,
      data: { concepto: recibo.concepto ?? 'una compra', importe: recibo.importe, socia },
      resource: { type: 'recibo', id: p.reciboId },
      dedupKey: `venta:${p.reciboId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPagoRealizado:', e instanceof Error ? e.message : e);
  }
}

// Bono agotado: a la socia (ha usado la última sesión → renovar).
export async function emitirBonoAgotado(
  admin: SupabaseClient, p: { studioId: string; socioId: string; plan: string; suscripcionId: string },
): Promise<void> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.BONO_AGOTADO, studioId: p.studioId,
      data: { plan: p.plan, socioId: p.socioId, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'suscripcion', id: p.suscripcionId },
      dedupKey: `bono-agotado:${p.suscripcionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirBonoAgotado:', e instanceof Error ? e.message : e);
  }
}

// La instructora avisa de que no puede dar una clase (baja desde su enlace):
// la dueña se entera al instante, no al abrir el panel.
export async function emitirInstructoraBaja(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; instructorId: string | null; motivo?: string | null; sustitucionId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: instr } = p.instructorId
      ? await admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle()
      : { data: null };
    await publish({
      type: EVENTOS.INSTRUCTORA_BAJA, studioId: p.studioId,
      data: {
        ...ctx,
        instructora: (instr?.nombre as string | null) ?? 'Una instructora',
        motivo: p.motivo ? ` (${p.motivo})` : '',
      },
      resource: { type: 'sustitucion', id: p.sustitucionId },
      dedupKey: `instructora-baja:${p.sustitucionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirInstructoraBaja:', e instanceof Error ? e.message : e);
  }
}

// Ausencia programada de una instructora (vacaciones / baja médica / otro).
// Lo accionable no es la ausencia en sí, sino cuántas clases suyas quedan dentro
// del periodo: eso es lo que la dueña tiene que cubrir.
const TIPO_AUSENCIA: Record<string, string> = {
  VACACIONES: 'vacaciones', BAJA_MEDICA: 'baja médica', OTRO: 'ausencia',
};

export async function emitirInstructoraAusencia(
  admin: SupabaseClient,
  p: {
    studioId: string; ausenciaId: string; instructora: string;
    tipo: string; desde: string; hasta: string; clasesAfectadas: number;
  },
): Promise<void> {
  try {
    const fecha = (iso: string) => fechaCortaEstudio(new Date(`${iso}T12:00:00Z`));
    await publish({
      type: EVENTOS.INSTRUCTORA_AUSENCIA, studioId: p.studioId,
      data: {
        instructora: p.instructora,
        tipoTexto: TIPO_AUSENCIA[p.tipo] ?? 'ausencia',
        desde: fecha(p.desde), hasta: fecha(p.hasta),
        clases: p.clasesAfectadas > 0
          ? ` · ${p.clasesAfectadas} ${p.clasesAfectadas === 1 ? 'clase suya' : 'clases suyas'} en esas fechas por cubrir`
          : '',
      },
      resource: { type: 'ausencia', id: p.ausenciaId },
      dedupKey: `ausencia:${p.ausenciaId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirInstructoraAusencia:', e instanceof Error ? e.message : e);
  }
}

// Sustitución rechazada: la candidata dice que no → la dueña debe elegir a otra.
// `siguiente` es la frase que cierra el aviso, y la decide quien llama porque
// depende del modo de autonomía: en asistido le toca buscar a ella, en autónomo
// el motor ya ha preguntado a la siguiente y solo se le está contando.
export async function emitirSustitucionRechazada(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; instructorId: string; sustitucionId: string; siguiente: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: instr } = await admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle();
    await publish({
      type: EVENTOS.SUSTITUCION_RECHAZADA, studioId: p.studioId,
      data: { ...ctx, instructora: (instr?.nombre as string | null) ?? 'Una instructora', siguiente: p.siguiente },
      resource: { type: 'sustitucion', id: p.sustitucionId },
      dedupKey: `sustitucion-rechazada:${p.sustitucionId}:${p.instructorId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirSustitucionRechazada:', e instanceof Error ? e.message : e);
  }
}

// Stripe desconectado: se han parado los cobros → CRÍTICA para la dueña.
export async function emitirStripeDesconectado(
  admin: SupabaseClient, p: { studioId: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.SISTEMA_STRIPE_DESCONECTADO, studioId: p.studioId,
      data: {},
      resource: { type: 'studio', id: p.studioId },
      // Sin fecha en la clave: si se desconecta y reconecta varias veces, cada
      // desconexión debe volver a avisar → se usa el instante del evento.
      dedupKey: `stripe-off:${p.studioId}:${new Date().toISOString().slice(0, 13)}`,
    });
  } catch (e) {
    console.error('[notifications] emitirStripeDesconectado:', e instanceof Error ? e.message : e);
  }
}

// Los emails a clientas están fallando. Un aviso AL DÍA por estudio (dedupKey por
// fecha): el dato accionable es "hoy falla el correo", no 50 copias.
export async function emitirEmailFallido(
  admin: SupabaseClient, p: { studioId: string; error: string },
): Promise<void> {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    await publish({
      type: EVENTOS.SISTEMA_EMAIL_FALLIDO, studioId: p.studioId,
      data: { error: p.error.slice(0, 200) },
      dedupKey: `email-fallido:${p.studioId}:${hoy}`,
    });
  } catch (e) {
    console.error('[notifications] emitirEmailFallido:', e instanceof Error ? e.message : e);
  }
}

// Sustitución aceptada: a la instructora que cubre (nueva clase asignada).
export async function emitirSustitucionAceptada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; instructorId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.SUSTITUCION_ACEPTADA, studioId: p.studioId,
      data: { ...ctx, instructorId: p.instructorId }, resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `sustitucion-aceptada:${p.sesionId}:${p.instructorId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirSustitucionAceptada:', e instanceof Error ? e.message : e);
  }
}

// El Umbral (lib/decision/umbral.ts): el único mensaje del día, si lo hay.
// dedupKey por fecha (no por dedupeKey de la candidata) — refuerza en este
// nivel también "como mucho un push de este tipo al día por estudio".
export async function emitirDecisionMensajeDia(
  admin: SupabaseClient, p: { studioId: string; fecha: string; titulo: string; motivo: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.DECISION_MENSAJE_DIA, studioId: p.studioId,
      data: { titulo: p.titulo, motivo: p.motivo },
      dedupKey: `decision-mensaje-dia:${p.studioId}:${p.fecha}`,
    });
  } catch (e) {
    console.error('[notifications] emitirDecisionMensajeDia:', e instanceof Error ? e.message : e);
  }
}

// Tentare Network, Fase 7 — docs/NETWORK-IMPLEMENTATION-PLAN.md §4/§10.
// `studioId` aquí es el estudio que tiene que RESOLVER la solicitud (audiencia
// 'gerencia'), no uno al que pertenezca la profesional.
export async function emitirRedVerificacionSolicitada(
  admin: SupabaseClient,
  p: { studioId: string; verificacionId: string; profesional: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_VERIFICACION_SOLICITADA, studioId: p.studioId,
      data: { profesional: p.profesional },
      resource: { type: 'red_verificacion', id: p.verificacionId },
      dedupKey: `red-verificacion:${p.verificacionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedVerificacionSolicitada:', e instanceof Error ? e.message : e);
  }
}

// Aquí `studioId` es el mismo estudio de arriba (el que resolvió) — la
// audiencia 'red-profesional' ignora ese studioId y resuelve por
// `data.authUserId`, ver recipients.ts. Se necesita igual porque
// NotificationEvent.studioId es obligatorio (docs/NETWORK-AUDIT.md riesgo #2).
export async function emitirRedExperienciaConfirmada(
  admin: SupabaseClient,
  p: { studioId: string; authUserId: string; profesional: string; estudio: string; experienciaId: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_EXPERIENCIA_CONFIRMADA, studioId: p.studioId,
      data: { authUserId: p.authUserId, profesional: p.profesional, estudio: p.estudio },
      resource: { type: 'red_experiencia', id: p.experienciaId },
      dedupKey: `red-experiencia-confirmada:${p.experienciaId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedExperienciaConfirmada:', e instanceof Error ? e.message : e);
  }
}

export async function emitirRedExperienciaRechazada(
  admin: SupabaseClient,
  p: { studioId: string; authUserId: string; profesional: string; estudio: string; experienciaId: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_EXPERIENCIA_RECHAZADA, studioId: p.studioId,
      data: { authUserId: p.authUserId, profesional: p.profesional, estudio: p.estudio },
      resource: { type: 'red_experiencia', id: p.experienciaId },
      dedupKey: `red-experiencia-rechazada:${p.experienciaId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedExperienciaRechazada:', e instanceof Error ? e.message : e);
  }
}

// Fase 9 — docs/NETWORK-IMPLEMENTATION-PLAN.md §6/§9. `studioId` es el
// estudio que envía la solicitud; `authUserId` es la profesional destino.
export async function emitirRedContactoSolicitado(
  admin: SupabaseClient,
  p: { studioId: string; authUserId: string; solicitudId: string; estudioNombre: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_CONTACTO_SOLICITADO, studioId: p.studioId,
      data: { authUserId: p.authUserId, estudio: p.estudioNombre },
      resource: { type: 'red_solicitud_contacto', id: p.solicitudId },
      dedupKey: `red-contacto-solicitado:${p.solicitudId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedContactoSolicitado:', e instanceof Error ? e.message : e);
  }
}

// `emailContacto` nunca es null aquí — aceptar exige que la profesional
// tenga uno guardado (ver app/api/network/contacto/resolver/route.ts).
// Fase 2 (matching). `studioId` es el estudio dueño de la vacante — la
// audiencia 'gerencia' ya resuelve por él (mismo patrón que
// emitirRedVerificacionSolicitada).
export async function emitirRedCandidaturaRecibida(
  admin: SupabaseClient,
  p: { studioId: string; candidaturaId: string; vacanteId: string; vacanteTitulo: string; profesional: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_CANDIDATURA_RECIBIDA, studioId: p.studioId,
      // `vacanteId` es obligatorio: el deepLink del catálogo es
      // `/network/vacantes/{vacanteId}` y sin él quedaba en
      // `/network/vacantes/` — confirmado en producción (fila del 18-ago).
      // El gemelo emitirRedVacanteEncaja sí lo pasaba.
      data: { vacanteId: p.vacanteId, vacanteTitulo: p.vacanteTitulo, profesional: p.profesional },
      resource: { type: 'red_candidatura', id: p.candidaturaId },
      dedupKey: `red-candidatura-recibida:${p.candidaturaId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedCandidaturaRecibida:', e instanceof Error ? e.message : e);
  }
}

// Fase 2 (matching). `studioId` es el estudio que publica — la audiencia
// 'red-instructoras-lista' ignora ese studioId y resuelve por
// `data.authUserIds` (ver recipients.ts), calculados por el caller (sin
// cron: ver app/api/network/vacantes/[id]/estado/route.ts). `NotificationEvent.
// studioId` es obligatorio igual que en emitirRedExperienciaConfirmada.
export async function emitirRedVacanteEncaja(
  admin: SupabaseClient,
  p: { studioId: string; vacanteId: string; titulo: string; authUserIds: string[] },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_VACANTE_ENCAJA, studioId: p.studioId,
      data: { vacanteId: p.vacanteId, titulo: p.titulo, authUserIds: p.authUserIds },
      resource: { type: 'red_vacante', id: p.vacanteId },
      dedupKey: `red-vacante-encaja:${p.vacanteId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedVacanteEncaja:', e instanceof Error ? e.message : e);
  }
}

// Community & Messaging OS (P0): mensaje nuevo → a los demás participantes.
// `data.authUserIds` los calcula SIEMPRE el caller (todos los participantes
// de la conversación menos quien escribió; para EQUIPO/ALUMNA_MOSTRADOR, la
// lista dinámica de staff resuelta vía `puede_gestionar_calendario()`/
// `instructores` — ver recipients.ts). Solo PUSH: el email vive aparte, en
// el digest de baja frecuencia (emitirMensajeDigestNoLeido), a propósito de
// no mandar un correo por cada mensaje.
export async function emitirMensajeRecibido(
  admin: SupabaseClient,
  p: {
    studioId: string; conversacionId: string; mensajeId: string;
    remitente: string; previsualizacion?: string | null;
    authUserIds: string[]; slug?: string | null;
  },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.MENSAJE_RECIBIDO, studioId: p.studioId,
      data: {
        conversacionId: p.conversacionId, remitente: p.remitente,
        previsualizacion: p.previsualizacion ? `: "${p.previsualizacion}"` : '',
        authUserIds: p.authUserIds, slug: p.slug ?? null,
      },
      resource: { type: 'mensaje', id: p.mensajeId },
      dedupKey: `mensaje-recibido:${p.mensajeId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirMensajeRecibido:', e instanceof Error ? e.message : e);
  }
}

// Digest de baja frecuencia de mensajes sin leer (cron, lib/mensajeria/
// digest.ts) — el ÚNICO email de toda la mensajería. dedupKey por
// authUserId+fecha, mismo criterio que emitirDecisionMensajeDia (ahí es
// studioId+fecha): como mucho un digest al día por persona, aunque el cron
// corra varias veces dentro de esa ventana.
export async function emitirMensajeDigestNoLeido(
  admin: SupabaseClient,
  p: { studioId: string; authUserId: string; conversaciones: number; fecha: string; slug?: string | null },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.MENSAJE_DIGEST_NO_LEIDO, studioId: p.studioId,
      data: { conversaciones: p.conversaciones, authUserIds: [p.authUserId], slug: p.slug ?? null },
      dedupKey: `mensaje-digest:${p.authUserId}:${p.fecha}`,
    });
  } catch (e) {
    console.error('[notifications] emitirMensajeDigestNoLeido:', e instanceof Error ? e.message : e);
  }
}

// Community & Messaging OS: post nuevo en el tablón → a la audiencia ya
// resuelta del post (app/api/comunidad/posts/route.ts calcula `socioIds` con
// `resolverDestinatariasCampana` dentro de un `after()`, la misma función
// pura que usan las campañas de marketing — ya no un worker de Inngest). Una
// sola llamada a `publish()` con la lista completa — nunca una por socia,
// mismo criterio que emitirRedVacanteEncaja. dedupKey por post: como mucho
// un aviso por post, sea cual sea el nº de veces que se reintente `after()`.
export async function emitirPostComunidadNuevo(
  admin: SupabaseClient,
  p: { studioId: string; postId: string; autorNombre: string; previsualizacion?: string | null; socioIds: string[]; slug?: string | null },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.POST_COMUNIDAD_NUEVO, studioId: p.studioId,
      data: {
        autor: p.autorNombre,
        previsualizacion: p.previsualizacion ? `: "${p.previsualizacion}"` : '',
        socioIds: p.socioIds, slug: p.slug ?? null,
      },
      resource: { type: 'post_comunidad', id: p.postId },
      dedupKey: `post-comunidad-nuevo:${p.postId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPostComunidadNuevo:', e instanceof Error ? e.message : e);
  }
}

// Community & Messaging OS (P2, buzón de documentos): el estudio le sube un
// documento nuevo a una socia concreta. dedupKey por documentoId — un solo
// aviso por documento, sea cual sea el nº de reintentos del caller.
export async function emitirDocumentoSocioNuevo(
  admin: SupabaseClient,
  p: { studioId: string; documentoId: string; socioId: string; titulo: string },
): Promise<void> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.DOCUMENTO_SOCIO_NUEVO, studioId: p.studioId,
      data: { socioId: p.socioId, titulo: p.titulo, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'documento_socio', id: p.documentoId },
      dedupKey: `documento-socio-nuevo:${p.documentoId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirDocumentoSocioNuevo:', e instanceof Error ? e.message : e);
  }
}

export async function emitirRedContactoAceptado(
  admin: SupabaseClient,
  p: {
    studioId: string; solicitanteAuthUserId: string; solicitudId: string;
    profesional: string; emailContacto: string; telefonoContacto: string | null;
  },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.RED_CONTACTO_ACEPTADO, studioId: p.studioId,
      data: {
        solicitanteAuthUserId: p.solicitanteAuthUserId,
        profesional: p.profesional,
        emailContacto: p.emailContacto,
        telefonoTexto: p.telefonoContacto ? ` o al ${p.telefonoContacto}` : '',
      },
      resource: { type: 'red_solicitud_contacto', id: p.solicitudId },
      dedupKey: `red-contacto-aceptado:${p.solicitudId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirRedContactoAceptado:', e instanceof Error ? e.message : e);
  }
}
