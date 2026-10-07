// Reservas y check-ins de Wellhub contra la base de datos.
//
// Wellhub da 1 s para contestar a cada webhook y, tras un 200, no reintenta
// nunca. Así que cada webhook hace UNA escritura durable ANTES de contestar,
// con su clave natural, y lo que habla con Wellhub va después (`after()`); el
// cron (`conciliarWellhub`) rehace lo que quedara a medias:
//
//  · reserva pedida → `reservar_plaza_externa` (la plaza, con su candado) y la
//    reserva queda en `estado_externo = 'Requested'`; después, el PATCH RESERVED
//    (`sincronizarReservaWellhub`, que la coge antes: 'Confirming').
//  · cancelación    → `estado_externo = 'Cancelled' | 'LateCancellation'`;
//    después, la cancelación de verdad (dueño único: `ejecutarCancelacionReserva`).
//  · check-in       → una fila PENDIENTE en `plataforma_checkins`; después,
//    validarlo (`POST /access/v1/validate`), que es lo que cobra el estudio.
//
// Regla de negocio, no de reloj: una reserva pedida solo se cancela aquí cuando
// Wellhub CONTESTA que no (4xx) a su primer RESERVED. Sin respuesta, se conserva
// la plaza y se vuelve a intentar; y si un RESERVED anterior pudo llegar, un 4xx
// tampoco basta (su PATCH puede no admitir repetirse). Cancelarla a ciegas
// podría dejar a una socia con su reserva confirmada allí y sin plaza aquí.
//
// Y al revés: una reserva confirmada allí que el estudio cancela aquí se anula
// allí (CANCELLED_BY_GYM), o la socia la seguiría viendo en su app.
//
// ⚠️ Módulo LIGERO: lo importa el webhook, que tiene 1 s. Lo pesado
// (`supabase-data-admin`, avisos) se carga solo cuando hace falta.
import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  accionReservaWellhub, avisoValidacionWellhub, CESION_CONFIRMACION_MS, MINUTOS_PARA_CONTESTAR_RESERVA, rechazoWellhub,
  reservaDelCheckinWellhub, reservaPedidaCaducada, trasConfirmarWellhub, type EventoWellhub, type ResultadoValidacionWellhub,
} from '../wellhub-eventos.ts';
import { responderReservaWellhub, validarCheckinWellhub, type CredencialesWellhub } from './cliente.ts';

const PLATAFORMA = 'WELLHUB';
/** Si Wellhub no dice hasta cuándo se puede validar un check-in, su doc habla de 20 min. */
const MINUTOS_PARA_VALIDAR = 20;
/** Un «no tiene check-in» justo al llegar puede ser un retraso suyo: se reintenta un par de veces. */
const INTENTOS_SIN_CHECKIN = 3;

type ReservaPedida = Extract<EventoWellhub, { tipo: 'reserva-pedida' }>;
type Cancelacion = Extract<EventoWellhub, { tipo: 'reserva-cancelada' | 'reserva-cancelada-tarde' }>;
type Checkin = Extract<EventoWellhub, { tipo: 'checkin' }>;

const iso = (ms: number) => new Date(ms).toISOString();

// ── Conexiones (gym ↔ estudio, único por gym) ───────────────────────────────

export interface ConexionWellhub { studioId: string; gymId: string; productoId: number | null }

function conexionDeFila(f: { studio_id: string; id_externo: string; producto_externo_id: string | null }): ConexionWellhub {
  const p = Number(f.producto_externo_id);
  return { studioId: f.studio_id, gymId: f.id_externo, productoId: Number.isSafeInteger(p) && p > 0 ? p : null };
}

export async function conexionWellhubDeGym(admin: SupabaseClient, gymId: string): Promise<ConexionWellhub | null | 'error'> {
  const { data, error } = await admin.from('plataforma_conexiones')
    .select('studio_id, id_externo, producto_externo_id').eq('plataforma', PLATAFORMA).eq('id_externo', gymId).maybeSingle();
  if (error) return 'error';
  return data ? conexionDeFila(data as never) : null;
}

export async function conexionWellhubDeEstudio(admin: SupabaseClient, studioId: string): Promise<ConexionWellhub | null | 'error'> {
  const { data, error } = await admin.from('plataforma_conexiones')
    .select('studio_id, id_externo, producto_externo_id').eq('plataforma', PLATAFORMA).eq('studio_id', studioId).maybeSingle();
  if (error) return 'error';
  return data ? conexionDeFila(data as never) : null;
}

// ── Reserva pedida ──────────────────────────────────────────────────────────

export type ReservaPedidaRegistrada =
  /** Plaza dada y apuntada como 'Requested': falta confirmárselo a Wellhub. */
  | { tipo: 'aceptada'; studioId: string; sesionId: string; reservaId: string; repetida: boolean }
  /** No hay plaza (o no es nuestra): se le dice que no a Wellhub. */
  | { tipo: 'rechazada'; rechazo: ReturnType<typeof rechazoWellhub> }
  /** Más de 15 min tarde: Wellhub ya la rechazó sola. Nada que hacer. */
  | { tipo: 'caducada' }
  /** La base de datos no ha contestado: 500, para que Wellhub reintente. */
  | { tipo: 'error'; detalle: string };

const CODIGOS_RPC = [
  'AFORO_LLENO', 'CUPO_PLATAFORMA_AGOTADO', 'YA_RESERVADA', 'SESION_CANCELADA', 'ESTUDIO_CERRADO',
  'SESION_NO_ENCONTRADA', 'SESION_TERMINADA', 'TIPO_REQUIERE_AUTORIZACION', 'NOMBRE_REQUERIDO', 'ORIGEN_NO_VALIDO',
];

export async function registrarReservaPedidaWellhub(admin: SupabaseClient, e: ReservaPedida, ahora: number): Promise<ReservaPedidaRegistrada> {
  if (reservaPedidaCaducada(e.momento, ahora)) return { tipo: 'caducada' };

  const { data: evento, error: errEvento } = await admin.from('plataforma_eventos')
    .select('studio_id, sesion_id, estado_sync').eq('plataforma', PLATAFORMA).eq('evento_externo_id', e.slotId).maybeSingle();
  if (errEvento) return { tipo: 'error', detalle: errEvento.message };
  if (!evento) return { tipo: 'rechazada', rechazo: rechazoWellhub('SESION_NO_ENCONTRADA') };
  if (evento.estado_sync === 'CANCELADO' || !evento.sesion_id) return { tipo: 'rechazada', rechazo: rechazoWellhub('SESION_CANCELADA') };

  // El gym del evento tiene que ser el del estudio dueño de esa clase, y el
  // estudio tiene que seguir vendiendo en Wellhub.
  const [conexion, integracion] = await Promise.all([
    conexionWellhubDeEstudio(admin, evento.studio_id as string),
    admin.from('integraciones').select('activo').eq('studio_id', evento.studio_id).eq('tipo', PLATAFORMA).maybeSingle(),
  ]);
  if (conexion === 'error' || integracion.error) return { tipo: 'error', detalle: 'no se pudo leer la conexión del estudio' };
  if (!conexion || conexion.gymId !== e.gymId || !integracion.data?.activo) {
    return { tipo: 'rechazada', rechazo: rechazoWellhub('SESION_NO_ENCONTRADA') };
  }

  // Id determinista por reserva de Wellhub: si este mismo intento llegara dos
  // veces, la RPC lo reconoce también por el id externo.
  const reservaId = `res-wh-${e.bookingNumber}`;
  const { data, error } = await admin.rpc('reservar_plaza_externa', {
    p_studio_id: evento.studio_id,
    p_sesion_id: evento.sesion_id,
    p_reserva_id: reservaId,
    p_origen: PLATAFORMA,
    p_nombre: e.nombre,
    p_id_reserva_externa: e.bookingNumber,
    p_id_cliente_externo: e.wellhubId,
    p_exigir_cupo: true,
  });
  if (error) {
    // Un no de negocio (completa, cancelada…) se contesta; cualquier otro fallo
    // es de la base de datos y se reintenta.
    return CODIGOS_RPC.some(c => error.message.includes(c))
      ? { tipo: 'rechazada', rechazo: rechazoWellhub(error.message) }
      : { tipo: 'error', detalle: error.message };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { reserva_id?: string; repetida?: boolean } | null;
  const id = fila?.reserva_id ?? reservaId;

  // Lo que falta: decírselo a Wellhub. Hasta que conteste que sí, 'Requested'.
  const { error: errMarca } = await admin.from('reservas')
    .update({ estado_externo: 'Requested', estado_externo_en: iso(e.momento) })
    .eq('id', id).is('estado_externo', null);
  if (errMarca) return { tipo: 'error', detalle: errMarca.message };
  return { tipo: 'aceptada', studioId: evento.studio_id as string, sesionId: evento.sesion_id as string, reservaId: id, repetida: fila?.repetida === true };
}

/** Le dice que no a Wellhub. Si no llega, no pasa nada: a los 15 min la rechaza sola. */
export async function rechazarReservaWellhub(cred: CredencialesWellhub, gymId: string, bookingNumber: string, rechazo: ReturnType<typeof rechazoWellhub>) {
  const r = await responderReservaWellhub(cred, gymId, bookingNumber, { status: 'REJECTED', ...rechazo });
  if (r.desenlace !== 'hecho') {
    Sentry.captureMessage('[wellhub] no se pudo rechazar una reserva (la rechazará sola a los 15 min)', {
      level: 'info', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { status: r.status, categoria: rechazo.reason_category },
    });
  }
}

// ── Lo que le falta saber a Wellhub de cada reserva ─────────────────────────

interface FilaReservaWellhub {
  id: string; studio_id: string; sesion_id: string | null; estado: string;
  estado_externo: string | null; estado_externo_en: string | null; id_reserva_externa: string | null;
}
/** Cómo se leyó la reserva: un cambio solo se escribe si sigue así. */
type Leido = Pick<FilaReservaWellhub, 'estado_externo' | 'estado_externo_en'>;

export type SincronizacionReservaWellhub = 'confirmada' | 'cancelada' | 'anulada' | 'pendiente' | 'nada';

/**
 * Pone a Wellhub al día de una reserva suya (qué toca lo decide
 * `accionReservaWellhub`): le confirma la que pidió, le rechaza la que aquí ya
 * no está o le anula la que el estudio canceló aquí. Lo llaman el webhook
 * (después de contestar) y el cron. Para confirmar la COGE antes
 * ('Confirming'): mientras dura la cesión, nadie más le habla de ella a Wellhub.
 */
export async function sincronizarReservaWellhub(
  admin: SupabaseClient, cred: CredencialesWellhub, reservaId: string, ahora: number = Date.now(),
): Promise<SincronizacionReservaWellhub> {
  const { data, error } = await admin.from('reservas')
    .select('id, studio_id, sesion_id, estado, estado_externo, estado_externo_en, id_reserva_externa')
    .eq('id', reservaId).eq('origen', PLATAFORMA).maybeSingle();
  if (error) return 'pendiente';
  const r = data as FilaReservaWellhub | null;
  if (!r?.id_reserva_externa) return 'nada';
  const accion = accionReservaWellhub({ estado: r.estado, estadoExterno: r.estado_externo, estadoExternoEn: r.estado_externo_en }, ahora);
  if (accion === 'nada') return 'nada';
  if (accion === 'esperar') return 'pendiente';

  const gym = await gymDeLaReserva(admin, r);
  if (gym === 'error') return 'pendiente';
  if (!gym) {
    // Ni su clase ni el estudio tienen gym: no hay a quién decirle nada (si no
    // se le confirmó, Wellhub la rechaza sola). Se libera la plaza.
    return (await cancelarAquiWellhub(admin, r.studio_id, r.id, 'Cancelled', r)) ? 'cancelada' : 'nada';
  }
  const booking = r.id_reserva_externa;

  if (accion === 'rechazar') {
    // Allí nunca se confirmó: un REJECTED lo cierra.
    const no = await responderReservaWellhub(cred, gym, booking, { status: 'REJECTED', ...rechazoWellhub('SESION_CANCELADA') });
    if (no.desenlace === 'sin-saber') return sinRespuesta(no.status, r.id);
    return (await marcarExterno(admin, r.id, 'Cancelled', r)) ? 'cancelada' : 'nada';
  }

  if (accion === 'anular') {
    // Allí puede estar confirmada. De una 'Confirming' no se sabe si el RESERVED
    // llegó: primero REJECTED (por si sigue pedida) y, si no vale, CANCELLED_BY_GYM.
    if (r.estado_externo === 'Confirming') {
      const no = await responderReservaWellhub(cred, gym, booking, { status: 'REJECTED', ...rechazoWellhub('SESION_CANCELADA') });
      if (no.desenlace === 'sin-saber') return sinRespuesta(no.status, r.id);
      if (no.desenlace === 'hecho') return (await marcarExterno(admin, r.id, 'Cancelled', r)) ? 'anulada' : 'nada';
    }
    const res = await responderReservaWellhub(cred, gym, booking, { status: 'CANCELLED_BY_GYM', reason: 'Cancelled by the studio' });
    if (res.desenlace === 'sin-saber') return sinRespuesta(res.status, r.id);
    if (res.desenlace === 'definitivo') {
      // Ya no estaba (la anuló ella, o se fue con su slot borrado) o no lo admite: allí no hay más que hacer.
      Sentry.captureMessage('[wellhub] Wellhub no acepta anular una reserva que el estudio canceló', {
        level: 'info', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId: r.id, status: res.status, clave: res.clave },
      });
    }
    return (await marcarExterno(admin, r.id, 'Cancelled', r)) ? 'anulada' : 'nada';
  }

  // Confirmar. Se coge antes; si otro la cogió entre medias, es suya.
  const primera = r.estado_externo === 'Requested';
  const mia: Leido = { estado_externo: 'Confirming', estado_externo_en: iso(ahora) };
  if (!(await marcarExterno(admin, r.id, 'Confirming', r, mia.estado_externo_en as string))) return 'nada';
  const res = await responderReservaWellhub(cred, gym, booking, { status: 'RESERVED' });
  switch (trasConfirmarWellhub(res.status, primera)) {
    case 'reservada':
      await marcarExterno(admin, r.id, 'Booked', mia);
      return 'confirmada';
    case 'dudosa':
      // Un RESERVED anterior pudo llegar y su PATCH puede no admitir repetirse.
      Sentry.captureMessage('[wellhub] Wellhub contesta que no a un RESERVED repetido: se conserva la plaza', {
        level: 'warning', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId: r.id, status: res.status, clave: res.clave },
      });
      await marcarExterno(admin, r.id, 'Booked', mia);
      return 'confirmada';
    case 'rechazada':
      // Wellhub dice que no (la rechazó ya, o no la reconoce): la plaza vuelve aquí.
      Sentry.captureMessage('[wellhub] Wellhub no aceptó la confirmación de una reserva: cancelada aquí', {
        level: 'warning', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId: r.id, status: res.status, clave: res.clave },
      });
      return (await cancelarAquiWellhub(admin, r.studio_id, r.id, 'Cancelled', mia)) ? 'cancelada' : 'nada';
    case 'reintentar':
      return sinRespuesta(res.status, r.id);
  }
}

/** Sin respuesta útil: lo reintenta la próxima pasada. Si son nuestras credenciales, que lo vea alguien ya. */
function sinRespuesta(status: number, reservaId: string): 'pendiente' {
  if (status === 401 || status === 403) {
    Sentry.captureMessage('[wellhub] Wellhub rechaza las credenciales de Tentare', {
      level: 'error', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId, status }, fingerprint: ['wellhub-credenciales'],
    });
  }
  return 'pendiente';
}

/**
 * El gym en que se publicó la clase de la reserva (su slot → su clase), no el
 * de hoy: si el estudio cambió de gym, la reserva sigue siendo del viejo. Sin
 * ese rastro, el de la conexión.
 */
async function gymDeLaReserva(admin: SupabaseClient, r: FilaReservaWellhub): Promise<string | null | 'error'> {
  if (r.sesion_id) {
    const { data: slot, error } = await admin.from('plataforma_eventos').select('contenedor_externo_id')
      .eq('plataforma', PLATAFORMA).eq('sesion_id', r.sesion_id).maybeSingle();
    if (error) return 'error';
    if (slot?.contenedor_externo_id) {
      const { data: clase, error: errClase } = await admin.from('plataforma_clases').select('contenedor_externo_id')
        .eq('plataforma', PLATAFORMA).eq('studio_id', r.studio_id).eq('clase_externa_id', slot.contenedor_externo_id).maybeSingle();
      if (errClase) return 'error';
      if (clase?.contenedor_externo_id) return clase.contenedor_externo_id as string;
    }
  }
  const c = await conexionWellhubDeEstudio(admin, r.studio_id);
  return c === 'error' ? 'error' : c?.gymId ?? null;
}

/**
 * Cambia el estado externo solo si la reserva sigue como se leyó (estado y su
 * marca de tiempo): lo que otro proceso escribió entre medias manda.
 */
async function marcarExterno(
  admin: SupabaseClient, reservaId: string, estadoExterno: string, leido: Leido, en: string = iso(Date.now()),
): Promise<boolean> {
  let q = admin.from('reservas').update({ estado_externo: estadoExterno, estado_externo_en: en }).eq('id', reservaId);
  q = leido.estado_externo === null ? q.is('estado_externo', null) : q.eq('estado_externo', leido.estado_externo);
  q = leido.estado_externo_en === null ? q.is('estado_externo_en', null) : q.eq('estado_externo_en', leido.estado_externo_en);
  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Cancela aquí una reserva de Wellhub. Primero la marca (si el proceso muere
 * después, la conciliación la aplica) y después la cancelación de verdad. Con
 * `leido`, solo si la reserva sigue así.
 */
export async function cancelarAquiWellhub(
  admin: SupabaseClient, studioId: string, reservaId: string,
  estadoExterno: 'Cancelled' | 'LateCancellation', leido?: Leido,
): Promise<boolean> {
  if (leido) {
    if (!(await marcarExterno(admin, reservaId, estadoExterno, leido))) return false;
  } else {
    const { error } = await admin.from('reservas')
      .update({ estado_externo: estadoExterno, estado_externo_en: iso(Date.now()) }).eq('id', reservaId);
    if (error) throw new Error(error.message);
  }
  await aplicarCancelacionWellhub(admin, studioId, reservaId);
  return true;
}

// ── Cancelaciones ───────────────────────────────────────────────────────────

export type CancelacionRegistrada =
  | { tipo: 'registrada'; studioId: string; reservaId: string }
  | { tipo: 'desconocida' }
  | { tipo: 'error'; detalle: string };

export async function registrarCancelacionWellhub(admin: SupabaseClient, e: Cancelacion): Promise<CancelacionRegistrada> {
  // El estudio por el gym (único); sin gym en el evento, la reserva tiene que ser una sola.
  let studioId: string | null = null;
  if (e.gymId) {
    const c = await conexionWellhubDeGym(admin, e.gymId);
    if (c === 'error') return { tipo: 'error', detalle: 'no se pudo leer la conexión' };
    if (!c) return { tipo: 'desconocida' };
    studioId = c.studioId;
  }
  let q = admin.from('reservas').select('id, studio_id, estado_externo')
    .eq('origen', PLATAFORMA).eq('id_reserva_externa', e.bookingNumber).limit(2);
  if (studioId) q = q.eq('studio_id', studioId);
  const { data, error } = await q;
  if (error) return { tipo: 'error', detalle: error.message };
  if (!data || data.length !== 1) return { tipo: 'desconocida' };
  const r = data[0] as { id: string; studio_id: string; estado_externo: string | null };
  const estado = e.tipo === 'reserva-cancelada' ? 'Cancelled' : 'LateCancellation';
  if (r.estado_externo !== 'Cancelled' && r.estado_externo !== 'LateCancellation') {
    const { error: errMarca } = await admin.from('reservas')
      .update({ estado_externo: estado, estado_externo_en: iso(e.momento) }).eq('id', r.id);
    if (errMarca) return { tipo: 'error', detalle: errMarca.message };
  }
  return { tipo: 'registrada', studioId: r.studio_id, reservaId: r.id };
}

/**
 * La cancelación de verdad de lo que ya está marcado, por el dueño único de
 * cancelar y sin penalización del estudio (la de quien cancela tarde la pone
 * Wellhub). Solo una reserva viva: la que ya vino (o no vino) no se cancela.
 */
export async function aplicarCancelacionWellhub(admin: SupabaseClient, studioId: string, reservaId: string) {
  const { data, error } = await admin.from('reservas').select('estado').eq('id', reservaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.estado !== 'CONFIRMADA') return;
  const { ejecutarCancelacionReserva } = await import('@/lib/db/supabase-data-admin');
  const r = await ejecutarCancelacionReserva(admin, { studioId, reservaId, socioId: null, omitirPenalizacion: true });
  if ('error' in r) throw new Error(r.error);
}

// ── Check-ins ───────────────────────────────────────────────────────────────

export type CheckinRegistrado =
  | { tipo: 'registrado'; id: string }
  | { tipo: 'sin-estudio' }
  | { tipo: 'error'; detalle: string };

export async function registrarCheckinWellhub(admin: SupabaseClient, e: Checkin): Promise<CheckinRegistrado> {
  const c = await conexionWellhubDeGym(admin, e.gymId);
  if (c === 'error') return { tipo: 'error', detalle: 'no se pudo leer la conexión' };
  if (!c) return { tipo: 'sin-estudio' };
  const fila = {
    studio_id: c.studioId,
    plataforma: PLATAFORMA,
    id_cliente_externo: e.wellhubId,
    id_reserva_externa: e.bookingNumber,
    ocurrido_en: iso(e.momento),
    expira_en: iso(e.expira ?? e.momento + MINUTOS_PARA_VALIDAR * 60_000),
  };
  const { data, error } = await admin.from('plataforma_checkins').insert(fila).select('id').maybeSingle();
  if (!error && data) return { tipo: 'registrado', id: data.id as string };
  if (error?.code === '23505') {
    // El mismo check-in, otra vez (Wellhub reintenta): el que ya está.
    const { data: ya, error: errYa } = await admin.from('plataforma_checkins').select('id')
      .eq('plataforma', PLATAFORMA).eq('studio_id', c.studioId).eq('id_cliente_externo', e.wellhubId)
      .eq('ocurrido_en', fila.ocurrido_en).maybeSingle();
    if (errYa) return { tipo: 'error', detalle: errYa.message };
    return ya ? { tipo: 'registrado', id: ya.id as string } : { tipo: 'error', detalle: 'check-in duplicado sin fila' };
  }
  return { tipo: 'error', detalle: error?.message ?? 'sin fila' };
}

const FINALES: Partial<Record<ResultadoValidacionWellhub, string>> = {
  validado: 'VALIDADO', 'ya-validado': 'YA_VALIDADO', caducado: 'CADUCADO', cancelado: 'CANCELADO',
};

/**
 * Valida un check-in pendiente y, si vale, da a su socia por venida en su
 * clase. Con booking_number se casa por él, exacto; sin él, por el margen de la
 * clase, y solo si la validación es de AHORA (un «ya validado» sin reserva
 * puede ser el único check-in del día gastado en otra cosa).
 */
export async function resolverCheckinWellhub(admin: SupabaseClient, cred: CredencialesWellhub, checkinId: string, ahora: number = Date.now()) {
  const { data: ck } = await admin.from('plataforma_checkins')
    .select('id, studio_id, id_cliente_externo, id_reserva_externa, ocurrido_en, expira_en, estado, intentos')
    .eq('id', checkinId).maybeSingle();
  if (!ck || ck.estado !== 'PENDIENTE' || !ck.id_cliente_externo) return;
  const cerrar = (estado: string, extra: Record<string, unknown> = {}) => admin.from('plataforma_checkins')
    .update({ estado, id_cliente_externo: null, resuelto_en: new Date(ahora).toISOString(), intentos: (ck.intentos as number) + 1, ...extra })
    .eq('id', ck.id).eq('estado', 'PENDIENTE');

  if (ck.expira_en && Date.parse(ck.expira_en as string) < ahora) { await cerrar('CADUCADO'); return; }
  const conexion = await conexionWellhubDeEstudio(admin, ck.studio_id as string);
  if (conexion === 'error') return;
  if (!conexion) { await cerrar('ERROR'); return; }

  const r = await validarCheckinWellhub(cred, conexion.gymId, ck.id_cliente_externo as string);
  const final = FINALES[r];
  if (!final) {
    const intentos = (ck.intentos as number) + 1;
    if (r === 'sin-checkin' && intentos >= INTENTOS_SIN_CHECKIN) { await cerrar('SIN_CHECKIN'); return; }
    if (r === 'sin-permiso') {
      Sentry.captureMessage('[wellhub] Wellhub rechaza las credenciales de Tentare al validar', { level: 'error', tags: { area: 'plataformas', plataforma: 'wellhub' } });
    }
    await admin.from('plataforma_checkins').update({ intentos }).eq('id', ck.id).eq('estado', 'PENDIENTE');
    return;
  }

  let reservaId: string | null = null;
  if (r === 'validado' || (r === 'ya-validado' && ck.id_reserva_externa)) {
    reservaId = await reservaDeCheckin(admin, {
      studioId: ck.studio_id as string, wellhubId: ck.id_cliente_externo as string,
      bookingNumber: (ck.id_reserva_externa as string | null) ?? null, momento: Date.parse(ck.ocurrido_en as string),
    });
    if (reservaId) await darPorVenida(admin, reservaId, ck.ocurrido_en as string);
  }
  await cerrar(final, { reserva_id: reservaId });
}

async function reservaDeCheckin(
  admin: SupabaseClient, p: { studioId: string; wellhubId: string; bookingNumber: string | null; momento: number },
): Promise<string | null> {
  if (p.bookingNumber) {
    const { data } = await admin.from('reservas').select('id')
      .eq('studio_id', p.studioId).eq('origen', PLATAFORMA).eq('id_reserva_externa', p.bookingNumber).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  const { data } = await admin.from('reservas')
    .select('id, sesiones(inicio, fin)')
    .eq('studio_id', p.studioId).eq('origen', PLATAFORMA).eq('id_cliente_externo', p.wellhubId)
    .in('estado', ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);
  const candidatas = ((data ?? []) as unknown as { id: string; sesiones: { inicio: string; fin: string } | null }[])
    .flatMap(x => (x.sesiones ? [{ id: x.id, inicio: x.sesiones.inicio, fin: x.sesiones.fin }] : []));
  return reservaDelCheckinWellhub(candidatas, p.momento)?.id ?? null;
}

async function darPorVenida(admin: SupabaseClient, reservaId: string, cuando: string) {
  await admin.from('reservas')
    .update({ estado: 'ASISTIDA', check_in_en: cuando, estado_externo: 'CheckedIn' })
    .eq('id', reservaId).in('estado', ['CONFIRMADA', 'NO_ASISTIO']);
  // Una que ya constaba como venida (pasaron lista antes): solo su estado externo.
  await admin.from('reservas').update({ estado_externo: 'CheckedIn' }).eq('id', reservaId).eq('estado', 'ASISTIDA');
}

// ── Pasar lista (segundo método de validación que exige Wellhub) ────────────

/**
 * Al pasar lista a una socia de Wellhub (el panel o la app de la instructora),
 * se valida su check-in: es lo que hace que Wellhub pague la visita. Devuelve lo
 * que hay que decirle a recepción si Wellhub dice que no (`null` = todo bien o
 * nada que validar: una reserva apuntada a mano no trae su Wellhub ID).
 */
export async function validarAsistenciaWellhub(
  admin: SupabaseClient, cred: CredencialesWellhub | null, p: { studioId: string; reservaId: string },
): Promise<string | null> {
  if (!cred) return null;
  const { data: r } = await admin.from('reservas')
    .select('id, estado, estado_externo, id_cliente_externo')
    .eq('id', p.reservaId).eq('studio_id', p.studioId).eq('origen', PLATAFORMA).maybeSingle();
  if (!r || r.estado !== 'ASISTIDA' || !r.id_cliente_externo || r.estado_externo === 'CheckedIn') return null;
  const conexion = await conexionWellhubDeEstudio(admin, p.studioId);
  if (!conexion || conexion === 'error') return null;
  const res = await validarCheckinWellhub(cred, conexion.gymId, r.id_cliente_externo as string);
  if (res === 'validado' || res === 'ya-validado') {
    await admin.from('reservas').update({ estado_externo: 'CheckedIn' }).eq('id', r.id);
  }
  return avisoValidacionWellhub(res);
}

// ── Conciliación (lo primero de cada pasada del cron) ───────────────────────

export interface ResumenConciliacionWellhub {
  confirmadas: number;
  canceladas: number;
  anuladas: number;
  pendientes: number;
  checkins: number;
}

/**
 * Rehace lo que los webhooks dejaron a medias. Va lo PRIMERO de cada pasada:
 * el tope de llamadas no puede dejarlo para la siguiente.
 */
export async function conciliarWellhub(
  admin: SupabaseClient, cred: CredencialesWellhub, presupuesto: { quedan: number }, ahora: number = Date.now(),
): Promise<ResumenConciliacionWellhub> {
  const r: ResumenConciliacionWellhub = { confirmadas: 0, canceladas: 0, anuladas: 0, pendientes: 0, checkins: 0 };

  // 1) Cancelaciones marcadas y no aplicadas (no llaman a Wellhub).
  const { data: porCancelar } = await admin.from('reservas').select('id, studio_id')
    .eq('origen', PLATAFORMA).in('estado_externo', ['Cancelled', 'LateCancellation']).eq('estado', 'CONFIRMADA').limit(100);
  for (const c of porCancelar ?? []) {
    try { await aplicarCancelacionWellhub(admin, c.studio_id as string, c.id as string); r.canceladas++; } catch (e) {
      Sentry.captureException(e, { tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId: c.id } });
    }
  }

  // 2) Lo que le falta saber a Wellhub: lo que pidió y nadie le ha contestado,
  //    lo que se quedó a medias confirmándose (cesión caducada) y lo confirmado
  //    allí que el estudio canceló aquí.
  const [pedidas, aMedias, porAnular] = await Promise.all([
    admin.from('reservas').select('id, creado_en')
      .eq('origen', PLATAFORMA).eq('estado_externo', 'Requested').order('creado_en').limit(50),
    admin.from('reservas').select('id, creado_en')
      .eq('origen', PLATAFORMA).eq('estado_externo', 'Confirming').lt('estado_externo_en', iso(ahora - CESION_CONFIRMACION_MS))
      .order('creado_en').limit(50),
    admin.from('reservas').select('id, creado_en')
      .eq('origen', PLATAFORMA).eq('estado_externo', 'Booked').eq('estado', 'CANCELADA').limit(50),
  ]);
  const cola = [
    ...[...(pedidas.data ?? []), ...(aMedias.data ?? [])].map(f => ({ f, pedida: true })),
    ...(porAnular.data ?? []).map(f => ({ f, pedida: false })),
  ];
  for (const { f, pedida } of cola) {
    if (presupuesto.quedan <= 0) break;
    presupuesto.quedan--;
    let d: SincronizacionReservaWellhub;
    try { d = await sincronizarReservaWellhub(admin, cred, f.id as string, ahora); } catch (e) {
      Sentry.captureException(e, { tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId: f.id } });
      continue;
    }
    if (d === 'confirmada') r.confirmadas++;
    else if (d === 'cancelada') r.canceladas++;
    else if (d === 'anulada') r.anuladas++;
    else if (d === 'pendiente') {
      r.pendientes++;
      // Pedida y sin poder decírselo a Wellhub en su plazo: la plaza se conserva, pero alguien tiene que mirarlo.
      const desde = Date.parse((f.creado_en as string | null) ?? '');
      if (pedida && Number.isFinite(desde) && ahora - desde > MINUTOS_PARA_CONTESTAR_RESERVA * 60_000) {
        Sentry.captureMessage('[wellhub] reserva sin confirmar a Wellhub pasado su plazo', {
          level: 'warning', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { reservaId: f.id },
        });
      }
    }
  }

  // 3) Check-ins pendientes de validar.
  const { data: checkins } = await admin.from('plataforma_checkins').select('id')
    .eq('plataforma', PLATAFORMA).eq('estado', 'PENDIENTE').order('creado_en').limit(50);
  for (const c of checkins ?? []) {
    if (presupuesto.quedan <= 0) break;
    presupuesto.quedan--;
    try { await resolverCheckinWellhub(admin, cred, c.id as string, ahora); r.checkins++; } catch (e) {
      Sentry.captureException(e, { tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { checkinId: c.id } });
    }
  }
  return r;
}
