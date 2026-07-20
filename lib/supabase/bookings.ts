import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarEmailTransaccional, type DatosClaseEmail } from '@/lib/emails/send-server';
import { uid } from '@/lib/utils';
import { siguienteEnEspera, contarReservasActivasFuturas, debeDevolverBono, esCancelacionTardia, decidirPremioReferido } from '@/lib/booking-logic';
import { bonoConsumible, calcularDevolucionBono, tieneEntitlementActivo } from '@/lib/bono-logic';
import { validarCanje, decidirOtorgarCreditos } from '@/lib/engines/reward-engine';
import { calcularMetrica } from '@/lib/engines/achievement-engine';
import { calcularProgresoReto } from '@/lib/engines/challenge-engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RowCitas,
  RowCitasServicios,
  RowCitasDisponibilidad,
  RowPlanesTarifa,
  RowPreferenciasSocio,
  RowProductosPos,
  RowRecibos,
  RowReservas,
  RowSesiones,
  RowSocios,
  RowSuscripciones,
  RowVentasPos,
  RowNotificaciones,
  RowRewardRules,
  RowRewardActions,
  RowMemberCredits,
  RowRewardCatalog,
  RowAchievementDefinitions,
  RowAchievementProgress,
  RowChallengeDefinitions,
  RowChallengeProgress,
  RowInstructores,
  RowStudios,
} from '@/lib/db-types';
import type {
  Cita,
  ServicioCita,
  DisponibilidadCita,
  PlanTarifa,
  PreferenciasSocio,
  ProductoPOS,
  Recibo,
  Reserva,
  Sesion,
  Socio,
  Suscripcion,
  VentaPOS,
  Notificacion,
  RewardRule,
  RewardAction,
  RewardCatalogItem,
  MemberCredits,
  AchievementDefinition,
  AchievementProgress,
  ChallengeDefinition,
  ChallengeProgress,
  Instructor,
  RewardTrigger,
} from '@/lib/types';
import {
  generarHuecosDia, dentroDeDisponibilidad, horaParedAInstante,
  type IntervaloOcupado, type HuecoCita,
} from '@/lib/citas/slots';
import {
  setCurrentStudioId, getCurrentStudioId,
  mapMensajeEquipo, mapCanalEquipo, mapServicioCita, mapDisponibilidadCita,
  fetchPublicStudioData, fetchCriticalStudioData, setDbErrorListener,
} from './studios';

// ─── Reverse mappers (internal only) ─────────────────────────────────────────

function _socioToDb(socio: Socio) {
  const {
    aceptacionContrato, studioId, fechaAlta, leadStage,
    stripeCustomerId, stripePaymentMethodId, fechaNacimiento, fotoUrl, referidoPor,
    metodoPagoPreferido, sepaMandateId, sepaPaymentMethodId,
    camposExtra,
    ...rest
  } = socio;
  return {
    ...rest,
    studio_id: studioId ?? getCurrentStudioId(),
    fecha_alta: fechaAlta,
    lead_stage: leadStage ?? null,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_payment_method_id: stripePaymentMethodId ?? null,
    metodo_pago_preferido: metodoPagoPreferido ?? 'TARJETA',
    sepa_mandate_id: sepaMandateId ?? null,
    sepa_payment_method_id: sepaPaymentMethodId ?? null,
    fecha_nacimiento: fechaNacimiento ?? null,
    foto_url: fotoUrl ?? null,
    referido_por: referidoPor ?? null,
    campos_extra: camposExtra ?? {},
    aceptacion_fecha: aceptacionContrato?.fecha ?? null,
    aceptacion_firma: aceptacionContrato?.firma ?? null,
    aceptacion_version: aceptacionContrato?.versionTexto ?? null,
  };
}

function _planTarifaToDb(plan: PlanTarifa) {
  return {
    id: plan.id,
    studio_id: plan.studioId ?? getCurrentStudioId(),
    nombre: plan.nombre,
    descripcion: plan.descripcion ?? null,
    precio: plan.precio,
    tipo: plan.tipo,
    sesiones: plan.sesiones ?? null,
    activo: plan.activo,
  };
}

function _suscripcionToDb(sus: Suscripcion) {
  return {
    id: sus.id,
    studio_id: sus.studioId ?? getCurrentStudioId(),
    socio_id: sus.socioId,
    plan_id: sus.planId,
    estado: sus.estado,
    fecha_inicio: sus.fechaInicio,
    fecha_fin: sus.fechaFin ?? null,
    sesiones_restantes: sus.sesionesRestantes ?? null,
    stripe_subscription_id: sus.stripeSubscriptionId ?? null,
  };
}

function _sesionToDb(ses: Sesion) {
  return {
    id: ses.id,
    studio_id: ses.studioId ?? getCurrentStudioId(),
    tipo_clase_id: ses.tipoClaseId,
    sala_id: ses.salaId,
    instructor_id: ses.instructorId,
    inicio: ses.inicio,
    fin: ses.fin,
    aforo_maximo: ses.aforoMaximo,
    cancelada: ses.cancelada,
    notas: ses.notas ?? null,
    precio_puntual: ses.precioPuntual ?? null,
    serie_id: ses.serieId ?? null,
  };
}

function _reservaToDb(res: Reserva) {
  return {
    id: res.id,
    studio_id: res.studioId ?? getCurrentStudioId(),
    sesion_id: res.sesionId,
    socio_id: res.socioId,
    estado: res.estado,
    spot_id: res.spotId ?? null,
    posicion_espera: res.posicionEspera ?? null,
    check_in_en: res.checkInEn ?? null,
    creado_en: res.creadoEn,
  };
}

function _reciboToDb(rec: Recibo) {
  return {
    id: rec.id,
    studio_id: rec.studioId ?? getCurrentStudioId(),
    socio_id: rec.socioId,
    suscripcion_id: rec.suscripcionId ?? null,
    concepto: rec.concepto,
    importe: rec.importe,
    estado: rec.estado,
    fecha_vencimiento: rec.fechaVencimiento,
    fecha_cobro: rec.fechaCobro ?? null,
    fecha_devolucion: rec.fechaDevolucion ?? null,
    intentos_reintento: rec.intentosReintento,
    metodo_cobro: rec.metodoCobro ?? null,
    sepa_estado: rec.sepaEstado ?? null,
    proximo_reintento: rec.proximoReintento ?? null,
  };
}

function _citaToDb(cita: Cita) {
  return {
    id: cita.id,
    studio_id: cita.studioId ?? getCurrentStudioId(),
    socio_id: cita.socioId,
    instructor_id: cita.instructorId,
    tipo: cita.tipo,
    inicio: cita.inicio,
    fin: cita.fin,
    notas: cita.notas ?? null,
    estado: cita.estado,
    precio: cita.precio ?? null,
    pagada: cita.pagada ?? false,
    creado_en: cita.creadoEn,
    servicio_id: cita.servicioId ?? null,
  };
}

function _ventaPOSToDb(venta: VentaPOS) {
  return {
    id: venta.id,
    studio_id: venta.studioId ?? getCurrentStudioId(),
    socio_id: venta.socioId ?? null,
    items: venta.items ?? [],
    subtotal: venta.subtotal,
    descuento: venta.descuento,
    total: venta.total,
    metodo_pago: venta.metodoPago,
    notas: venta.notas ?? null,
    realizada_en: venta.realizadaEn,
  };
}

function _servicioCitaToDb(s: ServicioCita) {
  return {
    id: s.id,
    studio_id: s.studioId ?? getCurrentStudioId(),
    nombre: s.nombre,
    tipo: s.tipo,
    duracion_min: s.duracionMin,
    precio: s.precio ?? null,
    auto_reservable: s.autoReservable ?? false,
    color: s.color ?? null,
    descripcion: s.descripcion ?? null,
    activo: s.activo ?? true,
    orden: s.orden ?? 0,
    creado_en: s.creadoEn || new Date().toISOString(),
  };
}

function reportDbError(tag: string, error: unknown) {
  console.error(tag, error);
}

// Helper: mappers for reads
function _mapSesion(r: RowSesiones): Sesion {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipoClaseId: r.tipo_clase_id,
    salaId: r.sala_id,
    instructorId: r.instructor_id,
    inicio: r.inicio,
    fin: r.fin,
    aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada,
    notas: r.notas ?? null,
    precioPuntual: r.precio_puntual ?? null,
    googleEventId: r.google_event_id ?? null,
    serieId: r.serie_id ?? null,
  } as Sesion;
}

function _mapReserva(r: RowReservas): Reserva {
  return {
    id: r.id,
    studioId: r.studio_id,
    sesionId: r.sesion_id,
    socioId: r.socio_id,
    estado: r.estado,
    spotId: r.spot_id ?? null,
    posicionEspera: r.posicion_espera ?? null,
    checkInEn: r.check_in_en ?? null,
    creadoEn: r.creado_en,
  } as Reserva;
}

function _mapRecibo(r: RowRecibos): Recibo {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    suscripcionId: r.suscripcion_id ?? null,
    concepto: r.concepto,
    importe: r.importe,
    estado: r.estado,
    fechaVencimiento: r.fecha_vencimiento,
    fechaCobro: r.fecha_cobro ?? null,
    fechaDevolucion: r.fecha_devolucion ?? null,
    intentosReintento: r.intentos_reintento,
    metodoCobro: (r.metodo_cobro as Recibo['metodoCobro']) ?? null,
    sepaEstado: r.sepa_estado ?? null,
  } as Recibo;
}

function _mapCita(r: RowCitas): Cita {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    tipo: r.tipo,
    inicio: r.inicio,
    fin: r.fin,
    notas: r.notas ?? null,
    estado: r.estado,
    precio: r.precio ?? null,
    pagada: r.pagada ?? false,
    creadoEn: r.creado_en,
    servicioId: r.servicio_id ?? null,
  } as Cita;
}

function _mapVentaPOS(r: RowVentasPos): VentaPOS {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id ?? null,
    items: r.items ?? [],
    subtotal: r.subtotal,
    descuento: r.descuento,
    total: r.total,
    metodoPago: r.metodo_pago,
    notas: r.notas ?? null,
    realizadaEn: r.realizada_en,
  } as VentaPOS;
}

function _mapSuscripcion(r: RowSuscripciones): Suscripcion {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    planId: r.plan_id,
    estado: r.estado,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin ?? null,
    sesionesRestantes: r.sesiones_restantes ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
  } as Suscripcion;
}

function _mapPlanTarifa(r: RowPlanesTarifa): PlanTarifa {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    precio: r.precio,
    tipo: r.tipo,
    sesiones: r.sesiones ?? null,
    activo: r.activo,
  } as PlanTarifa;
}

function _mapSocio(r: RowSocios): Socio {
  const aceptacionContrato =
    r.aceptacion_fecha
      ? {
          fecha: r.aceptacion_fecha,
          firma: r.aceptacion_firma ?? '',
          versionTexto: r.aceptacion_version ?? '',
        }
      : undefined;

  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    apellidos: r.apellidos,
    email: r.email,
    telefono: r.telefono ?? null,
    nif: r.nif ?? null,
    fechaAlta: r.fecha_alta,
    activo: r.activo,
    leadStage: r.lead_stage ?? undefined,
    tags: r.tags ?? undefined,
    aceptacionContrato,
    avatar: r.avatar ?? null,
    stripeCustomerId: r.stripe_customer_id ?? null,
    stripePaymentMethodId: r.stripe_payment_method_id ?? null,
    metodoPagoPreferido: (r.metodo_pago_preferido as Socio['metodoPagoPreferido']) ?? 'TARJETA',
    sepaMandateId: r.sepa_mandate_id ?? null,
    sepaPaymentMethodId: r.sepa_payment_method_id ?? null,
    fechaNacimiento: r.fecha_nacimiento ?? null,
    direccion: r.direccion ?? null,
    fotoUrl: r.foto_url ?? null,
    referidoPor: r.referido_por ?? null,
    camposExtra: r.campos_extra ?? {},
  } as Socio;
}

function _mapPreferenciasSocio(r: RowPreferenciasSocio): PreferenciasSocio {
  return {
    socioId: r.socio_id,
    studioId: r.studio_id,
    disponibilidad: r.disponibilidad ?? {},
    instructorFavoritoId: r.instructor_favorito_id ?? null,
    tipoClaseFavorita: r.tipo_clase_favorita ?? null,
    duracionPreferida: r.duracion_preferida ?? null,
    nivel: r.nivel ?? null,
    notifEmail: r.notif_email ?? true,
    notifWhatsapp: r.notif_whatsapp ?? true,
    actualizadoEn: r.actualizado_en,
  } as PreferenciasSocio;
}

function _mapRewardRule(r: RowRewardRules): RewardRule {
  return {
    id: r.id,
    studioId: r.studio_id,
    trigger: r.trigger,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    creditos: r.creditos,
    activa: r.activa,
    topeMensual: r.tope_mensual ?? null,
    creadoEn: r.creado_en,
  } as RewardRule;
}

function _mapRewardAction(r: RowRewardActions): RewardAction {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    trigger: r.trigger,
    refId: r.ref_id ?? null,
    creadoEn: r.creado_en,
  } as RewardAction;
}

function _mapMemberCredits(r: RowMemberCredits): MemberCredits {
  return {
    socioId: r.socio_id,
    studioId: r.studio_id,
    saldo: r.saldo,
    totalGanado: r.total_ganado,
    totalCanjeado: r.total_canjeado,
    actualizadoEn: r.actualizado_en,
  } as MemberCredits;
}

function _mapRewardCatalogItem(r: RowRewardCatalog): RewardCatalogItem {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    costeCreditos: r.coste_creditos,
    icono: r.icono,
    activo: r.activo,
    stock: r.stock ?? null,
    creadoEn: r.creado_en,
  } as RewardCatalogItem;
}

function _mapAchievementDefinition(r: RowAchievementDefinitions): AchievementDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    metric: r.metric,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    umbral: r.umbral,
    icono: r.icono,
    creditosRecompensa: r.creditos_recompensa,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as AchievementDefinition;
}

function _mapAchievementProgress(r: RowAchievementProgress): AchievementProgress {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    achievementId: r.achievement_id,
    progresoActual: r.progreso_actual,
    completado: r.completado,
    completadoEn: r.completado_en ?? null,
  } as AchievementProgress;
}

function _mapChallengeDefinition(r: RowChallengeDefinitions): ChallengeDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    icono: r.icono,
    metric: r.metric,
    objetivo: r.objetivo,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin,
    creditosRecompensa: r.creditos_recompensa,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as ChallengeDefinition;
}

function _mapChallengeProgress(r: RowChallengeProgress): ChallengeProgress {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    challengeId: r.challenge_id,
    progresoActual: r.progreso_actual,
    completado: r.completado,
    completadoEn: r.completado_en ?? null,
  } as ChallengeProgress;
}

function _mapInstructor(r: RowInstructores): Instructor {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    email: r.email ?? null,
    telefono: r.telefono ?? null,
    color: r.color,
    activo: r.activo,
    avatar: r.avatar ?? null,
    rol: r.rol ?? 'INSTRUCTOR',
    authUserId: r.auth_user_id ?? null,
  } as Instructor;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function validarSociaPublica(
  admin: SupabaseClient, studioId: string, socioId: string, email: string,
): Promise<RowSocios | null> {
  const { data } = await admin
    .from('socios').select('*').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!data) return null;
  const ok = (data.email ?? '').trim().toLowerCase() === email.trim().toLowerCase();
  return ok ? (data as RowSocios) : null;
}

async function cargarPoliticaEstudio(admin: SupabaseClient, studioId: string) {
  const { data } = await admin
    .from('studios')
    .select('cancelacion_ventana_horas, cancelacion_devolver_bono_tardia, reserva_exigir_plan, reserva_max_simultaneas')
    .eq('id', studioId).maybeSingle();
  return {
    ventanaHoras: (data?.cancelacion_ventana_horas ?? 12) as number,
    devolverBonoTardia: (data?.cancelacion_devolver_bono_tardia ?? false) as boolean,
    exigirPlan: (data?.reserva_exigir_plan ?? false) as boolean,
    maxSimultaneas: (data?.reserva_max_simultaneas ?? null) as number | null,
  };
}

async function consumirBonoServidor(admin: SupabaseClient, studioId: string, socioId: string): Promise<boolean> {
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const suscripciones = (susRows ?? []).map(_mapSuscripcion);
  const planes = (planRows ?? []).map(_mapPlanTarifa);
  const consumible = bonoConsumible(socioId, suscripciones, planes);
  if (!consumible) return false;
  const { suscripcion: sus, plan } = consumible;
  const { data: nuevoSaldo, error } = await admin.rpc('consumir_sesion_bono', {
    p_suscripcion_id: sus.id,
    p_studio_id: studioId,
  });
  if (error) { reportDbError('[consumirBonoServidor]', error); return false; }
  if (nuevoSaldo == null) {
    reportDbError(
      '[consumirBonoServidor] bono consumible sin descontar (posible clase no cobrada)',
      { studioId, socioId, suscripcionId: sus.id },
    );
    return false;
  }
  if (nuevoSaldo === 0) {
    const hoy = new Date().toISOString().slice(0, 10);
    const primerReintento = new Date(new Date(hoy).getTime() + 24 * 60 * 60 * 1000).toISOString();
    await admin.from('recibos').insert({
      id: `rec-renov-${uid()}`, studio_id: studioId, socio_id: socioId, suscripcion_id: sus.id,
      concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
      fecha_vencimiento: hoy, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0,
      proximo_reintento: primerReintento,
    });
  }
  return true;
}

async function devolverBonoServidor(admin: SupabaseClient, studioId: string, socioId: string) {
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const consumible = bonoConsumible(socioId, (susRows ?? []).map(_mapSuscripcion), (planRows ?? []).map(_mapPlanTarifa));
  if (!consumible) return;
  const { suscripcion: sus, plan, sesionesRestantes } = consumible;
  const nuevas = calcularDevolucionBono(sesionesRestantes, plan.sesiones);
  await admin.from('suscripciones').update({ sesiones_restantes: nuevas }).eq('id', sus.id);
}

async function datosClaseParaEmail(
  admin: SupabaseClient, studioId: string, sesionId: string,
): Promise<(DatosClaseEmail & { inicioISO: string }) | null> {
  const { data: ses } = await admin
    .from('sesiones')
    .select('inicio, tipo_clase_id, sala_id, instructor_id')
    .eq('id', sesionId).eq('studio_id', studioId).maybeSingle();
  if (!ses) return null;
  const [{ data: tipo }, { data: sala }, { data: inst }, { data: studio }] = await Promise.all([
    admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle(),
    ses.sala_id ? admin.from('salas').select('nombre').eq('id', ses.sala_id).maybeSingle() : Promise.resolve({ data: null }),
    ses.instructor_id ? admin.from('instructores').select('nombre').eq('id', ses.instructor_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('studios').select('nombre').eq('id', studioId).maybeSingle(),
  ]);
  const inicio = new Date(ses.inicio as string);
  const fecha = inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return {
    inicioISO: ses.inicio as string,
    claseNombre: tipo?.nombre ?? 'Clase',
    fecha, hora,
    sala: sala?.nombre ?? '',
    instructor: inst?.nombre ?? '',
    estudioNombre: studio?.nombre ?? 'Tentare',
  };
}

async function notificarPromocionEspera(
  admin: SupabaseClient, studioId: string, socioId: string, sesionId: string, bonoConsumido: boolean,
) {
  const { data: socia } = await admin
    .from('socios').select('nombre, email').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!socia?.email) return;
  const datos = await datosClaseParaEmail(admin, studioId, sesionId);
  if (!datos) return;
  await enviarEmailTransaccional({
    tipo: 'promocion', to: socia.email, toName: socia.nombre ?? 'Socia',
    data: { ...datos, bonoConsumido },
    studioId,
    idempotencyKey: `promocion-${sesionId}-${socioId}`,
  });
}

async function asignarSpotReserva(
  admin: SupabaseClient, studioId: string, sesionId: string, reservaId: string, spotId: string,
): Promise<string | null> {
  const [{ data: ses }, { data: spot }] = await Promise.all([
    admin.from('sesiones').select('sala_id').eq('id', sesionId).eq('studio_id', studioId).maybeSingle(),
    admin.from('spots').select('id, activo, sala_id').eq('id', spotId).eq('studio_id', studioId).maybeSingle(),
  ]);
  if (!ses || !spot || !spot.activo || spot.sala_id !== ses.sala_id) return null;
  const { data: ocupada } = await admin
    .from('reservas').select('id')
    .eq('sesion_id', sesionId).eq('spot_id', spotId)
    .in('estado', ['CONFIRMADA', 'ASISTIDA']).maybeSingle();
  if (ocupada) return null;
  const { error } = await admin.from('reservas').update({ spot_id: spotId }).eq('id', reservaId);
  if (error) return null;
  return spotId;
}

async function cargarContextoGamificacion(
  admin: SupabaseClient, studioId: string, socioId: string,
): Promise<{ socio: Socio; reservas: Reserva[]; sesiones: Sesion[]; referidas: Socio[] } | null> {
  const [{ data: socioRow }, { data: resRows }] = await Promise.all([
    admin.from('socios').select('*').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
    admin.from('reservas').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  if (!socioRow) return null;
  const reservas = (resRows ?? []).map(_mapReserva);

  const sesionIds = [...new Set(reservas.map(r => r.sesionId))];
  const [sesRows, refRows] = await Promise.all([
    sesionIds.length
      ? admin.from('sesiones').select('*').eq('studio_id', studioId).in('id', sesionIds).then(r => r.data)
      : Promise.resolve([]),
    admin.from('socios').select('*').eq('studio_id', studioId).eq('referido_por', socioId).then(r => r.data),
  ]);

  return {
    socio: _mapSocio(socioRow as RowSocios),
    reservas,
    sesiones: (sesRows ?? []).map(_mapSesion),
    referidas: (refRows ?? []).map(_mapSocio),
  };
}

async function evaluarLogrosServidor(
  admin: SupabaseClient, studioId: string, socioId: string, ctx: { socio: Socio; reservas: Reserva[]; sesiones: Sesion[]; referidas: Socio[] },
): Promise<void> {
  const [{ data: defRows }, { data: progRows }] = await Promise.all([
    admin.from('achievement_definitions').select('*').eq('studio_id', studioId).eq('activo', true),
    admin.from('achievement_progress').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  const definiciones = (defRows ?? []).map(_mapAchievementDefinition);
  if (definiciones.length === 0) return;

  const progresos = (progRows ?? []).map(_mapAchievementProgress);
  const { socio, reservas, sesiones, referidas } = ctx;

  const now = new Date();
  for (const def of definiciones) {
    const existente = progresos.find(p => p.achievementId === def.id);
    if (existente?.completado) continue;

    const valor = calcularMetrica(def.metric, { reservas, sesiones, socio, now, todosLosSocios: referidas });
    const completadoAhora = valor >= def.umbral;

    const { error: progError } = await admin.from('achievement_progress').upsert({
      id: existente?.id ?? `achp-${uid()}`,
      studio_id: studioId, socio_id: socioId, achievement_id: def.id,
      progreso_actual: valor, completado: completadoAhora,
      completado_en: completadoAhora ? now.toISOString() : null,
    }, { onConflict: 'socio_id,achievement_id' });
    if (progError) { reportDbError('[evaluarLogrosServidor] progreso', progError); continue; }

    if (!completadoAhora) continue;

    const { error: histError } = await admin.from('achievement_history').insert({
      id: `achh-${uid()}`, studio_id: studioId, socio_id: socioId, achievement_id: def.id,
      nombre: def.nombre, icono: def.icono, creado_en: now.toISOString(),
    });
    if (histError) reportDbError('[evaluarLogrosServidor] historial', histError);

    if (def.creditosRecompensa <= 0) continue;
    const { error: claimError } = await admin.from('reward_actions').insert({
      id: `rwa-${uid()}`, studio_id: studioId, socio_id: socioId,
      trigger: 'LOGRO', ref_id: `${socioId}:${def.id}`, creado_en: now.toISOString(),
    });
    if (claimError) continue;

    await admin.rpc('ajustar_creditos', {
      p_socio_id: socioId, p_studio_id: studioId,
      p_delta_saldo: def.creditosRecompensa, p_delta_ganado: def.creditosRecompensa, p_delta_canjeado: 0,
    });
    await admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: studioId, socio_id: socioId, tipo: 'GANANCIA',
      creditos: def.creditosRecompensa, descripcion: `Logro desbloqueado: ${def.nombre}`,
      ref_id: def.id, creado_en: now.toISOString(),
    });
  }
}

async function evaluarRetosServidor(
  admin: SupabaseClient, studioId: string, socioId: string, ctx: { socio: Socio; reservas: Reserva[]; sesiones: Sesion[]; referidas: Socio[] },
): Promise<void> {
  const now = new Date();
  const [{ data: defRows }, { data: progRows }] = await Promise.all([
    admin.from('challenge_definitions').select('*').eq('studio_id', studioId).eq('activo', true),
    admin.from('challenge_progress').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  const retos = (defRows ?? []).map(_mapChallengeDefinition)
    .filter(r => new Date(r.fechaInicio) <= now && now <= new Date(r.fechaFin));
  if (retos.length === 0) return;

  const progresos = (progRows ?? []).map(_mapChallengeProgress);
  const { socio, reservas, sesiones, referidas } = ctx;

  for (const reto of retos) {
    const existente = progresos.find(p => p.challengeId === reto.id);
    if (existente?.completado) continue;

    const valor = calcularProgresoReto(reto, reservas, sesiones, socio, referidas, now);
    const completadoAhora = valor >= reto.objetivo;

    const { error: progError } = await admin.from('challenge_progress').upsert({
      id: existente?.id ?? `chap-${uid()}`,
      studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
      progreso_actual: valor, completado: completadoAhora,
      completado_en: completadoAhora ? now.toISOString() : null,
    }, { onConflict: 'socio_id,challenge_id' });
    if (progError) { reportDbError('[evaluarRetosServidor] progreso', progError); continue; }

    if (!completadoAhora) continue;

    const { error: histError } = await admin.from('challenge_history').insert({
      id: `chah-${uid()}`, studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
      nombre: reto.nombre, icono: reto.icono, creado_en: now.toISOString(),
    });
    if (histError) reportDbError('[evaluarRetosServidor] historial', histError);

    if (reto.creditosRecompensa <= 0) continue;
    const { error: claimError } = await admin.from('reward_actions').insert({
      id: `rwa-${uid()}`, studio_id: studioId, socio_id: socioId,
      trigger: 'RETO', ref_id: `${socioId}:${reto.id}`, creado_en: now.toISOString(),
    });
    if (claimError) continue;

    await admin.rpc('ajustar_creditos', {
      p_socio_id: socioId, p_studio_id: studioId,
      p_delta_saldo: reto.creditosRecompensa, p_delta_ganado: reto.creditosRecompensa, p_delta_canjeado: 0,
    });
    await admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: studioId, socio_id: socioId, tipo: 'GANANCIA',
      creditos: reto.creditosRecompensa, descripcion: `Reto completado: ${reto.nombre}`,
      ref_id: reto.id, creado_en: now.toISOString(),
    });
  }
}

async function evaluarGamificacionServidor(
  admin: SupabaseClient, studioId: string, socioId: string,
): Promise<void> {
  try {
    const ctx = await cargarContextoGamificacion(admin, studioId, socioId);
    if (!ctx) return;
    await evaluarLogrosServidor(admin, studioId, socioId, ctx);
    await evaluarRetosServidor(admin, studioId, socioId, ctx);
  } catch (err) {
    reportDbError('[evaluarGamificacionServidor]', err);
  }
}

async function otorgarCreditosServidor(
  admin: SupabaseClient, studioId: string, socioId: string,
  trigger: RewardTrigger, refId: string | null,
) {
  const [{ data: rulesRows }, { data: actionRows }] = await Promise.all([
    admin.from('reward_rules').select('*').eq('studio_id', studioId),
    admin.from('reward_actions').select('*').eq('studio_id', studioId),
  ]);
  const rules = (rulesRows ?? []).map(_mapRewardRule);
  const actions = (actionRows ?? []).map(_mapRewardAction);
  const { otorgar, regla } = decidirOtorgarCreditos(rules, actions, trigger, refId);
  if (!otorgar || !regla) return;

  const now = new Date().toISOString();
  const actionId = `rwa-${uid()}`;
  const { error } = await admin.from('reward_actions').insert({
    id: actionId, studio_id: studioId, socio_id: socioId, trigger, ref_id: refId, creado_en: now,
  });
  if (error) return;

  await admin.rpc('ajustar_creditos', {
    p_socio_id: socioId, p_studio_id: studioId,
    p_delta_saldo: regla.creditos, p_delta_ganado: regla.creditos, p_delta_canjeado: 0,
  });
  await Promise.all([
    admin.from('reward_history').insert({
      id: `rwh-${uid()}`, studio_id: studioId, socio_id: socioId, rule_id: regla.id, action_id: actionId,
      creditos: regla.creditos, descripcion: regla.nombre, creado_en: now,
    }),
    admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: studioId, socio_id: socioId, tipo: 'GANANCIA', creditos: regla.creditos,
      descripcion: regla.nombre, ref_id: refId, creado_en: now,
    }),
  ]);
}

async function cargarOcupadosInstructora(
  admin: SupabaseClient, studioId: string, instructorId: string, desdeISO: string, hastaISO: string,
): Promise<IntervaloOcupado[]> {
  const [{ data: citas }, { data: sesiones }] = await Promise.all([
    admin.from('citas').select('inicio, fin, estado')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .lt('inicio', hastaISO).gte('fin', desdeISO),
    admin.from('sesiones').select('inicio, fin, cancelada')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .lt('inicio', hastaISO).gte('fin', desdeISO),
  ]);
  const out: IntervaloOcupado[] = [];
  for (const c of citas ?? []) out.push({ inicio: c.inicio as string, fin: c.fin as string });
  for (const s of sesiones ?? []) {
    if (s.cancelada) continue;
    out.push({ inicio: s.inicio as string, fin: s.fin as string });
  }
  return out;
}

// ─── Public booking operations ───────────────────────────────────────────────

export async function crearReservaPublica(params: {
  studioId: string; sesionId: string; socioId: string; email: string; spotId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  {
    const { data: ses } = await admin
      .from('sesiones').select('inicio, cancelada').eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
    if (!ses) return { error: 'Sesión no encontrada' as const };
    if (ses.cancelada) return { error: 'Esta clase está cancelada' as const };
    if (new Date(ses.inicio as string).getTime() <= Date.now()) {
      return { error: 'Esta clase ya ha empezado' as const };
    }
  }

  const pol = await cargarPoliticaEstudio(admin, params.studioId);
  if (pol.exigirPlan || pol.maxSimultaneas != null) {
    const [{ data: susRows }, { data: planRows }, { data: resRows }, { data: sesRows }] = await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', params.studioId),
      admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('sesiones').select('id, inicio').eq('studio_id', params.studioId),
    ]);
    const hoyISO = new Date().toISOString().slice(0, 10);
    if (pol.exigirPlan && !tieneEntitlementActivo(
      params.socioId, (susRows ?? []).map(_mapSuscripcion), (planRows ?? []).map(_mapPlanTarifa), hoyISO,
    )) {
      return { error: 'Necesitas un plan o bono activo para reservar' as const };
    }
    if (pol.maxSimultaneas != null) {
      const activas = contarReservasActivasFuturas(
        params.socioId,
        (resRows ?? []).map(_mapReserva),
        (sesRows ?? []).map(r => ({ id: r.id as string, inicio: r.inicio as string })),
        new Date(),
      );
      if (activas >= pol.maxSimultaneas) {
        return { error: `Has alcanzado el máximo de ${pol.maxSimultaneas} reservas activas` as const };
      }
    }
  }

  const reservaId = `res-${uid()}`;
  const { data, error } = await admin.rpc('reservar_plaza', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId,
    p_socio_id: params.socioId, p_reserva_id: reservaId,
  });
  if (error) {
    if (error.message.includes('YA_RESERVADA')) return { error: 'Ya tienes una reserva en esta clase' as const };
    if (error.message.includes('SESION_NO_ENCONTRADA')) return { error: 'Sesión no encontrada' as const };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CONFIRMADA';

  let spotAsignado: string | null = null;
  if (estado === 'CONFIRMADA') {
    await consumirBonoServidor(admin, params.studioId, params.socioId);
    if (params.spotId) {
      spotAsignado = await asignarSpotReserva(admin, params.studioId, params.sesionId, reservaId, params.spotId);
    }
  }
  await evaluarGamificacionServidor(admin, params.studioId, params.socioId);
  return { ok: true as const, estado, reservaId, spotAsignado };
}

export async function cancelarReservaPublica(params: {
  studioId: string; reservaId: string; socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data, error } = await admin.rpc('cancelar_reserva_plaza', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_socio_id: params.socioId,
  });
  if (error) {
    if (error.message.includes('NO_AUTORIZADO')) return { error: 'No autorizado' as const };
    if (error.message.includes('RESERVA_NO_ENCONTRADA')) return { error: 'Reserva no encontrada' as const };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;

  const { data: cancelada } = await admin
    .from('reservas').select('sesion_id').eq('id', params.reservaId).maybeSingle();
  let bonoDevuelto = false;
  let tardia = false;
  if (row?.era_confirmada && cancelada?.sesion_id) {
    const pol = await cargarPoliticaEstudio(admin, params.studioId);
    const { data: ses } = await admin
      .from('sesiones').select('inicio').eq('id', cancelada.sesion_id).maybeSingle();
    const inicio = ses?.inicio as string | undefined;
    tardia = inicio ? esCancelacionTardia(inicio, new Date(), pol.ventanaHoras) : false;
    if (inicio && debeDevolverBono(inicio, new Date(), pol.ventanaHoras, pol.devolverBonoTardia)) {
      await devolverBonoServidor(admin, params.studioId, params.socioId);
      bonoDevuelto = true;
    }
  }

  if (row?.promovida_socio_id) {
    const promSocioId = row.promovida_socio_id as string;
    const bonoConsumido = await consumirBonoServidor(admin, params.studioId, promSocioId);
    if (cancelada?.sesion_id) {
      await notificarPromocionEspera(admin, params.studioId, promSocioId, cancelada.sesion_id as string, bonoConsumido);
    }
  }
  await evaluarGamificacionServidor(admin, params.studioId, params.socioId);
  return { ok: true as const, tardia, bonoDevuelto };
}

// ─── Citas 1:1 auto-reservables ──────────────────────────────────────────────

export async function fetchCatalogoCitasPublico(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const [{ data: servicios }, { data: disp }] = await Promise.all([
    admin.from('citas_servicios').select('*')
      .eq('studio_id', studioId).eq('activo', true).eq('auto_reservable', true)
      .order('orden', { ascending: true }),
    admin.from('citas_disponibilidad').select('*').eq('studio_id', studioId),
  ]);
  return {
    servicios: (servicios ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
    disponibilidad: (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
  };
}

export async function fetchHuecosCitaPublico(params: {
  studioId: string; servicioId: string; instructorId: string; fechaLocal: string; ahora?: Date;
}): Promise<{ error: string } | { ok: true; huecos: HuecoCita[] }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const { data: disp } = await admin.from('citas_disponibilidad').select('*')
    .eq('studio_id', params.studioId).eq('instructor_id', params.instructorId);
  const franjas = (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad))
    .map((f) => ({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin }));

  const desde = horaParedAInstante(params.fechaLocal, '00:00');
  const hasta = new Date(desde.getTime() + 36 * 3600 * 1000);
  const ocupados = await cargarOcupadosInstructora(
    admin, params.studioId, params.instructorId, desde.toISOString(), hasta.toISOString(),
  );

  const huecos = generarHuecosDia({
    fechaLocal: params.fechaLocal, franjas, duracionMin: servicio.duracionMin,
    ocupados, ahora: params.ahora ?? new Date(),
  });
  return { ok: true, huecos };
}

export async function crearCitaPublica(params: {
  studioId: string; servicioId: string; instructorId: string; inicioISO: string;
  socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' as const };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const inicio = new Date(params.inicioISO);
  if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) {
    return { error: 'Esa hora no es válida' as const };
  }
  const finISO = new Date(inicio.getTime() + servicio.duracionMin * 60000).toISOString();

  const { data: instr } = await admin.from('instructores').select('id, activo')
    .eq('id', params.instructorId).eq('studio_id', params.studioId).maybeSingle();
  if (!instr || !instr.activo) return { error: 'Instructora no disponible' as const };

  const { data: disp } = await admin.from('citas_disponibilidad').select('*')
    .eq('studio_id', params.studioId).eq('instructor_id', params.instructorId);
  const franjas = (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad))
    .map((f) => ({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin }));
  if (!dentroDeDisponibilidad({ inicioISO: inicio.toISOString(), finISO, franjas })) {
    return { error: 'Ese hueco no está disponible' as const };
  }

  const citaId = `cita-${uid()}`;
  const { data, error } = await admin.rpc('reservar_cita', {
    p_id: citaId, p_studio_id: params.studioId, p_socio_id: params.socioId,
    p_instructor_id: params.instructorId, p_servicio_id: params.servicioId,
    p_tipo: servicio.tipo, p_inicio: inicio.toISOString(), p_fin: finISO,
    p_precio: servicio.precio, p_notas: null,
  });
  if (error) return { error: error.message };
  const estado = (Array.isArray(data) ? data[0] : data) as string;
  if (estado === 'CONFLICTO') return { error: 'Ese hueco ya no está disponible' as const };

  return {
    ok: true as const, citaId, estado: 'CONFIRMADA' as const,
    inicio: inicio.toISOString(), fin: finISO,
  };
}

export async function cancelarCitaPublica(params: {
  studioId: string; citaId: string; socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: cita } = await admin.from('citas').select('id, socio_id, inicio, estado')
    .eq('id', params.citaId).eq('studio_id', params.studioId).maybeSingle();
  if (!cita || cita.socio_id !== params.socioId) return { error: 'Cita no encontrada' as const };
  if (cita.estado === 'CANCELADA') return { ok: true as const };
  if (new Date(cita.inicio as string).getTime() <= Date.now()) {
    return { error: 'Esta cita ya ha pasado' as const };
  }
  const { error } = await admin.from('citas').update({ estado: 'CANCELADA' })
    .eq('id', params.citaId).eq('studio_id', params.studioId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// ─── Public authentication ───────────────────────────────────────────────────

export async function resolverSociaAutenticada(slug: string, authUserId: string, email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: studio } = await admin.from('studios').select('id').eq('slug', slug).maybeSingle();
  if (!studio) return null;

  const { data: linked } = await admin
    .from('socios').select('id, nombre, apellidos, email')
    .eq('auth_user_id', authUserId).eq('studio_id', studio.id).maybeSingle();
  if (linked) {
    return { socioId: linked.id, nombre: `${linked.nombre} ${linked.apellidos}`.trim(), email: linked.email };
  }

  const { data: claimable } = await admin
    .from('socios').select('id, nombre, apellidos, email')
    .ilike('email', email.trim()).eq('studio_id', studio.id).is('auth_user_id', null).maybeSingle();
  if (!claimable) return null;
  await admin.from('socios').update({ auth_user_id: authUserId }).eq('id', claimable.id);
  return { socioId: claimable.id, nombre: `${claimable.nombre} ${claimable.apellidos}`.trim(), email: claimable.email };
}

export async function socioAutenticado(authUserId: string, studioId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('socios').select('id')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  return data?.id ?? null;
}

export async function registrarSociaPublica(params: {
  studioId: string; id: string; nombre: string; email: string;
  authUserId?: string;
  aceptacion?: { fecha: string; firma: string; versionTexto: string };
  referidoPor?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: studio } = await admin.from('studios').select('id').eq('id', params.studioId).maybeSingle();
  if (!studio) return { error: 'Estudio no encontrado' as const };

  if (params.authUserId) {
    const yaSocia = await socioAutenticado(params.authUserId, params.studioId);
    if (yaSocia) return { ok: true as const, socioId: yaSocia };
  }

  let referido: string | null = null;
  if (params.referidoPor && params.referidoPor !== params.id) {
    const { data } = await admin.from('socios').select('id').eq('id', params.referidoPor).eq('studio_id', params.studioId).maybeSingle();
    referido = data ? params.referidoPor : null;
  }

  const { error } = await admin.from('socios').insert({
    id: params.id, studio_id: params.studioId, nombre: params.nombre, apellidos: '',
    email: params.email, activo: true, fecha_alta: new Date().toISOString(),
    auth_user_id: params.authUserId ?? null,
    aceptacion_fecha: params.aceptacion?.fecha ?? null,
    aceptacion_firma: params.aceptacion?.firma ?? null,
    aceptacion_version: params.aceptacion?.versionTexto ?? null,
    referido_por: referido,
  });
  if (error) return { error: error.message };
  return { ok: true as const };
}

const CAMPOS_SOCIA_EDITABLES: Record<string, string> = {
  telefono: 'telefono', nif: 'nif', avatar: 'avatar', fotoUrl: 'foto_url',
  fechaNacimiento: 'fecha_nacimiento', direccion: 'direccion',
};

export async function actualizarSociaPublica(params: {
  studioId: string; socioId: string; email: string; cambios: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const db: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(CAMPOS_SOCIA_EDITABLES)) {
    if (camel in params.cambios) db[snake] = params.cambios[camel];
  }
  const ac = params.cambios.aceptacionContrato as
    { fecha?: string; firma?: string; versionTexto?: string } | undefined;
  if (ac && typeof ac === 'object') {
    db.aceptacion_fecha = ac.fecha ?? null;
    db.aceptacion_firma = ac.firma ?? null;
    db.aceptacion_version = ac.versionTexto ?? null;
  }
  if (Object.keys(db).length === 0) return { ok: true as const };
  const { error } = await admin.from('socios').update(db).eq('id', params.socioId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function guardarPreferenciasPublica(params: {
  studioId: string; socioId: string; email: string; cambios: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: existente } = await admin
    .from('preferencias_socio').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId).maybeSingle();
  const COLUMNA_PREF: Record<string, string> = {
    disponibilidad: 'disponibilidad',
    instructorFavoritoId: 'instructor_favorito_id',
    tipoClaseFavorita: 'tipo_clase_favorita',
    duracionPreferida: 'duracion_preferida',
    nivel: 'nivel',
    notifEmail: 'notif_email',
    notifWhatsapp: 'notif_whatsapp',
  };
  const cambiosSnake: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params.cambios)) {
    const col = COLUMNA_PREF[k];
    if (col) cambiosSnake[col] = v;
  }
  const fila = {
    socio_id: params.socioId, studio_id: params.studioId,
    ...(existente ?? {}), ...cambiosSnake, actualizado_en: new Date().toISOString(),
  };
  const { error } = await admin.from('preferencias_socio').upsert(fila, { onConflict: 'socio_id' });
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function canjearRecompensaPublica(params: {
  studioId: string; socioId: string; email: string; catalogItemId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const [{ data: itemRow }, { data: credRow }] = await Promise.all([
    admin.from('reward_catalog').select('*').eq('id', params.catalogItemId).eq('studio_id', params.studioId).maybeSingle(),
    admin.from('member_credits').select('*').eq('socio_id', params.socioId).maybeSingle(),
  ]);
  const item = itemRow ? {
    id: itemRow.id, studioId: itemRow.studio_id, nombre: itemRow.nombre,
    descripcion: itemRow.descripcion ?? null, costeCreditos: itemRow.coste_creditos,
    icono: itemRow.icono, activo: itemRow.activo, stock: itemRow.stock ?? null, creadoEn: itemRow.creado_en,
  } : undefined;
  const saldo = credRow ? credRow.saldo : 0;

  const validacion = validarCanje(item, saldo);
  if ('error' in validacion) return validacion;
  if (!item) return { error: 'Esta recompensa ya no está disponible.' as const };

  const now = new Date().toISOString();
  const redemptionId = `rwd-${uid()}`;

  const stockLimitado = item.stock != null;
  if (stockLimitado) {
    const { error: stockErr } = await admin.rpc('ajustar_stock', {
      p_item_id: params.catalogItemId, p_studio_id: params.studioId, p_delta: -1,
    });
    if (stockErr) {
      if (stockErr.message.includes('SIN_STOCK')) return { error: 'Esta recompensa está agotada.' as const };
      return { error: stockErr.message };
    }
  }

  const { error: credErr } = await admin.rpc('ajustar_creditos', {
    p_socio_id: params.socioId, p_studio_id: params.studioId,
    p_delta_saldo: -item.costeCreditos, p_delta_ganado: 0, p_delta_canjeado: item.costeCreditos,
  });
  if (credErr) {
    if (stockLimitado) {
      await admin.rpc('ajustar_stock', { p_item_id: params.catalogItemId, p_studio_id: params.studioId, p_delta: 1 });
    }
    if (credErr.message.includes('SALDO_INSUFICIENTE')) return { error: 'Saldo insuficiente' as const };
    return { error: credErr.message };
  }

  await Promise.all([
    admin.from('reward_redemptions').insert({
      id: redemptionId, studio_id: params.studioId, socio_id: params.socioId,
      catalog_item_id: params.catalogItemId, creditos_gastados: item.costeCreditos, estado: 'PENDIENTE', creado_en: now,
    }),
    admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: params.studioId, socio_id: params.socioId, tipo: 'CANJE',
      creditos: -item.costeCreditos, descripcion: `Canje: ${item.nombre}`, ref_id: redemptionId, creado_en: now,
    }),
  ]);
  return { ok: true as const };
}

// ─── Kiosk operations ────────────────────────────────────────────────────────

export async function validarKioskToken(studioId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from('studios').select('kiosk_token').eq('id', studioId).maybeSingle();
  const esperado = (data?.kiosk_token ?? '') as string;
  return esperado.length > 0 && esperado === token;
}

export async function checkinPublico(params: { studioId: string; reservaId: string }) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: resRow } = await admin
    .from('reservas').select('*').eq('id', params.reservaId).eq('studio_id', params.studioId).maybeSingle();
  if (!resRow) return { error: 'Reserva no encontrada' as const };
  const reserva = _mapReserva(resRow as RowReservas);
  if (reserva.estado === 'ASISTIDA') return { ok: true as const };

  await admin.from('reservas').update({ estado: 'ASISTIDA', check_in_en: new Date().toISOString() }).eq('id', params.reservaId);

  await otorgarCreditosServidor(admin, params.studioId, reserva.socioId, 'ASISTENCIA_CLASE', params.reservaId);

  const { data: todasRes } = await admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', reserva.socioId);
  const reservasTrasCheckin = (todasRes ?? []).map(_mapReserva)
    .map(r => r.id === reserva.id ? { ...r, estado: 'ASISTIDA' as const } : r);
  const [{ data: sociaRow }, { data: rulesRows }, { data: actionRows }] = await Promise.all([
    admin.from('socios').select('*').eq('id', reserva.socioId).maybeSingle(),
    admin.from('reward_rules').select('*').eq('studio_id', params.studioId),
    admin.from('reward_actions').select('*').eq('studio_id', params.studioId),
  ]);
  const regla = (rulesRows ?? []).map(_mapRewardRule).find(r => r.trigger === 'REFERIDO_AMIGO' && r.activa) ?? null;
  const { premiar, referidorId } = decidirPremioReferido({
    socia: sociaRow ? _mapSocio(sociaRow as RowSocios) : undefined,
    reservasTrasCheckin,
    rewardActions: (actionRows ?? []).map(_mapRewardAction),
    topeMensual: regla?.topeMensual ?? null,
    ahora: new Date(),
  });
  if (premiar && referidorId) {
    await otorgarCreditosServidor(admin, params.studioId, referidorId, 'REFERIDO_AMIGO', reserva.socioId);
    await evaluarGamificacionServidor(admin, params.studioId, referidorId);
  }
  await evaluarGamificacionServidor(admin, params.studioId, reserva.socioId);
  return { ok: true as const };
}

// ─── Write operations (all CRUD) ──────────────────────────────────────────────

export async function dbInsertSesion(ses: Sesion) {
  const { error } = await supabase.from('sesiones').insert(_sesionToDb(ses));
  if (error) reportDbError('[dbInsertSesion]', error);
}

export async function dbInsertSesionesBatch(sesiones: Sesion[]) {
  if (sesiones.length === 0) return;
  const { error } = await supabase.from('sesiones').insert(sesiones.map(_sesionToDb));
  if (error) reportDbError('[dbInsertSesionesBatch]', error);
}

export async function dbUpdateSesionesBatch(ids: string[], changes: Partial<Sesion>) {
  if (ids.length === 0) return;
  const db: Record<string, unknown> = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if (Object.keys(db).length === 0) return;
  const { error } = await supabase.from('sesiones').update(db).in('id', ids);
  if (error) reportDbError('[dbUpdateSesionesBatch]', error);
}

export async function dbUpdateSesion(id: string, changes: Partial<Sesion>) {
  const db: Record<string, unknown> = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if ('precioPuntual' in changes) db.precio_puntual = changes.precioPuntual;
  if ('googleEventId' in changes) db.google_event_id = changes.googleEventId;
  if ('serieId' in changes) db.serie_id = changes.serieId;
  const { error } = await supabase.from('sesiones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSesion]', error);
}

export async function dbDeleteSesion(id: string) {
  const { error } = await supabase.from('sesiones').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteSesion]', error);
}

export async function dbInsertReserva(res: Reserva) {
  const { error } = await supabase.from('reservas').insert(_reservaToDb(res));
  if (error) reportDbError('[dbInsertReserva]', error);
}

export async function dbReservarPlaza(
  studioId: string, sesionId: string, socioId: string, reservaId: string,
): Promise<{ estado: string; posicionEspera: number | null } | { error: string }> {
  const { data, error } = await supabase.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
  });
  if (error) { reportDbError('[dbReservarPlaza]', error); return { error: error.message }; }
  const row = Array.isArray(data) ? data[0] : data;
  return { estado: row?.estado ?? 'CONFIRMADA', posicionEspera: row?.posicion_espera ?? null };
}

export async function dbCancelarReservaPlaza(
  studioId: string, reservaId: string,
): Promise<{ eraConfirmada: boolean; promovidaSocioId: string | null } | { error: string }> {
  const { data, error } = await supabase.rpc('cancelar_reserva_plaza', {
    p_studio_id: studioId, p_reserva_id: reservaId, p_socio_id: null,
  });
  if (error) { reportDbError('[dbCancelarReservaPlaza]', error); return { error: error.message }; }
  const row = Array.isArray(data) ? data[0] : data;
  return { eraConfirmada: !!row?.era_confirmada, promovidaSocioId: row?.promovida_socio_id ?? null };
}

export async function dbUpdateReserva(id: string, changes: Partial<Reserva>) {
  const db: Record<string, unknown> = {};
  if ('sesionId' in changes) db.sesion_id = changes.sesionId;
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('spotId' in changes) db.spot_id = changes.spotId;
  if ('posicionEspera' in changes) db.posicion_espera = changes.posicionEspera;
  if ('checkInEn' in changes) db.check_in_en = changes.checkInEn;
  const { error } = await supabase.from('reservas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateReserva]', error);
}

export async function dbInsertRecibo(rec: Recibo) {
  const { error } = await supabase.from('recibos').insert(_reciboToDb(rec));
  if (error) reportDbError('[dbInsertRecibo]', error);
}

export async function dbUpdateRecibo(id: string, changes: Partial<Recibo>) {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('suscripcionId' in changes) db.suscripcion_id = changes.suscripcionId;
  if ('concepto' in changes) db.concepto = changes.concepto;
  if ('importe' in changes) db.importe = changes.importe;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaVencimiento' in changes) db.fecha_vencimiento = changes.fechaVencimiento;
  if ('fechaCobro' in changes) db.fecha_cobro = changes.fechaCobro;
  if ('fechaDevolucion' in changes) db.fecha_devolucion = changes.fechaDevolucion;
  if ('intentosReintento' in changes) db.intentos_reintento = changes.intentosReintento;
  if ('metodoCobro' in changes) db.metodo_cobro = changes.metodoCobro;
  if ('sepaEstado' in changes) db.sepa_estado = changes.sepaEstado;
  if ('proximoReintento' in changes) db.proximo_reintento = changes.proximoReintento;
  const { error } = await supabase.from('recibos').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateRecibo]', error);
}

export async function dbUpdateRecibosBatch(ids: string[], changes: Partial<Recibo>) {
  if (ids.length === 0) return;
  const db: Record<string, unknown> = {};
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaCobro' in changes) db.fecha_cobro = changes.fechaCobro;
  if ('fechaDevolucion' in changes) db.fecha_devolucion = changes.fechaDevolucion;
  if ('intentosReintento' in changes) db.intentos_reintento = changes.intentosReintento;
  if (Object.keys(db).length === 0) return;
  const { error } = await supabase.from('recibos').update(db).in('id', ids);
  if (error) reportDbError('[dbUpdateRecibosBatch]', error);
}

export async function dbDeleteRecibo(id: string) {
  const { error } = await supabase.from('recibos').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteRecibo]', error);
}

export async function dbInsertCita(cita: Cita) {
  const { error } = await supabase.from('citas').insert(_citaToDb(cita));
  if (error) reportDbError('[dbInsertCita]', error);
}

export async function dbUpdateCita(id: string, changes: Partial<Cita>) {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('notas' in changes) db.notas = changes.notas;
  if ('estado' in changes) db.estado = changes.estado;
  if ('precio' in changes) db.precio = changes.precio;
  if ('pagada' in changes) db.pagada = changes.pagada;
  const { error } = await supabase.from('citas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCita]', error);
}

export async function dbInsertVentaPOS(venta: VentaPOS) {
  const { error } = await supabase.from('ventas_pos').insert(_ventaPOSToDb(venta));
  if (error) reportDbError('[dbInsertVentaPOS]', error);
}

export async function dbInsertProductoPOS(prod: ProductoPOS) {
  const { error } = await supabase.from('productos_pos').insert({
    id: prod.id,
    studio_id: prod.studioId ?? getCurrentStudioId(),
    nombre: prod.nombre,
    categoria: prod.categoria,
    precio: prod.precio,
    activo: prod.activo,
  });
  if (error) reportDbError('[dbInsertProductoPOS]', error);
}

export async function dbUpdateProductoPOS(id: string, changes: Partial<ProductoPOS>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('categoria' in changes) db.categoria = changes.categoria;
  if ('precio' in changes) db.precio = changes.precio;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('productos_pos').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateProductoPOS]', error);
}

export async function dbDeleteProductoPOS(id: string) {
  const { error } = await supabase.from('productos_pos').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteProductoPOS]', error);
}

export async function dbInsertSuscripcion(sus: Suscripcion) {
  const { error } = await supabase.from('suscripciones').insert(_suscripcionToDb(sus));
  if (error) reportDbError('[dbInsertSuscripcion]', error);
}

export async function dbUpdateSuscripcion(id: string, changes: Partial<Suscripcion>) {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('planId' in changes) db.plan_id = changes.planId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  if ('sesionesRestantes' in changes) db.sesiones_restantes = changes.sesionesRestantes;
  if ('stripeSubscriptionId' in changes) db.stripe_subscription_id = changes.stripeSubscriptionId;
  const { error } = await supabase.from('suscripciones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSuscripcion]', error);
}

export async function dbMarcarNotificacionLeida(id: string) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
  if (error) reportDbError('[dbMarcarNotificacionLeida]', error);
}

export async function dbMarcarNotificacionesLeidas(studioId: string) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('studio_id', studioId).eq('leida', false);
  if (error) reportDbError('[dbMarcarNotificacionesLeidas]', error);
}

export async function dbUpsertPreferenciasSocio(p: PreferenciasSocio) {
  const row = {
    socio_id: p.socioId,
    studio_id: p.studioId ?? getCurrentStudioId(),
    disponibilidad: p.disponibilidad,
    instructor_favorito_id: p.instructorFavoritoId ?? null,
    tipo_clase_favorita: p.tipoClaseFavorita ?? null,
    duracion_preferida: p.duracionPreferida ?? null,
    nivel: p.nivel ?? null,
    notif_email: p.notifEmail,
    notif_whatsapp: p.notifWhatsapp,
    actualizado_en: new Date().toISOString(),
  };
  const { error } = await supabase.from('preferencias_socio').upsert(row, { onConflict: 'socio_id' });
  if (error) reportDbError('[dbUpsertPreferenciasSocio]', error);
}

export async function dbInsertServicioCita(s: ServicioCita) {
  const { error } = await supabase.from('citas_servicios').insert(_servicioCitaToDb(s));
  if (error) reportDbError('[dbInsertServicioCita]', error);
}

export async function dbUpdateServicioCita(id: string, changes: Partial<ServicioCita>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('duracionMin' in changes) db.duracion_min = changes.duracionMin;
  if ('precio' in changes) db.precio = changes.precio ?? null;
  if ('autoReservable' in changes) db.auto_reservable = changes.autoReservable;
  if ('color' in changes) db.color = changes.color ?? null;
  if ('descripcion' in changes) db.descripcion = changes.descripcion ?? null;
  if ('activo' in changes) db.activo = changes.activo;
  if ('orden' in changes) db.orden = changes.orden;
  const { error } = await supabase.from('citas_servicios').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateServicioCita]', error);
}

export async function dbDeleteServicioCita(id: string) {
  const { error } = await supabase.from('citas_servicios').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteServicioCita]', error);
}

export async function dbReplaceDisponibilidadCitas(
  studioId: string, instructorId: string, franjas: DisponibilidadCita[],
) {
  const { error: delErr } = await supabase.from('citas_disponibilidad')
    .delete().eq('studio_id', studioId).eq('instructor_id', instructorId);
  if (delErr) { reportDbError('[dbReplaceDisponibilidadCitas:del]', delErr); return; }
  if (franjas.length === 0) return;
  const rows = franjas.map((f) => ({
    id: f.id,
    studio_id: f.studioId ?? studioId,
    instructor_id: f.instructorId ?? instructorId,
    dia_semana: f.diaSemana,
    hora_inicio: f.horaInicio,
    hora_fin: f.horaFin,
    creado_en: f.creadoEn || new Date().toISOString(),
  }));
  const { error: insErr } = await supabase.from('citas_disponibilidad').insert(rows);
  if (insErr) reportDbError('[dbReplaceDisponibilidadCitas:ins]', insErr);
}
