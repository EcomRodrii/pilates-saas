import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esMenorDeEdadConsentimiento } from '@/lib/datos-salud/edad';
import { registrarDenuncia } from './denuncias-servidor';
import { estadoDelHilo, TEXTO_MENOR_CHAT, type EstadoHilo, type ParticipanteHilo } from './reglas';
import type { AmbitoDenuncia } from './denuncias';

// Denunciar un mensaje y bloquear en el chat, desde la app de la alumna y la de
// la instructora (App Store 1.2). Service-role: la RLS no actúa, así que cada
// función comprueba antes que quien pide es parte de ESTE hilo de ESTE estudio
// (la alumna por su ficha, la instructora por su cuenta en un hilo con alumna)
// y, si no, responde igual que si no existiera (`null`).
//
// · Denunciar: un mensaje de la OTRA parte. Si el hilo es con el estudio, la
//   denuncia va a Tentare (`destinoDeDenuncia`); si es con una instructora, al
//   estudio (salvo que la autora sea una propietaria).
// · Bloquear: solo en un hilo instructora–alumna, y solo la fila propia
//   (`bloqueo_en`). Desde ese momento nadie escribe en él (trigger
//   `trg_mensajes_conversacion_abierta`) y el estudio recibe un aviso para
//   revisarlo (denuncia con motivo BLOQUEO). El hilo de una alumna con su
//   estudio no se bloquea: es el canal por el que el estudio le da servicio; se
//   denuncia, y esa denuncia la revisa Tentare.
// · Desbloquear: quita solo su propio bloqueo. Si la otra parte también
//   bloqueó, el hilo sigue sin admitir mensajes (y no se le dice por qué).

export type YoEnChat =
  | { tipo: 'ALUMNA'; socioId: string; authUserId: string }
  | { tipo: 'INSTRUCTORA'; authUserId: string };

type Participante = ParticipanteHilo & { auth_user_id: string | null };

interface HiloModerable {
  tipo: string;
  cerradaEn: string | null;
  participantes: Participante[];
}

const TIPOS_DE_ALUMNA = ['ALUMNA_INSTRUCTORA', 'ALUMNA_MOSTRADOR'];

function esMiFila(p: Participante, yo: YoEnChat): boolean {
  return yo.tipo === 'ALUMNA'
    ? p.rol_en_conversacion === 'SOCIO' && p.socio_id === yo.socioId
    : p.rol_en_conversacion === 'STAFF' && p.auth_user_id === yo.authUserId;
}

async function hiloModerable(
  admin: SupabaseClient, studioId: string, conversacionId: string, yo: YoEnChat,
): Promise<HiloModerable | null> {
  const { data, error } = await admin.from('conversaciones')
    .select('id, tipo, cerrada_en, conversacion_participantes(rol_en_conversacion, auth_user_id, socio_id, bloqueo_en)')
    .eq('id', conversacionId).eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const tipo = data.tipo as string;
  // La instructora solo modera en sus hilos con alumnas; la alumna, en los suyos.
  if (yo.tipo === 'INSTRUCTORA' ? tipo !== 'ALUMNA_INSTRUCTORA' : !TIPOS_DE_ALUMNA.includes(tipo)) return null;
  const participantes = (data.conversacion_participantes ?? []) as Participante[];
  if (!participantes.some((p) => esMiFila(p, yo))) return null;
  return { tipo, cerradaEn: data.cerrada_en as string | null, participantes };
}

function estadoPara(h: HiloModerable, yo: YoEnChat): EstadoHilo {
  return estadoDelHilo({
    tipo: h.tipo, cerradaEn: h.cerradaEn, participantes: h.participantes,
    yo: yo.tipo === 'ALUMNA' ? { socioId: yo.socioId, authUserId: yo.authUserId } : { authUserId: yo.authUserId },
  });
}

export type ResultadoModeracionChat =
  | { ok: true; estado?: EstadoHilo }
  | { ok: false; status: number; error: string };

/** Denuncia un mensaje de la otra parte. `null` si el hilo no es suyo. */
export async function denunciarMensaje(
  admin: SupabaseClient,
  p: { studioId: string; conversacionId: string; mensajeId: string; yo: YoEnChat; detalle?: string | null },
): Promise<ResultadoModeracionChat | null> {
  const hilo = await hiloModerable(admin, p.studioId, p.conversacionId, p.yo);
  if (!hilo) return null;
  const { data: mensaje, error } = await admin.from('mensajes').select('id, remitente_auth_user_id')
    .eq('id', p.mensajeId).eq('conversacion_id', p.conversacionId).eq('studio_id', p.studioId).maybeSingle();
  if (error) throw error;
  if (!mensaje) return { ok: false, status: 404, error: 'Este mensaje ya no existe.' };
  const autor = mensaje.remitente_auth_user_id as string | null;
  if (autor && autor === p.yo.authUserId) return { ok: false, status: 400, error: 'No puedes denunciar un mensaje tuyo.' };
  const ambito: AmbitoDenuncia = hilo.tipo === 'ALUMNA_MOSTRADOR' ? 'CHAT_ESTUDIO' : 'CHAT_INSTRUCTORA';
  await registrarDenuncia(admin, {
    studioId: p.studioId, ambito, motivo: 'DENUNCIA',
    conversacionId: p.conversacionId, mensajeId: p.mensajeId,
    autorAuthUserId: autor, denuncianteAuthUserId: p.yo.authUserId,
    socioId: p.yo.tipo === 'ALUMNA' ? p.yo.socioId : null, detalle: p.detalle ?? null,
  });
  // Denunciar lo mismo dos veces no es un error: «Gracias. Lo revisaremos.» igual.
  return { ok: true };
}

/** Bloquea (o desbloquea) a la otra parte de un hilo instructora–alumna. `null` si el hilo no es suyo. */
export async function bloquearEnChat(
  admin: SupabaseClient,
  p: { studioId: string; conversacionId: string; yo: YoEnChat; bloquear: boolean; detalle?: string | null },
): Promise<ResultadoModeracionChat | null> {
  const hilo = await hiloModerable(admin, p.studioId, p.conversacionId, p.yo);
  if (!hilo) return null;
  if (hilo.tipo !== 'ALUMNA_INSTRUCTORA') {
    return { ok: false, status: 400, error: 'La conversación con tu estudio no se puede bloquear. Si algo no está bien, denuncia el mensaje.' };
  }
  const mia = hilo.participantes.find((x) => esMiFila(x, p.yo))!;
  const otra = hilo.participantes.find((x) => !esMiFila(x, p.yo)) ?? null;

  let q = admin.from('conversacion_participantes')
    .update({ bloqueo_en: p.bloquear ? new Date().toISOString() : null })
    .eq('conversacion_id', p.conversacionId);
  q = p.yo.tipo === 'ALUMNA'
    ? q.eq('rol_en_conversacion', 'SOCIO').eq('socio_id', p.yo.socioId)
    : q.eq('rol_en_conversacion', 'STAFF').eq('auth_user_id', p.yo.authUserId);
  // Bloquear dos veces no mueve la fecha ni avisa otra vez.
  if (p.bloquear) q = q.is('bloqueo_en', null);
  const { data: cambiadas, error } = await q.select('conversacion_id');
  if (error) throw error;

  if (p.bloquear && (cambiadas ?? []).length > 0) {
    // El estudio tiene que saberlo: puede ser acoso. Nunca va el texto, solo el hilo.
    await registrarDenuncia(admin, {
      studioId: p.studioId, ambito: 'CHAT_INSTRUCTORA', motivo: 'BLOQUEO',
      conversacionId: p.conversacionId, mensajeId: null,
      autorAuthUserId: otra?.auth_user_id ?? null, denuncianteAuthUserId: p.yo.authUserId,
      socioId: p.yo.tipo === 'ALUMNA' ? p.yo.socioId : null, detalle: p.detalle ?? null,
    });
  }
  const ahora = p.bloquear ? (mia.bloqueo_en ?? new Date().toISOString()) : null;
  const participantes = hilo.participantes.map((x) => (x === mia ? { ...x, bloqueo_en: ahora } : x));
  return { ok: true, estado: estadoPara({ ...hilo, participantes }, p.yo) };
}

/**
 * Opción prudente mientras no haya dictamen sobre menores (duda abierta del
 * diseño, 5-oct-2026): no se ABRE un chat instructora–alumna con una alumna
 * menor de 14 años (`EDAD_MINIMA_CONSENTIMIENTO_SALUD`, el mismo umbral que ya
 * usa el consentimiento). Con ella, los mensajes van por el estudio. Sin fecha
 * de nacimiento no se asume menor (igual que en salud).
 */
export async function alumnaMenorParaChat(admin: SupabaseClient, studioId: string, socioId: string, hoy: Date = new Date()): Promise<boolean> {
  const { data, error } = await admin.from('socios').select('fecha_nacimiento')
    .eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  return esMenorDeEdadConsentimiento(data?.fecha_nacimiento ?? null, hoy);
}

export { TEXTO_MENOR_CHAT };
