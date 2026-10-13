// Publica en Wellhub el horario de los estudios conectados y rehace lo que los
// webhooks dejaran a medias. Lo dispara pg_cron (app/api/cron/wellhub-horario),
// mismo patrón que usc-horario: barrido de las próximas dos semanas, un fallo
// puntual no para el resto, y nada que se cree allí se queda sin apuntar aquí.
//
// Qué decide qué: `planificarHorarioWellhub` (puro, con tests) dice qué llamadas
// hacen falta; esto solo lee de la base de datos, las ejecuta y guarda lo
// enviado. Un estudio publica si tiene su gym en `plataforma_conexiones` (con
// producto) Y vende en Wellhub (`integraciones` activa, con contrato y sin
// suspender: venta-externa.ts). Si deja de vender, o pierde la conexión, se
// retira lo publicado con el gym de entonces — nunca con la conexión de hoy,
// que puede no existir.
import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planificarHorarioWellhub, VENTANA_PUBLICACION_DIAS_WELLHUB,
  type ClaseWellhubGuardada, type ConfigWellhub, type OperacionWellhub, type SesionParaWellhub, type SlotWellhubGuardado,
} from './horario.ts';
import {
  aforoSlotWellhub, borrarSlotWellhub, credencialesWellhub, crearClaseWellhub, crearSlotWellhub, editarClaseWellhub,
  editarSlotWellhub, ocultarClaseWellhub, type CredencialesWellhub,
} from './cliente.ts';
import { cancelarAquiWellhub, conciliarWellhub, type ResumenConciliacionWellhub } from './servidor.ts';
import { estudiosSinVentaExterna } from '../venta-externa.ts';

const PLATAFORMA = 'WELLHUB';
/** Tope de llamadas por pasada: el cron tiene 60 s y cada llamada ~0,3-1 s. */
const MAX_LLAMADAS = 60;

export interface ResumenHorarioWellhub {
  sinCredenciales?: true;
  conciliacion?: ResumenConciliacionWellhub;
  estudios: number;
  clases: number;
  creados: number;
  editados: number;
  borrados: number;
  aforos: number;
  fallidas: number;
  pendientes: number;
}

async function todas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

interface FilaSesion {
  id: string; inicio: string; fin: string; cancelada: boolean | null; aforo_maximo: number; tipo_clase_id: string | null;
  tipos_clase: { nombre: string; descripcion: string | null; ventana_cancelacion_horas: number | null } | null;
  salas: { nombre: string | null } | null;
  instructores: { nombre: string | null } | null;
}

async function cargarEstudio(admin: SupabaseClient, studioId: string, ahora: number) {
  const desde = new Date(ahora).toISOString();
  const hasta = new Date(ahora + VENTANA_PUBLICACION_DIAS_WELLHUB * 86_400_000).toISOString();
  const COLS = 'id, inicio, fin, cancelada, aforo_maximo, tipo_clase_id, tipos_clase(nombre, descripcion, ventana_cancelacion_horas), salas(nombre), instructores(nombre)';

  const [estudio, slots, clases, cupos, tipos] = await Promise.all([
    admin.from('studios').select('cancelacion_ventana_horas').eq('id', studioId).maybeSingle(),
    admin.from('plataforma_eventos')
      .select('sesion_id, evento_externo_id, contenedor_externo_id, estado_sync, huella, ocupadas_enviadas')
      .eq('studio_id', studioId).eq('plataforma', PLATAFORMA),
    admin.from('plataforma_clases')
      .select('tipo_clase_id, contenedor_externo_id, clase_externa_id, visible, huella')
      .eq('studio_id', studioId).eq('plataforma', PLATAFORMA),
    admin.from('plataforma_cupos').select('tipo_clase_id, sesion_id, plazas').eq('studio_id', studioId).eq('plataforma', PLATAFORMA),
    admin.from('tipos_clase').select('id, nombre, descripcion').eq('studio_id', studioId),
  ]);
  for (const r of [estudio, slots, clases, cupos, tipos]) if (r.error) throw new Error(r.error.message);

  const enVentana = await todas<FilaSesion>((a, b) => admin.from('sesiones').select(COLS)
    .eq('studio_id', studioId).gte('inicio', desde).lte('inicio', hasta).order('inicio').range(a, b) as never);

  // Las sesiones de slots vivos que caen fuera de la ventana (ya empezadas o
  // movidas lejos) TAMBIÉN se cargan: si no, el planificador las daría por
  // borradas y borraría en Wellhub una clase que sigue existiendo.
  const vistas = new Set(enVentana.map(s => s.id));
  const faltan = (slots.data ?? [])
    .filter(e => e.estado_sync !== 'CANCELADO' && e.sesion_id && !vistas.has(e.sesion_id))
    .map(e => e.sesion_id as string);
  const fuera: FilaSesion[] = [];
  for (let i = 0; i < faltan.length; i += 200) {
    const { data, error } = await admin.from('sesiones').select(COLS).in('id', faltan.slice(i, i + 200));
    if (error) throw new Error(error.message);
    fuera.push(...((data ?? []) as unknown as FilaSesion[]));
  }
  const filas = [...enVentana, ...fuera];

  const ocupadas = new Map<string, number>();
  const deWellhub = new Map<string, number>();
  const ids = filas.map(s => s.id);
  for (let i = 0; i < ids.length; i += 200) {
    const reservas = await todas<{ sesion_id: string; origen: string }>((a, b) => admin.from('reservas').select('sesion_id, origen')
      .in('sesion_id', ids.slice(i, i + 200)).in('estado', ['CONFIRMADA', 'ASISTIDA']).range(a, b) as never);
    for (const r of reservas) {
      ocupadas.set(r.sesion_id, (ocupadas.get(r.sesion_id) ?? 0) + 1);
      if (r.origen === PLATAFORMA) deWellhub.set(r.sesion_id, (deWellhub.get(r.sesion_id) ?? 0) + 1);
    }
  }

  const cupoSesion = new Map<string, number>();
  const cupoTipo = new Map<string, number>();
  for (const c of cupos.data ?? []) {
    if (c.sesion_id) cupoSesion.set(c.sesion_id, c.plazas);
    else if (c.tipo_clase_id) cupoTipo.set(c.tipo_clase_id, c.plazas);
  }
  const ventanaEstudio = (estudio.data as { cancelacion_ventana_horas?: number | null } | null)?.cancelacion_ventana_horas ?? null;

  const sesiones: SesionParaWellhub[] = filas.map(s => ({
    id: s.id,
    inicio: s.inicio,
    fin: s.fin,
    cancelada: s.cancelada === true,
    aforo: s.aforo_maximo,
    tipoClaseId: s.tipo_clase_id,
    sala: s.salas?.nombre ?? null,
    instructora: s.instructores?.nombre ?? null,
    cancelacionHoras: s.tipos_clase?.ventana_cancelacion_horas ?? ventanaEstudio,
    cupo: cupoSesion.get(s.id) ?? (s.tipo_clase_id ? cupoTipo.get(s.tipo_clase_id) : undefined) ?? null,
    ocupadas: ocupadas.get(s.id) ?? 0,
    ocupadasWellhub: deWellhub.get(s.id) ?? 0,
  }));

  const guardadosClases: ClaseWellhubGuardada[] = (clases.data ?? []).map(c => ({
    tipoClaseId: c.tipo_clase_id, gymId: c.contenedor_externo_id, claseId: c.clase_externa_id, visible: c.visible !== false, huella: c.huella,
  }));
  const guardadosSlots: SlotWellhubGuardado[] = (slots.data ?? []).flatMap(e => (e.contenedor_externo_id ? [{
    sesionId: e.sesion_id, slotId: e.evento_externo_id, claseId: e.contenedor_externo_id,
    borrado: e.estado_sync === 'CANCELADO', huella: e.huella, ocupadasEnviadas: e.ocupadas_enviadas,
  }] : []));

  return {
    sesiones,
    tipos: (tipos.data ?? []).map(t => ({ id: t.id as string, nombre: t.nombre as string, descripcion: (t.descripcion as string | null) ?? null })),
    clases: guardadosClases,
    slots: guardadosSlots,
  };
}

const coste = (op: OperacionWellhub) => (op.tipo === 'crear-clase' || op.tipo === 'ocultar-clase' ? 2 : 1);

async function ejecutar(
  admin: SupabaseClient, cred: CredencialesWellhub, studioId: string, cfg: ConfigWellhub,
  gymDeClase: Map<string, string>, claseDeTipo: Map<string, string>, op: OperacionWellhub, r: ResumenHorarioWellhub,
) {
  const ahoraIso = new Date().toISOString();
  const errorSlot = async (slotId: string, error: string) => {
    r.fallidas++;
    await admin.from('plataforma_eventos').update({ error: error.slice(0, 500) }).eq('plataforma', PLATAFORMA).eq('evento_externo_id', slotId);
  };
  const errorClase = async (claseId: string, error: string) => {
    r.fallidas++;
    await admin.from('plataforma_clases').update({ error: error.slice(0, 500) }).eq('plataforma', PLATAFORMA).eq('clase_externa_id', claseId);
  };

  switch (op.tipo) {
    case 'crear-clase': {
      const res = await crearClaseWellhub(cred, cfg.gymId, op.cuerpo);
      if (!res.ok) { r.fallidas++; Sentry.captureMessage('[wellhub-horario] no se pudo crear la clase', { level: 'warning', extra: { studioId, error: res.error } }); return; }
      const { error } = await admin.from('plataforma_clases').upsert({
        studio_id: studioId, plataforma: PLATAFORMA, tipo_clase_id: op.tipoClaseId, contenedor_externo_id: cfg.gymId,
        clase_externa_id: res.valor, visible: true, huella: op.huella, error: null, sincronizado_en: ahoraIso,
      }, { onConflict: 'plataforma,studio_id,tipo_clase_id,contenedor_externo_id' });
      // Si no se puede apuntar, la siguiente pasada la adopta por `reference` (no se duplica).
      if (error) { r.fallidas++; return; }
      claseDeTipo.set(op.tipoClaseId, res.valor);
      gymDeClase.set(res.valor, cfg.gymId);
      r.clases++;
      return;
    }
    case 'editar-clase': {
      const gym = gymDeClase.get(op.claseId) ?? cfg.gymId;
      const res = await editarClaseWellhub(cred, gym, op.claseId, op.cuerpo);
      if (!res.ok) return errorClase(op.claseId, res.error);
      await admin.from('plataforma_clases').update({ huella: op.huella, visible: true, error: null, sincronizado_en: ahoraIso })
        .eq('plataforma', PLATAFORMA).eq('clase_externa_id', op.claseId);
      r.clases++;
      return;
    }
    case 'ocultar-clase': {
      const gym = gymDeClase.get(op.claseId);
      if (!gym) return;
      const res = await ocultarClaseWellhub(cred, gym, op.claseId);
      if (!res.ok) return errorClase(op.claseId, res.error);
      await admin.from('plataforma_clases').update({ visible: false, error: null, sincronizado_en: ahoraIso })
        .eq('plataforma', PLATAFORMA).eq('clase_externa_id', op.claseId);
      r.clases++;
      return;
    }
    case 'borrar-slot': {
      const gym = gymDeClase.get(op.claseId);
      if (!gym) return errorSlot(op.slotId, 'sin gym para la clase del slot');
      const res = await borrarSlotWellhub(cred, gym, op.claseId, op.slotId);
      if (!res.ok) return errorSlot(op.slotId, res.error);
      await admin.from('plataforma_eventos').update({ estado_sync: 'CANCELADO', error: null, sincronizado_en: ahoraIso })
        .eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.slotId);
      // Borrar el slot cancela allí sus reservas, y no consta que llegue el aviso:
      // las que sigan vivas aquí se cancelan en el mismo paso.
      if (op.sesionId) await cancelarReservasWellhubDeSesion(admin, studioId, op.sesionId);
      r.borrados++;
      return;
    }
    case 'editar-slot': {
      const gym = gymDeClase.get(op.claseId) ?? cfg.gymId;
      const res = await editarSlotWellhub(cred, gym, op.claseId, op.slotId, op.cuerpo);
      if (!res.ok) return errorSlot(op.slotId, res.error);
      await admin.from('plataforma_eventos').update({
        huella: op.huella, ocupadas_enviadas: op.cuerpo.total_booked, error: null, sincronizado_en: ahoraIso,
      }).eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.slotId);
      r.editados++;
      return;
    }
    case 'aforo-slot': {
      const gym = gymDeClase.get(op.claseId) ?? cfg.gymId;
      const res = await aforoSlotWellhub(cred, gym, op.claseId, op.slotId, { total_capacity: op.total_capacity, total_booked: op.total_booked });
      if (!res.ok) return errorSlot(op.slotId, res.error);
      await admin.from('plataforma_eventos').update({
        ocupadas_enviadas: op.total_booked, ...(op.huella ? { huella: op.huella } : {}), error: null, sincronizado_en: ahoraIso,
      }).eq('plataforma', PLATAFORMA).eq('evento_externo_id', op.slotId);
      r.aforos++;
      return;
    }
    case 'crear-slot': {
      const claseId = claseDeTipo.get(op.tipoClaseId);
      if (!claseId) { r.pendientes++; return; } // su clase aún no existe: la próxima pasada
      const creado = await crearSlotWellhub(cred, cfg.gymId, claseId, op.cuerpo);
      if (!creado.ok) {
        r.fallidas++;
        Sentry.captureMessage('[wellhub-horario] no se pudo crear el slot', { level: 'warning', extra: { studioId, sesionId: op.sesionId, error: creado.error } });
        return;
      }
      const { error } = await admin.from('plataforma_eventos').upsert({
        studio_id: studioId, plataforma: PLATAFORMA, sesion_id: op.sesionId, evento_externo_id: creado.valor,
        contenedor_externo_id: claseId, estado_sync: 'SINCRONIZADO', huella: op.huella,
        ocupadas_enviadas: op.cuerpo.total_booked, error: null, sincronizado_en: ahoraIso,
      }, { onConflict: 'plataforma,sesion_id' });
      if (error) {
        // El slot existe en Wellhub y aquí no consta: sin esto, sus reservas
        // acabarían todas en «clase no encontrada». Se borra allí.
        await borrarSlotWellhub(cred, cfg.gymId, claseId, creado.valor).catch(() => { /* mejor esfuerzo */ });
        r.fallidas++;
        Sentry.captureMessage('[wellhub-horario] slot creado sin poder guardarlo; borrado', { level: 'error', extra: { studioId, sesionId: op.sesionId, error: error.message } });
        return;
      }
      r.creados++;
      return;
    }
  }
}

/**
 * Las reservas de Wellhub de una clase cuyo slot se ha borrado allí (que cancela
 * allí sus reservas, sin que conste que llegue el aviso): las vivas se cancelan
 * aquí, y las que el estudio ya canceló aquí quedan canceladas allí también (no
 * hay que anularlas después).
 */
async function cancelarReservasWellhubDeSesion(admin: SupabaseClient, studioId: string, sesionId: string) {
  const { data, error } = await admin.from('reservas').select('id, estado, estado_externo')
    .eq('studio_id', studioId).eq('sesion_id', sesionId).eq('origen', PLATAFORMA).in('estado', ['CONFIRMADA', 'CANCELADA']);
  if (error || !data?.length) return;
  for (const r of data) {
    const yaCerrada = r.estado_externo === null || r.estado_externo === 'Cancelled' || r.estado_externo === 'LateCancellation';
    if (r.estado === 'CANCELADA' && yaCerrada) continue;
    try { await cancelarAquiWellhub(admin, studioId, r.id as string, 'Cancelled'); } catch (e) {
      Sentry.captureException(e, { tags: { cron: 'wellhub-horario' }, extra: { studioId, reservaId: r.id } });
    }
  }
}

export async function sincronizarWellhub(admin: SupabaseClient, ahora: number = Date.now()): Promise<ResumenHorarioWellhub> {
  const r: ResumenHorarioWellhub = { estudios: 0, clases: 0, creados: 0, editados: 0, borrados: 0, aforos: 0, fallidas: 0, pendientes: 0 };
  const cred = credencialesWellhub();
  if (!cred) return { ...r, sinCredenciales: true };
  const presupuesto = { quedan: MAX_LLAMADAS };

  // Lo primero, lo que los webhooks dejaron a medias: el tope no puede dejarlo para luego.
  r.conciliacion = await conciliarWellhub(admin, cred, presupuesto, ahora);

  // Los estudios conectados, y también los que tienen algo publicado sin
  // conexión o apagados: eso sigue vivo en la app de Wellhub hasta quitarlo.
  const [conexiones, conClases, conSlots, activas] = await Promise.all([
    admin.from('plataforma_conexiones').select('studio_id, id_externo, producto_externo_id').eq('plataforma', PLATAFORMA),
    admin.from('plataforma_clases').select('studio_id').eq('plataforma', PLATAFORMA).eq('visible', true),
    admin.from('plataforma_eventos').select('studio_id').eq('plataforma', PLATAFORMA).neq('estado_sync', 'CANCELADO'),
    admin.from('integraciones').select('studio_id').eq('tipo', PLATAFORMA).eq('activo', true),
  ]);
  for (const q of [conexiones, conClases, conSlots, activas]) if (q.error) throw new Error(q.error.message);
  const conexionDe = new Map((conexiones.data ?? []).map(c => [c.studio_id as string, c]));
  const vende = new Set((activas.data ?? []).map(a => a.studio_id as string));
  const estudios = new Set<string>([
    ...conexionDe.keys(),
    ...(conClases.data ?? []).map(c => c.studio_id as string),
    ...(conSlots.data ?? []).map(c => c.studio_id as string),
  ]);
  // Sin contrato o suspendido: como apagada (lib/plataformas/venta-externa.ts).
  const sinVenta = await estudiosSinVentaExterna(admin, estudios, ahora);

  for (const studioId of estudios) {
    try {
      const c = conexionDe.get(studioId);
      const producto = Number(c?.producto_externo_id);
      const publicar = !!c && vende.has(studioId) && !sinVenta.has(studioId) && Number.isSafeInteger(producto) && producto > 0;
      // Sin conexión, el gym de hoy no existe: se pasa uno vacío y el
      // planificador solo retira (con el gym de cada clase).
      const cfg: ConfigWellhub = { gymId: (c?.id_externo as string | undefined) ?? '', productId: publicar ? producto : 0 };
      const datos = await cargarEstudio(admin, studioId, ahora);
      if (publicar) r.estudios++;
      const ops = planificarHorarioWellhub({ ...datos, config: cfg, ahora, publicar });
      const gymDeClase = new Map(datos.clases.map(x => [x.claseId, x.gymId]));
      const claseDeTipo = new Map(datos.clases.filter(x => x.tipoClaseId && x.gymId === cfg.gymId).map(x => [x.tipoClaseId as string, x.claseId]));
      for (const op of ops) {
        if (presupuesto.quedan < coste(op)) { r.pendientes++; continue; }
        presupuesto.quedan -= coste(op);
        try {
          await ejecutar(admin, cred, studioId, cfg, gymDeClase, claseDeTipo, op, r);
        } catch (e) {
          r.fallidas++;
          console.error('[wellhub-horario] fallo en operación', op.tipo, e);
        }
      }
    } catch (e) {
      r.fallidas++;
      Sentry.captureException(e, { tags: { cron: 'wellhub-horario' }, extra: { studioId } });
    }
  }
  return r;
}
