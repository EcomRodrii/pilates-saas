import type { SupabaseClient } from '@supabase/supabase-js';
import type { Rol } from '../../types.ts';
import { cierreDeFecha } from '../../calendario/nueva-clase.ts';
import { mensajeSolapeNuevaClase } from '../../student/nueva-clase.ts';
import { hoyEnEstudio } from '../../utils.ts';
import { bloqueada, esLote, normalizar, type PayloadCita, type PayloadClase, type PayloadClases, type PayloadEvento, type PayloadSala, type TipoAccion } from './nucleo.ts';
import { puedeEjecutarAccion } from './permisos.ts';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMAR una propuesta del asistente. Lo ejecuta el servidor con el payload
// GUARDADO (nunca el que mande el navegador), solo para quien la recibió y solo
// una vez:
//
//   · compare-and-set PROPUESTA → EJECUTANDO (UPDATE condicional: un ganador);
//   · cada creación lleva un id derivado de la propuesta, así que reintentar
//     después de una caída a medias encuentra lo ya creado y no lo duplica;
//   · antes de crear se vuelve a mirar lo que pudo cambiar (la hora, el cierre,
//     que sala, tipo e instructora sigan ahí) y los choques los deciden las
//     exclusiones de la base de datos y la RPC de citas: si cambió algo, falla
//     con un mensaje claro y no queda nada a medias.
//
// Service-role: TODA consulta va con `.eq('studio_id', sesion.studioId)`.
// ─────────────────────────────────────────────────────────────────────────────

type Admin = SupabaseClient;
export interface SesionConfirmar { studioId: string; userId: string; rol: Rol; nombre: string }
export interface Hecho { href: string; texto: string }

export type ResultadoConfirmar =
  | { ok: true; estado: 'EJECUTADA'; resultado: Hecho | null; yaCreada: boolean }
  | { ok: false; status: 404 | 403 | 409 | 410 | 500; codigo: 'NO_ENCONTRADA' | 'SIN_PERMISO' | 'CADUCADA' | 'CANCELADA' | 'EN_CURSO' | 'CONFLICTO' | 'ERROR'; error: string };

/** Un fallo que se le puede decir tal cual a la persona (algo cambió): la propuesta sigue viva. */
class Cambio extends Error {}
/** Un lote que se quedó a medias: lo creado se queda (cada clase tiene su id) y reintentar crea solo las que faltan. */
class CambioParcial extends Cambio {}

const TOMA_MUERTA_MS = 120_000;
const TEXTO_ERROR = 'No he podido crearla ahora y no se ha creado nada. Puedes volver a intentarlo.';

interface Fila { id: string; tipo: TipoAccion; estado: string; payload: unknown; resultado: unknown; caduca_en: string; reclamada_en: string | null }

async function cargar(admin: Admin, sesion: SesionConfirmar, id: string): Promise<Fila | null | 'ERROR'> {
  const { data, error } = await admin.from('asistente_acciones').select('id, tipo, estado, payload, resultado, caduca_en, reclamada_en')
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).maybeSingle();
  if (error) return 'ERROR';
  return (data as Fila | null) ?? null;
}

async function existe(admin: Admin, sesion: SesionConfirmar, tabla: 'sesiones' | 'salas' | 'citas' | 'posts_comunidad', id: string): Promise<boolean> {
  const { data, error } = await admin.from(tabla).select('id').eq('studio_id', sesion.studioId).eq('id', id).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function cierresDelEstudio(admin: Admin, sesion: SesionConfirmar) {
  const { data, error } = await admin.from('cierres_estudio').select('id, desde, hasta, motivo').eq('studio_id', sesion.studioId);
  if (error) throw error;
  return (data ?? []) as { id: string; desde: string; hasta: string; motivo: string | null }[];
}

async function bloqueosDe(admin: Admin, sesion: SesionConfirmar, instructorId: string, fecha: string) {
  const { data, error } = await admin.from('instructora_disponibilidad_excepciones').select('hora_inicio, hora_fin')
    .eq('studio_id', sesion.studioId).eq('instructor_id', instructorId).eq('fecha', fecha).eq('tipo', 'bloqueo');
  if (error) throw error;
  return (data ?? []).map(b => ({ horaInicio: (b.hora_inicio as string | null) ?? null, horaFin: (b.hora_fin as string | null) ?? null }));
}

function noHaPasado(inicio: string, ahora: Date) {
  if (Date.parse(inicio) <= ahora.getTime()) throw new Cambio('Esa hora ya ha pasado: pídele a Tentare otra.');
}

async function instructoraActiva(admin: Admin, sesion: SesionConfirmar, id: string) {
  const { data, error } = await admin.from('instructores').select('id, activo').eq('studio_id', sesion.studioId).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || data.activo !== true) throw new Cambio('Esa persona ya no está activa en el equipo.');
}

async function crearClase(admin: Admin, sesion: SesionConfirmar, id: string, p: PayloadClase, ahora: Date): Promise<Hecho> {
  const sid = `ses-asist-${id}`;
  const hecho = { href: '/calendario', texto: 'Ver en Calendario' };
  if (await existe(admin, sesion, 'sesiones', sid)) return hecho;
  noHaPasado(p.inicio, ahora);
  const fecha = hoyEnEstudio(new Date(p.inicio));
  const [tipo, sala, cierres] = await Promise.all([
    admin.from('tipos_clase').select('id, archivado_en').eq('studio_id', sesion.studioId).eq('id', p.tipoClaseId).maybeSingle(),
    admin.from('salas').select('id').eq('studio_id', sesion.studioId).eq('id', p.salaId).maybeSingle(),
    cierresDelEstudio(admin, sesion),
  ]);
  if (tipo.error) throw tipo.error;
  if (sala.error) throw sala.error;
  if (!tipo.data || tipo.data.archivado_en) throw new Cambio('Ese tipo de clase ya no está disponible.');
  if (!sala.data) throw new Cambio('Esa sala ya no existe.');
  if (cierreDeFecha(fecha, cierres)) throw new Cambio('El estudio está cerrado ese día.');
  if (p.instructorId) {
    await instructoraActiva(admin, sesion, p.instructorId);
    if ((await bloqueosDe(admin, sesion, p.instructorId, fecha)).some(b => bloqueada(b, p.inicio, p.fin))) throw new Cambio('Esa instructora ya no está disponible ese día.');
  }
  const { error } = await admin.from('sesiones').insert({
    id: sid, studio_id: sesion.studioId, tipo_clase_id: p.tipoClaseId, sala_id: p.salaId, instructor_id: p.instructorId,
    inicio: p.inicio, fin: p.fin, aforo_maximo: p.aforo, cancelada: false, notas: null, precio_puntual: null, serie_id: null,
  });
  if (error) {
    if (error.code === '23505') return hecho;
    if (error.code === '23P01') throw new Cambio(mensajeSolapeNuevaClase(error.message));
    if (error.message?.includes('TIPO_ARCHIVADO')) throw new Cambio('Ese tipo de clase ya no está disponible.');
    throw error;
  }
  return hecho;
}

async function crearClases(admin: Admin, sesion: SesionConfirmar, id: string, p: PayloadClases, ahora: Date): Promise<Hecho> {
  let hecho: Hecho = { href: '/calendario', texto: 'Ver en Calendario' };
  for (let i = 0; i < p.clases.length; i++) {
    try {
      hecho = await crearClase(admin, sesion, `${id}-${i}`, p.clases[i], ahora);
    } catch (e) {
      // Las que ya se crearon se quedan (reintentar las salta por su id). Se dice cuántas y qué falló.
      if (e instanceof Cambio && i > 0) {
        throw new CambioParcial(`${e.message} Se han creado ${i} de ${p.clases.length}: pulsa Confirmar otra vez para crear las que faltan, o pídele otro cambio.`);
      }
      throw e;
    }
  }
  return hecho;
}

async function crearSala(admin: Admin, sesion: SesionConfirmar, id: string, p: PayloadSala): Promise<Hecho> {
  const sid = `sala-asist-${id}`;
  const hecho = { href: '/configuracion?tab=estudio&abrir=salas', texto: 'Ver en Configuración' };
  if (await existe(admin, sesion, 'salas', sid)) return hecho;
  const { data, error: e1 } = await admin.from('salas').select('nombre').eq('studio_id', sesion.studioId);
  if (e1) throw e1;
  if ((data ?? []).some(s => normalizar(s.nombre as string) === normalizar(p.nombre))) throw new Cambio(`Ya existe una sala que se llama «${p.nombre}».`);
  const { error } = await admin.from('salas').insert({ id: sid, studio_id: sesion.studioId, nombre: p.nombre, capacidad: p.capacidad, color: p.color, foto_url: null });
  if (error && error.code !== '23505') throw error;
  return hecho;
}

async function crearEvento(admin: Admin, sesion: SesionConfirmar, id: string, p: PayloadEvento, ahora: Date, despues: (f: () => Promise<void>) => void, avisar: (postId: string, texto: string) => Promise<void>): Promise<Hecho> {
  const pid = `post-asist-${id}`;
  const hecho = { href: '/comunidad', texto: 'Ver en Comunidad' };
  if (await existe(admin, sesion, 'posts_comunidad', pid)) return hecho;
  noHaPasado(p.inicio, ahora);
  const inicial = sesion.nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'EQ';
  const { error } = await admin.from('posts_comunidad').insert({
    id: pid, studio_id: sesion.studioId, autor_id: sesion.userId, autor_nombre: sesion.nombre, autor_inicial: inicial,
    texto: p.texto, audiencia: 'TODAS', imagen_url: null, tipo: 'EVENTO', evento_fecha: p.inicio, evento_aforo: p.aforo, evento_lugar: p.lugar,
    likes: 0, comentarios_count: 0, fijado: false, creado_en: ahora.toISOString(),
  });
  if (error) { if (error.code === '23505') return hecho; throw error; }
  despues(() => avisar(pid, p.texto));
  return hecho;
}

async function crearCita(admin: Admin, sesion: SesionConfirmar, id: string, p: PayloadCita, ahora: Date): Promise<Hecho> {
  const cid = `cita-asist-${id}`;
  const hecho = { href: '/citas', texto: 'Ver en Citas' };
  if (await existe(admin, sesion, 'citas', cid)) return hecho;
  noHaPasado(p.inicio, ahora);
  const fecha = hoyEnEstudio(new Date(p.inicio));
  const socia = await admin.from('socios').select('id').eq('studio_id', sesion.studioId).eq('id', p.socioId).is('borrado_en', null).maybeSingle();
  if (socia.error) throw socia.error;
  if (!socia.data) throw new Cambio('Esa alumna ya no está en el estudio.');
  await instructoraActiva(admin, sesion, p.instructorId);
  if (cierreDeFecha(fecha, await cierresDelEstudio(admin, sesion))) throw new Cambio('El estudio está cerrado ese día.');
  if ((await bloqueosDe(admin, sesion, p.instructorId, fecha)).some(b => bloqueada(b, p.inicio, p.fin))) throw new Cambio('Esa instructora ya no está disponible ese día.');
  // La misma RPC atómica de la reserva de citas: serializa por instructora y rechaza solapes. Sin precio ni cobro.
  const { data, error } = await admin.rpc('reservar_cita', {
    p_id: cid, p_studio_id: sesion.studioId, p_socio_id: p.socioId, p_instructor_id: p.instructorId, p_servicio_id: null,
    p_tipo: p.tipo, p_inicio: p.inicio, p_fin: p.fin, p_precio: null, p_notas: null,
  });
  if (error) { if (error.code === '23505') return hecho; throw error; }
  if ((Array.isArray(data) ? data[0] : data) === 'CONFLICTO') throw new Cambio('Esa instructora ya tiene algo a esa hora: alguien se te ha adelantado.');
  return hecho;
}

export interface DepsConfirmar {
  ahora: Date;
  /** `after()` de Next: el aviso a las alumnas de un evento, tras responder. */
  despues: (f: () => Promise<void>) => void;
  avisarEvento: (postId: string, texto: string, sesion: SesionConfirmar) => Promise<void>;
}

export async function confirmarAccion(admin: Admin, sesion: SesionConfirmar, id: string, deps: DepsConfirmar): Promise<ResultadoConfirmar> {
  const fila = await cargar(admin, sesion, id);
  if (fila === 'ERROR') return { ok: false, status: 500, codigo: 'ERROR', error: 'No disponible ahora. No se ha creado nada.' };
  if (!fila) return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: 'Esa propuesta ya no existe.' };
  if (!puedeEjecutarAccion(sesion.rol, fila.tipo)) return { ok: false, status: 403, codigo: 'SIN_PERMISO', error: 'No tienes permiso para esto.' };

  const ahoraIso = deps.ahora.toISOString();
  const yaHecha = (f: Fila): ResultadoConfirmar | null => {
    if (f.estado === 'EJECUTADA') return { ok: true, estado: 'EJECUTADA', resultado: (f.resultado as Hecho | null) ?? null, yaCreada: true };
    if (f.estado === 'CANCELADA') return { ok: false, status: 409, codigo: 'CANCELADA', error: 'La cancelaste: pídeselo de nuevo a Tentare.' };
    if (f.estado === 'CADUCADA') return { ok: false, status: 410, codigo: 'CADUCADA', error: 'La propuesta caducó: pídeselo de nuevo a Tentare.' };
    return null;
  };
  const previa = yaHecha(fila);
  if (previa) return previa;
  if (fila.estado === 'PROPUESTA' && Date.parse(fila.caduca_en) <= deps.ahora.getTime()) {
    await admin.from('asistente_acciones').update({ estado: 'CADUCADA', resuelta_en: ahoraIso })
      .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).eq('estado', 'PROPUESTA');
    return { ok: false, status: 410, codigo: 'CADUCADA', error: 'La propuesta caducó: pídeselo de nuevo a Tentare.' };
  }

  // El ganador: PROPUESTA vigente → EJECUTANDO, o una toma muerta (>2 min) que se retoma (la creación es idempotente por id).
  let toma = await admin.from('asistente_acciones').update({ estado: 'EJECUTANDO', reclamada_en: ahoraIso })
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).eq('estado', 'PROPUESTA').gt('caduca_en', ahoraIso).select('id');
  if (!toma.error && (toma.data ?? []).length === 0 && fila.estado === 'EJECUTANDO') {
    toma = await admin.from('asistente_acciones').update({ reclamada_en: ahoraIso })
      .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).eq('estado', 'EJECUTANDO')
      .lt('reclamada_en', new Date(deps.ahora.getTime() - TOMA_MUERTA_MS).toISOString()).select('id');
  }
  if (toma.error) return { ok: false, status: 500, codigo: 'ERROR', error: 'No disponible ahora. No se ha creado nada.' };
  if ((toma.data ?? []).length === 0) {
    const otra = await cargar(admin, sesion, id);
    const hecho = otra && otra !== 'ERROR' ? yaHecha(otra) : null;
    if (hecho) return hecho;
    return { ok: false, status: 409, codigo: 'EN_CURSO', error: 'Se está creando ahora mismo.' };
  }

  const p = fila.payload;
  try {
    let hecho: Hecho;
    switch (fila.tipo) {
      case 'CREAR_CLASE': hecho = esLote(p) ? await crearClases(admin, sesion, id, p, deps.ahora) : await crearClase(admin, sesion, id, p as PayloadClase, deps.ahora); break;
      case 'CREAR_SALA': hecho = await crearSala(admin, sesion, id, p as PayloadSala); break;
      case 'CREAR_EVENTO': hecho = await crearEvento(admin, sesion, id, p as PayloadEvento, deps.ahora, deps.despues, (postId, texto) => deps.avisarEvento(postId, texto, sesion)); break;
      case 'CREAR_CITA': hecho = await crearCita(admin, sesion, id, p as PayloadCita, deps.ahora); break;
      default: throw new Error('tipo desconocido');
    }
    const { error } = await admin.from('asistente_acciones').update({ estado: 'EJECUTADA', resultado: hecho, resuelta_en: new Date().toISOString() })
      .eq('studio_id', sesion.studioId).eq('id', id).eq('estado', 'EJECUTANDO');
    // Está creada aunque no se haya podido anotar: un reintento la encuentra por su id y responde que ya existe.
    if (error) console.error('[asistente] anotando la acción ejecutada', error.code);
    return { ok: true, estado: 'EJECUTADA', resultado: hecho, yaCreada: false };
  } catch (e) {
    // Vuelve a PROPUESTA: la persona puede reintentar o pedir un cambio.
    await admin.from('asistente_acciones').update({ estado: 'PROPUESTA', reclamada_en: null })
      .eq('studio_id', sesion.studioId).eq('id', id).eq('estado', 'EJECUTANDO');
    if (e instanceof CambioParcial) return { ok: false, status: 409, codigo: 'CONFLICTO', error: e.message };
    if (e instanceof Cambio) return { ok: false, status: 409, codigo: 'CONFLICTO', error: `${e.message} No se ha creado nada.` };
    console.error('[asistente] confirmando una acción', { id, tipo: fila.tipo, codigo: (e as { code?: string })?.code ?? 'ERROR' });
    return { ok: false, status: 500, codigo: 'ERROR', error: TEXTO_ERROR };
  }
}

/** Cancelar («Cancelar» o «Cambiar algo»): solo una propuesta viva y solo de quien la recibió. Idempotente. */
export async function cancelarAccion(admin: Admin, sesion: SesionConfirmar, id: string, ahora: Date): Promise<{ ok: true; estado: string } | { ok: false; status: 404 | 409 | 500; error: string }> {
  const fila = await cargar(admin, sesion, id);
  if (fila === 'ERROR') return { ok: false, status: 500, error: 'No disponible ahora.' };
  if (!fila) return { ok: false, status: 404, error: 'Esa propuesta ya no existe.' };
  if (fila.estado === 'EJECUTADA' || fila.estado === 'EJECUTANDO') return { ok: false, status: 409, error: 'Ya se ha creado: no se puede cancelar desde aquí.' };
  if (fila.estado !== 'PROPUESTA') return { ok: true, estado: fila.estado };
  const { error } = await admin.from('asistente_acciones').update({ estado: 'CANCELADA', resuelta_en: ahora.toISOString() })
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).eq('estado', 'PROPUESTA');
  if (error) return { ok: false, status: 500, error: 'No disponible ahora.' };
  return { ok: true, estado: 'CANCELADA' };
}
