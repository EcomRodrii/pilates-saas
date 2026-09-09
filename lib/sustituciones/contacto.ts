import type { SupabaseClient } from '@supabase/supabase-js';
import { uid, fechaLargaEstudio, horaEstudio } from '@/lib/utils';
import { firmarTokenInstructora } from '@/lib/sustituciones/token';
import {
  enviarEmailContactoSustituta,
  enviarEmailAlertaPropietaria,
} from '@/lib/sustituciones/email';
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla, PLANTILLA_SUSTITUCION } from '@/lib/whatsapp';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { acumuladorSalud } from '@/lib/integraciones/salud';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { tieneFeature } from '@/lib/billing/entitlements';
import {
  cuerpoNudgeCandidata,
  parametrosNudgeCandidata,
  type TipoAlertaPropietaria,
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
  // Ver SustitucionCandidata (lib/api-client.ts): `null`/ausente = sin historial
  // suficiente, nunca "probabilidad cero".
  prob_aceptacion?: number | null;
  prob_aceptadas?: number;
  prob_ofertas?: number;
};

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

// Fecha/hora de la clase en texto legible (España). Compartido por ruta, avisos y escalado.
export function formatCuando(inicio: string): string {
  const d = new Date(inicio);
  return `${fechaLargaEstudio(d)} · ${horaEstudio(d)}`;
}

type SesionMin = { inicio: string; tipo_clase_id: string | null } | null;

function unaSesion(v: unknown): SesionMin {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? null) as SesionMin;
}

/**
 * Anota un intento de contacto. Único sitio que escribe en `sustitucion_contactos`
 * para que la traza que ve la propietaria no mienta por omisión: durante un tiempo
 * solo se registraba el email y el nudge de WhatsApp/SMS era invisible, así que el
 * historial daba a entender que no se había hecho nada más.
 *
 * Best-effort a propósito: un fallo al ESCRIBIR EL LOG no puede tumbar un contacto
 * que ya se ha hecho. Perder una línea de traza es malo; no avisar a la sustituta
 * porque el log falló es mucho peor.
 */
async function registrarContacto(
  admin: SupabaseClient,
  p: {
    studioId: string; sustitucionId: string; instructorId: string;
    canal: 'email' | 'whatsapp'; estado: 'enviado' | 'fallido'; token?: string;
  },
): Promise<void> {
  try {
    await admin.from('sustitucion_contactos').insert({
      id: `cont-${uid()}`,
      studio_id: p.studioId,
      sustitucion_id: p.sustitucionId,
      instructor_id: p.instructorId,
      canal: p.canal,
      estado: p.estado,
      token: p.token ?? null,
    });
  } catch (e) {
    console.error('[sustituciones] no se pudo registrar el contacto', e);
  }
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
    admin.from('studios').select('nombre, color_primario, logo_url').eq('id', studioId).maybeSingle(),
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
  // canal siempre 'email' aquí; el tono recordatorio lo lleva el propio email.
  await registrarContacto(admin, {
    studioId, sustitucionId, instructorId, canal: 'email', estado: 'enviado', token,
  });

  const envio = await enviarEmailContactoSustituta({
    to: cand.email,
    toName: cand.nombre,
    estudioNombre: estudio?.nombre ?? 'Tu estudio',
    colorPrimario: estudio?.color_primario,
    logoUrl: estudio?.logo_url,
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
 * Manda a la candidata YA contactada un recordatorio por WhatsApp (subida de
 * canal del escalado). El email de recordatorio va aparte. Degrada limpio si el
 * estudio no tiene su WhatsApp Business conectado o la instructora no tiene
 * teléfono.
 *
 * Es el ÚNICO de los siete emisores migrados de Twilio que usa una plantilla
 * HSM propia (`sustitucion_urgente`), y por dos razones que van juntas: su
 * cuerpo tiene forma FIJA —a diferencia del texto libre de campañas,
 * automatizaciones y del contacto del Decision OS, que no se puede aprobar de
 * antemano— y es el que más la necesita, porque este aviso es precisamente la
 * escalada de un email que la instructora NO ha contestado: dar por hecho que
 * ella escribió al estudio en las últimas 24 h es dar por hecho lo contrario de
 * lo que está pasando. Sin la plantilla se manda texto igual (llega a quien sí
 * escribió hace poco) en vez de no mandar nada.
 *
 * El canal SMS de respaldo desapareció con Twilio: Meta no manda SMS, y aquel
 * respaldo no llegó a enviar un solo mensaje en producción (0 filas
 * `canal='sms'` en `sustitucion_contactos`).
 */
export async function recordatorioPorMensaje(
  admin: SupabaseClient,
  params: { studioId: string; instructorId: string; sustitucionId: string; sesion: SesionMin },
): Promise<{ enviado: boolean; skipped: boolean }> {
  const { studioId, instructorId, sustitucionId, sesion } = params;
  const [{ data: cand }, { data: intg }] = await Promise.all([
    admin.from('instructores').select('nombre, telefono')
      .eq('id', instructorId).eq('studio_id', studioId).maybeSingle(),
    admin.from('integraciones').select('activo, config')
      .eq('studio_id', studioId).eq('tipo', 'WHATSAPP').maybeSingle(),
  ]);
  if (!cand?.telefono) return { enviado: false, skipped: true };

  // Sin WhatsApp conectado el canal sencillamente no existe para este estudio:
  // `skipped`, no `fallido`. Anotarlo como fallo llenaría la traza que ve la
  // propietaria de rojo por algo que ella no ha roto — mismo criterio que tenía
  // el «Twilio no configurado» de antes.
  const whatsapp = whatsappDelEstudio(intg as { activo: boolean; config: Record<string, string> | null } | null);
  if (!whatsapp) return { enviado: false, skipped: true };

  const { data: tipo } = await admin
    .from('tipos_clase').select('nombre').eq('id', sesion?.tipo_clase_id ?? '').maybeSingle();

  // Reutiliza el último token de esta candidata para el enlace de aceptación.
  const token = firmarTokenInstructora(instructorId, studioId, 'aceptar_sustitucion', sustitucionId);
  const url = `${appUrl()}/aceptar-sustitucion/${token}`;
  const datos = {
    nombre: cand.nombre,
    claseNombre: tipo?.nombre ?? 'una clase',
    cuando: sesion?.inicio ? formatCuando(sesion.inicio) : '',
    url,
  };

  const res = whatsapp.plantillaSustitucion
    ? await enviarWhatsAppPlantilla(whatsapp, cand.telefono, PLANTILLA_SUSTITUCION, parametrosNudgeCandidata(datos))
    : await enviarWhatsAppTexto(whatsapp, cand.telefono, cuerpoNudgeCandidata(datos));

  // Un solo envío: el acumulador es aquí un formalismo, pero mantiene el
  // criterio en un sitio (`salud.resultado()` devuelve null si no se intentó
  // nada) en vez de reimplementarlo a mano.
  const salud = acumuladorSalud();
  salud.anota(res);
  const resultadoSalud = salud.resultado();
  if (resultadoSalud) await registrarSaludIntegracion(admin, studioId, 'WHATSAPP', resultadoSalud);

  await registrarContacto(admin, {
    studioId, sustitucionId, instructorId, canal: 'whatsapp', estado: res.ok ? 'enviado' : 'fallido',
  });
  return { enviado: res.ok, skipped: false };
}

/**
 * Alerta a la propietaria: se ha dado una baja fuera del panel, nadie responde,
 * o se agotó el ranking. Email al estudio.
 * Idempotencia la garantiza el llamador (un solo disparo por candidata/
 * agotamiento vía step.run de Inngest; una sola vez al crear la baja).
 *
 * ⚠️ Ya no manda WhatsApp/SMS, y no es una pérdida de canal: iba a
 * `studios.telefono` con la credencial de plataforma de Twilio, que en
 * producción no existe — nunca salió de aquí un solo mensaje. Y no se ha
 * migrado a Meta como el resto porque aquí no hay integración de estudio que
 * aplique: sería el WhatsApp Business del estudio escribiendo al teléfono de
 * contacto del mismo estudio, que para una propietaria sola es EL MISMO NÚMERO
 * —y Meta rechaza un envío a sí mismo—. Llegaría a unas sí y a otras no según
 * cómo lo tengan montado, que es peor que no ofrecerlo.
 *
 * El aviso sigue llegando por email y por el panel; `mensaje` se conserva en el
 * retorno (siempre `false`) para no tocar a los cuatro llamadores por un dato
 * que ninguno usa para decidir nada.
 */
export async function alertarPropietaria(
  admin: SupabaseClient,
  params: {
    studioId: string;
    sesion: SesionMin;
    tipo: TipoAlertaPropietaria;
    candidataNombre?: string;  // 'sin_respuesta': la candidata; 'baja': quien no puede venir
    yaContactando?: boolean;   // 'baja': el motor ya está avisando (modo autónomo)
  },
): Promise<{ email: boolean; mensaje: boolean }> {
  const { studioId, sesion, tipo } = params;
  const { data: estudio } = await admin
    .from('studios').select('nombre, email, color_primario, logo_url').eq('id', studioId).maybeSingle();

  const { data: tc } = await admin
    .from('tipos_clase').select('nombre').eq('id', sesion?.tipo_clase_id ?? '').maybeSingle();

  const claseNombre = tc?.nombre ?? 'Clase';
  const cuando = sesion?.inicio ? formatCuando(sesion.inicio) : '';
  const estudioNombre = estudio?.nombre ?? 'Tu estudio';
  const urlPanel = `${appUrl()}/sustituciones`;

  let email = false;
  if (estudio?.email) {
    const r = await enviarEmailAlertaPropietaria({
      to: estudio.email, estudioNombre, colorPrimario: estudio.color_primario, logoUrl: estudio.logo_url,
      claseNombre, cuando, tipo,
      candidataNombre: params.candidataNombre, urlPanel,
      yaContactando: params.yaContactando,
    });
    email = 'ok' in r && r.ok === true;
  }

  return { email, mensaje: false };
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

// Modo de autonomía EFECTIVO del estudio: el configurado (modo_autonomia, 0039)
// degradado a 'asistido' si el plan ya no incluye `sustitucionesAutonomas`. Fuente
// única para no reimplementar la degradación en cada llamador (baja/escalado/endpoint).
export async function modoAutonomiaEfectivo(admin: SupabaseClient, studioId: string): Promise<string> {
  const { data: estudio } = await admin
    .from('studios').select('modo_autonomia, plan, subscription_status').eq('id', studioId).maybeSingle();
  let modo = (estudio?.modo_autonomia as string) ?? 'asistido';
  if ((modo === 'autonomo' || modo === 'vacaciones') &&
      !tieneFeature({ plan: estudio?.plan, subscriptionStatus: estudio?.subscription_status }, 'sustitucionesAutonomas')) {
    modo = 'asistido';
  }
  return modo;
}
