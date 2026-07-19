import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';
import {
  enviarEmailContactoSustituta,
  enviarEmailAlertaPropietaria,
} from '@/lib/sustituciones/email';
import { enviarMensajeTwilio } from '@/lib/twilio';
import {
  cuerpoNudgeCandidata,
  cuerpoAlertaPropietaria,
} from '@/lib/sustituciones/mensajes';

// ── Núcleo del contacto a una candidata ─────────────────────────────────────
//
// Un solo sitio para "avisar a esta candidata": lo usa el panel (la dueña pulsa
// "Avisar a X"), el modo autónomo (contacta sola a la candidata 0) y el motor de
// escalado (avanza al siguiente del ranking). Deja la sustitución en 'contactando'
// con candidata_actual apuntando a esta candidata, registra el intento y manda el
// email. La emisión del evento Inngest de escalado la hace el LLAMADOR (para poder
// usar step.sendEvent durable dentro de la función de Inngest).

const ESTADOS_CONTACTABLES = ['buscando', 'pendiente_aprobacion', 'contactando', 'agotada'];

// Estados en los que una sustitución sigue "en juego" (una candidata puede aún
// aceptarla). Coincide con el compare-and-set de confirmar_sustitucion (0042).
export const ESTADOS_EN_JUEGO = ['buscando', 'pendiente_aprobacion', 'contactando', 'agotada'];

export type RankingItem = {
  instructor_id: string;
  nombre?: string;
  compatibilidad?: number;
  veces?: number;
  motivos?: string[];
};

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

// Fecha/hora de la clase en texto legible (España). Compartido por ruta, avisos y escalado.
export function formatCuando(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha} · ${hora}`;
}

type SesionMin = { inicio: string; tipo_clase_id: string | null } | null;

function unaSesion(v: unknown): SesionMin {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? null) as SesionMin;
}

export interface ResultadoContacto {
  ok: boolean;
  motivo?: 'sin_email' | 'no_contactable' | 'candidata_no_encontrada';
  candidata?: string;
  instructorId: string;
  idx: number;
  emailEnviado: boolean;
  emailSkipped: boolean;
}

/**
 * Contacta a una candidata concreta para cubrir una clase. Idempotente por diseño:
 * si se llama dos veces marca contactando dos veces y manda dos emails (el llamador
 * decide cuándo llamar). Devuelve `ok:false, motivo:'sin_email'` si la candidata no
 * tiene email (el panel lo muestra; el escalado salta a la siguiente).
 *
 * NO emite el evento de escalado — eso lo hace el llamador.
 */
export async function contactarCandidata(
  admin: SupabaseClient,
  params: {
    sustitucionId: string;
    studioId: string;
    instructorId: string;
    idx: number;               // posición en el ranking (candidata_actual)
    sesion: SesionMin;
    esRecordatorio?: boolean;  // recordatorio (2º toque) vs. primer contacto
  },
): Promise<ResultadoContacto> {
  const { sustitucionId, studioId, instructorId, idx, sesion } = params;

  const { data: cand } = await admin
    .from('instructores').select('nombre, email')
    .eq('id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (!cand) {
    return { ok: false, motivo: 'candidata_no_encontrada', instructorId, idx, emailEnviado: false, emailSkipped: false };
  }
  if (!cand.email) {
    return { ok: false, motivo: 'sin_email', candidata: cand.nombre, instructorId, idx, emailEnviado: false, emailSkipped: false };
  }

  const [{ data: tipo }, { data: estudio }] = await Promise.all([
    admin.from('tipos_clase').select('nombre').eq('id', sesion?.tipo_clase_id ?? '').maybeSingle(),
    admin.from('studios').select('nombre').eq('id', studioId).maybeSingle(),
  ]);

  // Marca contactando + la candidata actual. Guard de estado: solo si la
  // sustitución sigue "en juego" (evita reactivar una ya resuelta/cancelada).
  await admin.from('sustituciones')
    .update({ estado: 'contactando', candidata_actual: idx })
    .eq('id', sustitucionId).eq('studio_id', studioId)
    .in('estado', ESTADOS_CONTACTABLES);

  // Token de aceptación (un solo uso, ventana corta, ligado a esta sustitución).
  const token = firmarTokenInstructora(instructorId, studioId, 'aceptar_sustitucion', sustitucionId);
  const url = `${appUrl()}/aceptar-sustitucion/${token}`;

  // Registra el intento con su token (para poder marcar aceptado/rechazado luego).
  // canal siempre 'email' aquí (el CHECK de la tabla solo admite email/whatsapp/
  // sms/llamada/push); el tono recordatorio lo lleva el propio email.
  await admin.from('sustitucion_contactos').insert({
    id: `cont-${uid()}`,
    studio_id: studioId,
    sustitucion_id: sustitucionId,
    instructor_id: instructorId,
    canal: 'email',
    estado: 'enviado',
    token,
  });

  const envio = await enviarEmailContactoSustituta({
    to: cand.email,
    toName: cand.nombre,
    estudioNombre: estudio?.nombre ?? 'Tu estudio',
    claseNombre: tipo?.nombre ?? 'Clase',
    cuando: sesion?.inicio ? formatCuando(sesion.inicio) : '',
    url,
    recordatorio: params.esRecordatorio,
  });

  return {
    ok: true,
    candidata: cand.nombre,
    instructorId,
    idx,
    emailEnviado: 'ok' in envio && envio.ok === true,
    emailSkipped: 'skipped' in envio,
  };
}

/**
 * Contacta a la PRIMERA candidata contactable del ranking a partir de `desde`
 * (salta a las que no tienen email). Único sitio para "empezar a avisar" y para
 * "avanzar al siguiente". Devuelve a quién se contactó, o `contactada:false` si se
 * agotó el ranking sin nadie contactable.
 */
export async function contactarDesde(
  admin: SupabaseClient,
  params: { sustitucionId: string; studioId: string; sesion: SesionMin; ranking: RankingItem[]; desde: number },
): Promise<{ contactada: true; instructorId: string; idx: number } | { contactada: false }> {
  const { sustitucionId, studioId, sesion, ranking, desde } = params;
  for (let i = Math.max(0, desde); i < ranking.length; i++) {
    const c = ranking[i];
    if (!c?.instructor_id) continue;
    const r = await contactarCandidata(admin, { sustitucionId, studioId, instructorId: c.instructor_id, idx: i, sesion });
    if (r.ok) return { contactada: true, instructorId: c.instructor_id, idx: i };
  }
  return { contactada: false };
}

/**
 * Manda a la candidata YA contactada un recordatorio por WhatsApp/SMS (subida de
 * canal del escalado). El email de recordatorio va aparte. Degrada limpio si
 * Twilio no está configurado o la instructora no tiene teléfono.
 */
export async function recordatorioPorMensaje(
  admin: SupabaseClient,
  params: { studioId: string; instructorId: string; sustitucionId: string; sesion: SesionMin },
): Promise<{ enviado: boolean; skipped: boolean }> {
  const { studioId, instructorId, sustitucionId, sesion } = params;
  const { data: cand } = await admin
    .from('instructores').select('nombre, telefono')
    .eq('id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (!cand?.telefono) return { enviado: false, skipped: true };

  const { data: tipo } = await admin
    .from('tipos_clase').select('nombre').eq('id', sesion?.tipo_clase_id ?? '').maybeSingle();

  // Reutiliza el último token de esta candidata para el enlace de aceptación.
  const token = firmarTokenInstructora(instructorId, studioId, 'aceptar_sustitucion', sustitucionId);
  const url = `${appUrl()}/aceptar-sustitucion/${token}`;
  const cuerpo = cuerpoNudgeCandidata({
    nombre: cand.nombre,
    claseNombre: tipo?.nombre ?? 'una clase',
    cuando: sesion?.inicio ? formatCuando(sesion.inicio) : '',
    url,
  });

  const wa = await enviarMensajeTwilio({ canal: 'WHATSAPP', to: cand.telefono, cuerpo });
  if (wa.ok) return { enviado: true, skipped: false };
  // Si WhatsApp no está configurado, intenta SMS antes de rendirse.
  const sms = await enviarMensajeTwilio({ canal: 'SMS', to: cand.telefono, cuerpo });
  if (sms.ok) return { enviado: true, skipped: false };
  return { enviado: false, skipped: !!(wa.skipped && sms.skipped) };
}

/**
 * Alerta a la propietaria: nadie responde / se agotó el ranking. Email al estudio
 * + WhatsApp/SMS si hay teléfono. Idempotencia la garantiza el llamador (un solo
 * disparo por candidata/agotamiento vía step.run de Inngest).
 */
export async function alertarPropietaria(
  admin: SupabaseClient,
  params: {
    studioId: string;
    sesion: SesionMin;
    tipo: 'agotada' | 'sin_respuesta';
    candidataNombre?: string; // para 'sin_respuesta'
  },
): Promise<{ email: boolean; mensaje: boolean }> {
  const { studioId, sesion, tipo } = params;
  const { data: estudio } = await admin
    .from('studios').select('nombre, email, telefono').eq('id', studioId).maybeSingle();

  const { data: tc } = await admin
    .from('tipos_clase').select('nombre').eq('id', sesion?.tipo_clase_id ?? '').maybeSingle();

  const claseNombre = tc?.nombre ?? 'Clase';
  const cuando = sesion?.inicio ? formatCuando(sesion.inicio) : '';
  const estudioNombre = estudio?.nombre ?? 'Tu estudio';
  const urlPanel = `${appUrl()}/sustituciones`;

  let email = false;
  if (estudio?.email) {
    const r = await enviarEmailAlertaPropietaria({
      to: estudio.email, estudioNombre, claseNombre, cuando, tipo,
      candidataNombre: params.candidataNombre, urlPanel,
    });
    email = 'ok' in r && r.ok === true;
  }

  let mensaje = false;
  if (estudio?.telefono) {
    const cuerpo = cuerpoAlertaPropietaria({ claseNombre, cuando, tipo, candidataNombre: params.candidataNombre, urlPanel });
    const wa = await enviarMensajeTwilio({ canal: 'WHATSAPP', to: estudio.telefono, cuerpo });
    if (wa.ok) mensaje = true;
    else {
      const sms = await enviarMensajeTwilio({ canal: 'SMS', to: estudio.telefono, cuerpo });
      mensaje = sms.ok;
    }
  }
  return { email, mensaje };
}

export interface Vigencia {
  vigente: boolean;
  estado: string | null;
  sesionId: string | null;
  sesionInicio: string | null;
  sesion: SesionMin;
  candidataIdx: number;
  ranking: RankingItem[];
}

/**
 * ¿Sigue "vigente" esta instancia de escalado? Solo si la sustitución sigue en
 * 'contactando' Y la candidata_actual del ranking es justo la que este escalado
 * está persiguiendo. Si alguien aceptó, la dueña confirmó/canceló, o ya avanzamos
 * a otra candidata → deja de ser vigente y el escalado se apaga solo.
 */
export async function escalacionVigente(
  admin: SupabaseClient,
  sustitucionId: string,
  instructorId: string,
): Promise<Vigencia> {
  const { data: sust } = await admin
    .from('sustituciones')
    .select('estado, candidata_actual, ranking, sesion_id, sesiones(inicio, tipo_clase_id)')
    .eq('id', sustitucionId).maybeSingle();

  const ranking = (Array.isArray(sust?.ranking) ? sust!.ranking : []) as RankingItem[];
  const candidataIdx = typeof sust?.candidata_actual === 'number' ? sust!.candidata_actual : 0;
  const sesion = unaSesion(sust?.sesiones);
  const actual = ranking[candidataIdx];
  const vigente = sust?.estado === 'contactando' && !!actual && actual.instructor_id === instructorId;

  return {
    vigente,
    estado: (sust?.estado as string) ?? null,
    sesionId: (sust?.sesion_id as string) ?? null,
    sesionInicio: sesion?.inicio ?? null,
    sesion,
    candidataIdx,
    ranking,
  };
}
