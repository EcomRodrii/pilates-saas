import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { filasDeSociaConInstructora } from '@/lib/datos-salud/acceso-servidor';
import { instructoraAtiendeSocia } from '@/lib/datos-salud/acceso-instructora';
import { nombresParaLista } from '@/lib/student/agenda-instructora';
import { repartoAvisoMensaje } from '@/lib/mensajeria/destinatarios';
import { previsualizacionParaAviso } from '@/lib/mensajeria/presentacion';
import {
  instantesUltimoMensaje, resumirConversaciones, type FilaLectura, type FilaUltimoMensaje,
} from '@/lib/mensajeria/resumen';
import { emitirMensajeRecibido } from '@/lib/notifications/emit';
import { instanteDelMensaje, marcarAvisosDeConversacionLeidos } from '@/lib/mensajeria/avisos-leidos';
import {
  errorDeModeracion, estadoDelHilo, mensajeParaApp,
  type EstadoHilo, type MensajeParaApp, type ParticipanteHilo,
} from '@/lib/moderacion/reglas';
import { alumnaMenorParaChat, bloquearEnChat, denunciarMensaje, type ResultadoModeracionChat } from '@/lib/moderacion/chat-servidor';
import type { RowConversaciones, RowMensajes } from '@/lib/db-types';
import type { AlumnaDelHilo, HiloInstructora, MotivoNoAbrir } from '@/lib/student/mensajes-instructora';

// Chat 1:1 de la instructora con sus alumnas desde la app del estudio.
//
// Reutiliza las conversaciones `ALUMNA_INSTRUCTORA` (tablas, RPC
// `abrir_conversacion`, resumen de la bandeja y avisos) que ya usa el panel.
// Decisiones del 14-sep-2026:
//   · ABRIR solo con una alumna suya: `instructoraAtiendeSocia` (±30 días), la
//     misma regla que la ficha y la salud, además de la que ya exige la RPC;
//   · un hilo ya abierto se sigue leyendo y respondiendo mientras ella siga
//     activa (eso ya lo exige `verificarInstructoraEnEstudio`);
//   · el push no lleva el texto (`previsualizacionParaAviso`).
//
// ⚠️ Service-role: la RLS no actúa. Cada acción sobre un hilo comprueba antes
// que es de ESTE estudio, de tipo instructora–alumna y que ella es su parte
// STAFF; si no, responde igual que si no existiera. El estudio, la instructora y
// el remitente salen del token, nunca del body.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const TIPO = 'ALUMNA_INSTRUCTORA';
const MAX_HILOS = 100;
const LIMITE_MENSAJES = 100;
const PAGINA = 1000;
const TROZO_IDS = 100;

function enTrozos<T>(lista: readonly T[], tamano: number): T[][] {
  const trozos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano));
  return trozos;
}

export interface InstructoraDelHilo { studioId: string; instructorId: string; userId: string }

function adminOLanza(): Admin {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  return admin;
}

/**
 * ¿Es un hilo instructora–alumna de este estudio en el que ella es la parte
 * STAFF? `null` si no. Si lo es, trae además si admite mensajes (cerrado por el
 * estudio o con un bloqueo, migr 20261005150100).
 */
async function esHiloSuyo(admin: Admin, p: InstructoraDelHilo, conversacionId: string): Promise<{ estado: EstadoHilo } | null> {
  const [conv, parte] = await Promise.all([
    admin.from('conversaciones')
      .select('id, cerrada_en, conversacion_participantes(rol_en_conversacion, auth_user_id, socio_id, bloqueo_en)')
      .eq('id', conversacionId).eq('studio_id', p.studioId).eq('tipo', TIPO).maybeSingle(),
    admin.from('conversacion_participantes').select('conversacion_id')
      .eq('conversacion_id', conversacionId).eq('auth_user_id', p.userId).eq('rol_en_conversacion', 'STAFF')
      .maybeSingle(),
  ]);
  if (conv.error) throw conv.error;
  if (parte.error) throw parte.error;
  if (!conv.data || !parte.data) return null;
  return {
    estado: estadoDelHilo({
      tipo: TIPO, cerradaEn: conv.data.cerrada_en as string | null,
      participantes: (conv.data.conversacion_participantes ?? []) as ParticipanteHilo[],
      yo: { authUserId: p.userId },
    }),
  };
}

/** Su bandeja: sus hilos con alumnas de este estudio, el más reciente primero. */
export async function hilosDeInstructora(p: InstructoraDelHilo): Promise<HiloInstructora[]> {
  const admin = adminOLanza();
  // Sus participaciones como STAFF en TODOS sus estudios, por páginas: PostgREST
  // corta en 1000 filas sin avisar.
  const ids: string[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data: partes, error } = await admin.from('conversacion_participantes')
      .select('conversacion_id').eq('auth_user_id', p.userId).eq('rol_en_conversacion', 'STAFF')
      .order('conversacion_id').range(desde, desde + PAGINA - 1);
    if (error) throw error;
    ids.push(...(partes ?? []).map((x) => x.conversacion_id as string));
    if ((partes ?? []).length < PAGINA) break;
  }
  if (ids.length === 0) return [];

  // En trozos: un `.in()` con cientos de ids alarga la URL hasta que PostgREST la rechaza.
  const trozos = await Promise.all(enTrozos(ids, TROZO_IDS).map(async (trozo) => {
    const { data, error } = await admin.from('conversaciones')
      .select('id, studio_id, tipo, titulo, ancla_sesion_id, ancla_reserva_id, creado_en, ultimo_mensaje_en')
      .in('id', trozo).eq('studio_id', p.studioId).eq('tipo', TIPO);
    if (error) throw error;
    return (data ?? []) as RowConversaciones[];
  }));
  const filas = trozos.flat()
    .sort((a, b) => (a.ultimo_mensaje_en < b.ultimo_mensaje_en ? 1 : a.ultimo_mensaje_en > b.ultimo_mensaje_en ? -1 : 0))
    .slice(0, MAX_HILOS);
  if (filas.length === 0) return [];
  const convIds = filas.map((c) => c.id);

  const [ultimos, participantes] = await Promise.all([
    admin.from('mensajes').select('conversacion_id, cuerpo, remitente_auth_user_id, creado_en, oculto_en')
      .in('conversacion_id', convIds).in('creado_en', instantesUltimoMensaje(filas)),
    admin.from('conversacion_participantes').select('conversacion_id, auth_user_id, leido_hasta, socio_id')
      .in('conversacion_id', convIds),
  ]);
  if (ultimos.error) throw ultimos.error;
  if (participantes.error) throw participantes.error;

  const socioPorHilo = new Map<string, string>();
  for (const x of participantes.data ?? []) {
    if (x.socio_id) socioPorHilo.set(x.conversacion_id as string, x.socio_id as string);
  }
  const socioIds = [...new Set(socioPorHilo.values())];
  const alumnaPorId = new Map<string, AlumnaDelHilo>();
  if (socioIds.length) {
    const { data: socios, error: eSoc } = await admin.from('socios').select('id, nombre, apellidos, foto_url')
      .in('id', socioIds).eq('studio_id', p.studioId).is('borrado_en', null);
    if (eSoc) throw eSoc;
    for (const s of socios ?? []) {
      alumnaPorId.set(s.id as string, {
        socioId: s.id as string,
        // Persona a persona, igual que en «Tus alumnas»: nunca desempatar con el apellido entero.
        nombre: nombresParaLista([{ nombre: s.nombre as string | null, apellidos: s.apellidos as string | null }])[0],
        fotoUrl: (s.foto_url as string | null) ?? null,
      });
    }
  }

  return resumirConversaciones(
    filas, (ultimos.data ?? []) as FilaUltimoMensaje[], (participantes.data ?? []) as FilaLectura[], p.userId, 'equipo',
    // Lo que el estudio retiró no se lee en la app, tampoco en la última línea.
    { ocultarRetirados: true },
  ).map((c) => {
    const socioId = socioPorHilo.get(c.id);
    return { ...c, alumna: socioId ? alumnaPorId.get(socioId) ?? null : null } as HiloInstructora;
  });
}

/**
 * Abre (o reutiliza) su conversación con una alumna. `null` si no es su alumna
 * o no existe (misma respuesta). La RPC exige además una reserva confirmada,
 * asistida o no asistida con ella y que las dos tengan cuenta.
 */
export async function abrirHiloConAlumna(
  p: InstructoraDelHilo & { socioId: string },
  ahora: Date = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; motivo: MotivoNoAbrir } | null> {
  const admin = adminOLanza();
  const filas = await filasDeSociaConInstructora(admin, p.studioId, p.instructorId, p.socioId, ahora);
  // `null` = no se pudo comprobar: nunca se lee como «sí».
  if (filas === null) throw new Error('No se ha podido comprobar si es su alumna');
  if (!instructoraAtiendeSocia(filas, p.instructorId, ahora)) return null;
  // Una ficha borrada responde como su ficha: no existe.
  const { data: socio, error: eSocio } = await admin.from('socios').select('id')
    .eq('id', p.socioId).eq('studio_id', p.studioId).is('borrado_en', null).maybeSingle();
  if (eSocio) throw eSocio;
  if (!socio) return null;
  // Con una alumna menor de 14, los mensajes van por el estudio (opción prudente).
  if (await alumnaMenorParaChat(admin, p.studioId, p.socioId, ahora)) return { ok: false, motivo: 'MENOR' };

  const { data, error } = await admin.rpc('abrir_conversacion', {
    p_studio_id: p.studioId,
    p_tipo: TIPO,
    p_socio_id: p.socioId,
    p_instructor_id: p.instructorId,
    p_ancla_sesion_id: null,
    p_ancla_reserva_id: null,
  });
  if (error) {
    if (error.message.includes('PARTICIPANTE_SIN_CUENTA')) return { ok: false, motivo: 'SIN_CUENTA' };
    if (error.message.includes('SIN_RELACION_VALIDA')) return { ok: false, motivo: 'SIN_CLASE_CONFIRMADA' };
    throw error;
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (!fila?.id) throw new Error('abrir_conversacion no devolvió la conversación');
  return { ok: true, id: fila.id };
}

/**
 * Los últimos mensajes de un hilo suyo, del más antiguo al más nuevo, y si el hilo
 * admite mensajes. `null` si no es suyo. Lo que retiró el estudio sale sin su
 * texto (`mensajeParaApp`), también lo que escribió ella.
 */
export async function mensajesDeHilo(
  p: InstructoraDelHilo, conversacionId: string,
): Promise<{ mensajes: MensajeParaApp<RowMensajes>[]; estado: EstadoHilo } | null> {
  const admin = adminOLanza();
  const hilo = await esHiloSuyo(admin, p, conversacionId);
  if (!hilo) return null;
  const { data, error } = await admin.from('mensajes')
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en, oculto_en')
    .eq('conversacion_id', conversacionId).order('creado_en', { ascending: false }).limit(LIMITE_MENSAJES);
  if (error) throw error;
  return { mensajes: ((data ?? []) as RowMensajes[]).slice().reverse().map(mensajeParaApp), estado: hilo.estado };
}

export type ResultadoEnviarEnHilo = { ok: true; mensaje: RowMensajes } | { ok: false; estado: EstadoHilo };

/**
 * Escribe en un hilo suyo. `null` si no es suyo; `ok: false` si el hilo ya no
 * admite mensajes (cerrado o bloqueado: lo comprueba antes y, si cambia entre
 * medias, lo para el trigger de la base de datos). El cuerpo llega ya validado
 * (1–4000).
 */
export async function enviarEnHilo(
  p: InstructoraDelHilo, conversacionId: string, cuerpo: string,
): Promise<ResultadoEnviarEnHilo | null> {
  const admin = adminOLanza();
  const hilo = await esHiloSuyo(admin, p, conversacionId);
  if (!hilo) return null;
  if (hilo.estado !== 'ABIERTA') return { ok: false, estado: hilo.estado };
  const { data, error } = await admin.from('mensajes')
    .insert({
      id: `msg-${crypto.randomUUID()}`,
      conversacion_id: conversacionId,
      studio_id: p.studioId,
      remitente_auth_user_id: p.userId,
      cuerpo,
    })
    .select('id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en')
    .single();
  if (error) {
    const moderacion = errorDeModeracion(error);
    if (moderacion) return { ok: false, estado: moderacion.estado };
    throw error;
  }
  return { ok: true, mensaje: data as RowMensajes };
}

/** Denuncia un mensaje de la alumna en un hilo suyo. `null` si el hilo no es suyo. */
export async function denunciarEnHilo(
  p: InstructoraDelHilo, conversacionId: string, mensajeId: string, detalle: string | null,
): Promise<ResultadoModeracionChat | null> {
  return denunciarMensaje(adminOLanza(), {
    studioId: p.studioId, conversacionId, mensajeId, detalle, yo: { tipo: 'INSTRUCTORA', authUserId: p.userId },
  });
}

/** Bloquea (o desbloquea) a la alumna de un hilo suyo. `null` si el hilo no es suyo. */
export async function bloquearEnHilo(
  p: InstructoraDelHilo, conversacionId: string, bloquear: boolean, detalle: string | null,
): Promise<ResultadoModeracionChat | null> {
  return bloquearEnChat(adminOLanza(), {
    studioId: p.studioId, conversacionId, bloquear, detalle, yo: { tipo: 'INSTRUCTORA', authUserId: p.userId },
  });
}

/**
 * Marca un hilo suyo como leído por ella, hasta el último mensaje que su
 * pantalla ha pintado (`hasta`; sin él, hasta ahora: app anterior), y apaga sus
 * avisos de ese hilo. `false` si no es suyo.
 */
export async function marcarHiloLeido(
  p: InstructoraDelHilo, conversacionId: string, hasta?: string | null,
): Promise<boolean> {
  const admin = adminOLanza();
  if (!(await esHiloSuyo(admin, p, conversacionId))) return false;
  const instante = typeof hasta === 'string' ? await instanteDelMensaje(admin, conversacionId, hasta) : null;
  // Sin nada pintado (hilo vacío) no hay nada que marcar.
  if (hasta !== undefined && !instante) return true;
  let marca = admin.from('conversacion_participantes')
    .update({ leido_hasta: instante ?? new Date().toISOString() })
    .eq('conversacion_id', conversacionId).eq('auth_user_id', p.userId).eq('rol_en_conversacion', 'STAFF');
  if (instante) marca = marca.lt('leido_hasta', instante); // nunca hacia atrás
  const { error } = await marca;
  if (error) throw error;
  const errorAvisos = await marcarAvisosDeConversacionLeidos(admin, {
    userId: p.userId, studioId: p.studioId, conversacionId, lado: 'equipo',
    ...(instante ? { hasta: instante } : {}),
  });
  if (errorAvisos) throw errorAvisos;
  return true;
}

/**
 * Avisa a la alumna de un mensaje nuevo. Best-effort: se llama en `after()`,
 * cuando el mensaje ya está guardado, y nunca lanza.
 */
export async function avisarMensajeNuevo(
  p: InstructoraDelHilo & { remitente: string }, conversacionId: string, mensajeId: string,
): Promise<void> {
  // Sin slug a propósito: `emitirMensajeRecibido` pone el ACTUAL del estudio; el
  // del body puede ser una dirección antigua.
  try {
    const admin = adminOLanza();
    // La alumna, como SOCIA por su papel en el hilo (no por lo que sea su cuenta).
    const reparto = await repartoAvisoMensaje(
      admin, { id: conversacionId, tipo: TIPO, studio_id: p.studioId }, p.userId,
    );
    if (reparto.authUserIds.length === 0) return;
    await emitirMensajeRecibido(admin, {
      studioId: p.studioId, conversacionId, mensajeId, remitente: p.remitente,
      previsualizacion: previsualizacionParaAviso(TIPO, ''), tipo: TIPO,
      authUserIds: reparto.authUserIds, recipients: reparto.recipients, socioId: reparto.socioId,
    });
  } catch (e) {
    console.error('[portal-instructora/mensajes] aviso tras enviar falló', e instanceof Error ? e.message : e);
  }
}
