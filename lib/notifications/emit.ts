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
import { cuandoEstudio, horaEstudio, fechaCortaEstudio } from '@/lib/utils';

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
  p: { studioId: string; sesionId: string; socioId: string; reservaId: string; motivo?: 'rechazada' | 'expirada' | 'oferta_caducada' },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const motivoTexto = p.motivo === 'rechazada'
      ? ' La propietaria no ha podido confirmarla.'
      : p.motivo === 'expirada'
        ? ' No se aprobó a tiempo: la clase ya ha empezado.'
        : p.motivo === 'oferta_caducada'
          ? ' No aceptaste la plaza a tiempo y se ha ofrecido a la siguiente en la lista.'
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
