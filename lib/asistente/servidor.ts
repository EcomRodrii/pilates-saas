import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { todasLasFilas, type Pagina } from '../clientas/estado-servidor.ts';
import type { Rol } from '../types.ts';
import type { BloqueAsistente } from './tipos.ts';
import type { TablaReferencias, PersonaDelEstudio } from './referencias.ts';
import { asistenteEncendidoPara } from './interruptor.ts';
import { historialParaElModelo } from './historial.ts';

// ─────────────────────────────────────────────────────────────────────────────
// La parte del asistente que toca la base de datos: conversaciones, mensajes,
// el libro de consumos y los nombres. Todo con service-role, así que TODA
// consulta va con `.eq('studio_id', sesion.studioId)` y las conversaciones
// además con `.eq('auth_user_id', sesion.userId)`: la gerente no lee las de la
// propietaria ni al revés (lo vigila herramientas-acotadas.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface SesionAsistente {
  studioId: string;
  userId: string;
  rol: Rol;
}

/**
 * Interruptor: APAGADO salvo `ASISTENTE_IA=on` o `ASISTENTE_IA=estudios:<id>,…`
 * (solo en esos estudios), y siempre con clave de Anthropic
 * (lib/asistente/interruptor.ts). Así el servidor puede estar en producción
 * antes que la interfaz, el fundador lo prueba en su estudio antes que nadie, y
 * se apaga en el acto si hace falta.
 */
export function asistenteEncendido(studioId: string): boolean {
  return asistenteEncendidoPara(process.env.ASISTENTE_IA, !!process.env.ANTHROPIC_API_KEY, studioId);
}

// ── Conversaciones ──────────────────────────────────────────────────────────

export interface ConversacionCargada {
  id: string;
  referencias: unknown;
  tokensContexto: number;
  /** Compactado para el modelo: pregunta y respuesta de cada turno, sin herramientas. */
  historial: Anthropic.MessageParam[];
  siguienteOrden: number;
}

const RETENCION_DIAS = 90;
/** Una toma de turno más vieja que esto es de una petición que murió: se puede volver a tomar. */
const TURNO_CADUCA_SEGUNDOS = 90;

export async function cargarConversacion(admin: SupabaseClient, sesion: SesionAsistente, id: string): Promise<ConversacionCargada | null | 'ERROR'> {
  const { data: conv, error } = await admin.from('asistente_conversaciones')
    .select('id, referencias, tokens_contexto')
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).maybeSingle();
  if (error) return 'ERROR';
  if (!conv) return null;
  const mensajes = await todasLasFilas<{ orden: number; rol: 'user' | 'assistant'; contenido: Anthropic.ContentBlockParam[] }>((d, h) =>
    admin.from('asistente_mensajes').select('orden, rol, contenido')
      .eq('studio_id', sesion.studioId).eq('conversacion_id', id)
      .order('orden').range(d, h) as unknown as Pagina<{ orden: number; rol: 'user' | 'assistant'; contenido: Anthropic.ContentBlockParam[] }>);
  if (mensajes.error) return 'ERROR';
  return {
    id: conv.id as string,
    referencias: conv.referencias,
    tokensContexto: (conv.tokens_contexto as number) ?? 0,
    // Al modelo, de los turnos pasados, solo pregunta y respuesta (lib/asistente/historial.ts).
    historial: historialParaElModelo(mensajes.data.map(m => ({ role: m.rol, content: m.contenido }))),
    siguienteOrden: mensajes.data.length ? mensajes.data[mensajes.data.length - 1].orden + 1 : 0,
  };
}

/** Una conversación nueva (y, de paso, la purga de las de más de 90 días de este estudio). */
export async function crearConversacion(admin: SupabaseClient, sesion: SesionAsistente, titulo: string): Promise<string | null> {
  const limite = new Date(Date.now() - RETENCION_DIAS * 86_400_000).toISOString();
  // A la vez: la purga solo toca conversaciones de hace más de 90 días, nunca la que se crea ahora,
  // y esperar a una antes de la otra era un viaje más a la base de datos antes de la primera respuesta.
  const [purga, { data, error }] = await Promise.all([
    admin.from('asistente_conversaciones').delete().eq('studio_id', sesion.studioId).lt('ultima_en', limite),
    admin.from('asistente_conversaciones')
      .insert({ studio_id: sesion.studioId, auth_user_id: sesion.userId, rol: sesion.rol, titulo: titulo.slice(0, 120), en_curso_desde: new Date().toISOString() })
      .select('id').single(),
  ]);
  if (purga.error) console.error('[asistente] purga de conversaciones', purga.error.code);
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Toma de turno con compare-and-set: dos pestañas no responden a la vez en la
 * misma conversación (se mezclarían los mensajes). `false` si otra la tiene.
 */
export async function tomarTurno(admin: SupabaseClient, sesion: SesionAsistente, id: string): Promise<boolean> {
  const ahora = Date.now();
  const caducada = new Date(ahora - TURNO_CADUCA_SEGUNDOS * 1000).toISOString();
  const { data, error } = await admin.from('asistente_conversaciones')
    .update({ en_curso_desde: new Date(ahora).toISOString() })
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id)
    .or(`en_curso_desde.is.null,en_curso_desde.lt."${caducada}"`)
    .select('id');
  return !error && (data ?? []).length === 1;
}

/** Guarda el turno y suelta la conversación. Sin nombres: el contenido va seudonimizado y las refs como ids. */
export async function guardarTurno(admin: SupabaseClient, sesion: SesionAsistente, t: {
  conversacionId: string;
  desdeOrden: number;
  mensajes: readonly Anthropic.MessageParam[];
  bloques: readonly BloqueAsistente[];
  consumoId: string | null;
  refs: TablaReferencias;
  tokensContexto: number;
}): Promise<void> {
  if (t.mensajes.length) {
    const filas = t.mensajes.map((m, i) => ({
      conversacion_id: t.conversacionId,
      studio_id: sesion.studioId,
      orden: t.desdeOrden + i,
      rol: m.role,
      contenido: typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content,
      // Las tarjetas del turno van con su último mensaje.
      bloques: i === t.mensajes.length - 1 ? t.bloques : [],
      consumo_id: t.consumoId,
    }));
    const { error } = await admin.from('asistente_mensajes').insert(filas);
    if (error) console.error('[asistente] guardando mensajes', error.code);
  }
  const { error } = await admin.from('asistente_conversaciones')
    .update({ referencias: t.refs.aJson(), tokens_contexto: t.tokensContexto, en_curso_desde: null, ultima_en: new Date().toISOString() })
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', t.conversacionId);
  if (error) console.error('[asistente] cerrando la conversación', error.code);
}

// ── El libro de consumos (migr 20261005213749_asistente_y_consumos_ia) ──────

export type CodigoReserva = 'OK' | 'SIN_SALDO' | 'TOPE_DIARIO_ESTUDIO' | 'TOPE_DIARIO_GLOBAL' | 'SIN_ESTUDIO';

/** Fail-closed: `null` si el libro no responde, y entonces NO se llama a Anthropic. */
export async function reservarConsulta(
  admin: SupabaseClient, sesion: SesionAsistente, conversacionId: string | null, modelo: string, costeMaxUsd: number,
): Promise<{ consumoId: string | null; codigo: CodigoReserva; disponibles: number } | null> {
  const { data, error } = await admin.rpc('ia_reservar_consulta', {
    p_studio_id: sesion.studioId, p_auth_user_id: sesion.userId, p_origen: 'ASISTENTE',
    p_conversacion_id: conversacionId, p_modelo: modelo, p_coste_max_usd: costeMaxUsd,
  });
  const fila = Array.isArray(data) ? (data[0] as { consumo_id: string | null; codigo: CodigoReserva; disponibles: number } | undefined) : undefined;
  if (error || !fila) return null;
  return { consumoId: fila.consumo_id, codigo: fila.codigo, disponibles: fila.disponibles };
}

export async function cerrarConsulta(admin: SupabaseClient, sesion: SesionAsistente, c: {
  consumoId: string;
  estado: 'CONSUMIDA' | 'FALLIDA' | 'LIBERADA';
  input: number; cacheRead: number; cacheCreation: number; output: number;
  costeUsd: number; nLlamadas: number; nHerramientas: number; herramientas: readonly string[];
  codigoError: string | null;
}): Promise<{ unidades: number; disponibles: number } | null> {
  const { data, error } = await admin.rpc('ia_cerrar_consulta', {
    p_consumo_id: c.consumoId, p_studio_id: sesion.studioId, p_estado: c.estado,
    p_input: c.input, p_cache_read: c.cacheRead, p_cache_creation: c.cacheCreation, p_output: c.output,
    p_coste_usd: c.costeUsd, p_n_llamadas: c.nLlamadas, p_n_herramientas: c.nHerramientas,
    p_codigo_error: c.codigoError, p_herramientas: [...c.herramientas],
  });
  const fila = Array.isArray(data) ? (data[0] as { unidades_cobradas: number; disponibles: number } | undefined) : undefined;
  if (error || !fila) {
    console.error('[asistente] cerrando el consumo', { consumoId: c.consumoId, codigo: error?.code ?? 'SIN_FILA' });
    return null;
  }
  return { unidades: fila.unidades_cobradas, disponibles: fila.disponibles };
}

export interface Saldo {
  enPrueba: boolean;
  cuota: number;
  usadas: number;
  disponibles: number;
  renuevaEl: string | null;
}

export async function leerSaldo(admin: SupabaseClient, sesion: SesionAsistente): Promise<Saldo | null> {
  const { data, error } = await admin.rpc('ia_saldo_consultas', { p_studio_id: sesion.studioId });
  const fila = Array.isArray(data) ? (data[0] as { en_prueba: boolean; cuota: number; usadas: number; disponibles: number; renueva_el: string | null } | undefined) : undefined;
  if (error || !fila) return null;
  return { enPrueba: fila.en_prueba, cuota: fila.cuota, usadas: fila.usadas, disponibles: fila.disponibles, renuevaEl: fila.renueva_el };
}

// ── Nombres: solo para el navegador ─────────────────────────────────────────

/** Las personas del estudio, para quitar sus nombres de la pregunta. Solo id y nombre (y cuál es quien pregunta). */
export async function personasDelEstudio(admin: SupabaseClient, sesion: SesionAsistente): Promise<PersonaDelEstudio[] | null> {
  type FSocia = { id: string; nombre: string | null; apellidos: string | null };
  type FEquipo = { id: string; nombre: string | null; auth_user_id: string | null };
  const [socias, equipo] = await Promise.all([
    todasLasFilas<FSocia>((d, h) => admin.from('socios').select('id, nombre, apellidos')
      .eq('studio_id', sesion.studioId).is('borrado_en', null).order('id').range(d, h) as unknown as Pagina<FSocia>),
    todasLasFilas<FEquipo>((d, h) => admin.from('instructores').select('id, nombre, auth_user_id')
      .eq('studio_id', sesion.studioId).order('id').range(d, h) as unknown as Pagina<FEquipo>),
  ]);
  if (socias.error || equipo.error) return null;
  return [
    ...socias.data.map(s => ({ tipo: 'socia' as const, id: s.id, nombre: s.nombre, apellidos: s.apellidos })),
    // `propia`: la ficha de quien pregunta (el contexto del día le dice al modelo quién es). El id de usuario no sale de aquí.
    ...equipo.data.map(e => ({ tipo: 'instructora' as const, id: e.id, nombre: e.nombre, ...(e.auth_user_id === sesion.userId ? { propia: true } : {}) })),
  ];
}

/**
 * Ref → { nombre, href } para el evento `referencias`. Los nombres se leen aquí,
 * en el servidor, y solo viajan al navegador. Una socia anonimizada (RGPD) o que
 * ya no existe sale «Clienta eliminada».
 */
export async function nombresDeReferencias(
  admin: SupabaseClient, sesion: SesionAsistente, refs: TablaReferencias, cuales: readonly string[],
): Promise<Record<string, { nombre: string; href: string | null }>> {
  const socias: string[] = [];
  const equipo: string[] = [];
  for (const r of cuales) {
    const e = refs.get(r);
    if (e?.tipo === 'socia') socias.push(e.id); else if (e?.tipo === 'instructora') equipo.push(e.id);
  }
  const [s, i] = await Promise.all([
    socias.length
      ? admin.from('socios').select('id, nombre, apellidos, borrado_en').eq('studio_id', sesion.studioId).in('id', socias.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
    equipo.length
      ? admin.from('instructores').select('id, nombre').eq('studio_id', sesion.studioId).in('id', equipo.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const porSocia = new Map(((s.data ?? []) as { id: string; nombre: string | null; apellidos: string | null; borrado_en: string | null }[]).map(x => [x.id, x]));
  const porEquipo = new Map(((i.data ?? []) as { id: string; nombre: string | null }[]).map(x => [x.id, x]));
  const out: Record<string, { nombre: string; href: string | null }> = {};
  for (const r of cuales) {
    const e = refs.get(r);
    if (!e) continue;
    if (e.tipo === 'socia') {
      const x = porSocia.get(e.id);
      out[r] = x && !x.borrado_en
        ? { nombre: [x.nombre, x.apellidos].filter(Boolean).join(' ') || 'Clienta', href: `/clientas/${e.id}` }
        : { nombre: 'Clienta eliminada', href: null };
    } else {
      const x = porEquipo.get(e.id);
      out[r] = { nombre: x?.nombre || 'Alguien del equipo', href: null };
    }
  }
  return out;
}

/** Suelta la conversación sin guardar nada (la pregunta no llegó a hacerse). */
export async function soltarTurno(admin: SupabaseClient, sesion: SesionAsistente, id: string): Promise<void> {
  const { error } = await admin.from('asistente_conversaciones').update({ en_curso_desde: null })
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id);
  if (error) console.error('[asistente] soltando la conversación', error.code);
}

/** La primera pregunta de una conversación se reserva antes de que exista la conversación: se ata después. */
export async function atarConsumo(admin: SupabaseClient, sesion: SesionAsistente, consumoId: string, conversacionId: string): Promise<void> {
  const { error } = await admin.from('ia_consumos').update({ conversacion_id: conversacionId })
    .eq('studio_id', sesion.studioId).eq('id', consumoId);
  if (error) console.error('[asistente] atando el consumo', error.code);
}
