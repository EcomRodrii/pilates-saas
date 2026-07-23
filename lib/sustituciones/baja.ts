import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { contactarDesde, alertarPropietaria, type RankingItem } from '@/lib/sustituciones/contacto';
import { mensajeSeguro } from '@/lib/errores';
import { tieneFeature } from '@/lib/billing/entitlements';

// ── Núcleo de "marcar una baja" ─────────────────────────────────────────────
//
// Un solo sitio para crear una sustitución, lo pida quien lo pida: la
// propietaria desde el panel (`app/api/sustituciones` POST) o la propia
// instructora desde su móvil por deep link firmado (`app/api/public/baja`).
//
// Extraído aquí precisamente para que la segunda vía NO reimplemente el motor:
// idempotencia, scoring, modo de autonomía y arranque del escalado son idénticos
// vengan de donde vengan. La ÚNICA diferencia legítima entre ambas es quién
// puede pedirlo (eso lo decide cada ruta) y a quién hay que avisar después.

// Estados que se consideran "activos" (una baja en curso). Coincide con el índice
// único parcial `uq_sustitucion_activa_por_sesion` de la migración 0037.
const ESTADOS_INACTIVOS = '(sin_sustituta,resuelta_fuera,cancelada)';

export type OrigenBaja = 'panel' | 'instructora';

export type ResultadoBaja =
  | { ok: true; sustitucion: Record<string, unknown>; yaExistia: boolean }
  | { ok: false; error: string; status: number };

// Emite el evento de escalado. Best-effort: si el bus de Inngest falla, el contacto
// ya se hizo (email enviado) — el escalado es una capa de resiliencia encima, no
// debe tumbar la petición del usuario.
async function emitirEscalado(data: { sustitucionId: string; studioId: string; instructorId: string; idx: number }) {
  try {
    await inngest.send({ name: EVENTS.SUSTITUCION_CONTACTADA, data });
  } catch (e) {
    console.error('[sustituciones] no se pudo emitir el evento de escalado', e);
  }
}

/**
 * Crea la baja de una clase: calcula el ranking de candidatas y la deja lista
 * según el modo de autonomía del estudio. Idempotente (una sustitución activa
 * por clase, garantizado en BD por índice único parcial).
 *
 * `soloSiInstructorEs`: cuando la pide la propia instructora, la clase debe ser
 * SUYA. Se comprueba dentro de la misma consulta que valida el estudio para que
 * no haya ventana entre comprobar y actuar.
 */
export async function crearBaja(
  admin: SupabaseClient,
  params: {
    studioId: string;
    sesionId: string;
    motivo?: string | null;
    origen: OrigenBaja;
    soloSiInstructorEs?: string;
  },
): Promise<ResultadoBaja> {
  const { studioId, sesionId, origen } = params;
  const motivo = typeof params.motivo === 'string' ? params.motivo.trim().slice(0, 500) || null : null;

  // La clase debe existir y ser de este estudio.
  const { data: clase } = await admin
    .from('sesiones').select('id, studio_id, instructor_id, cancelada, inicio, tipo_clase_id')
    .eq('id', sesionId).eq('studio_id', studioId).maybeSingle();
  if (!clase) return { ok: false, error: 'Clase no encontrada', status: 404 };
  if (clase.cancelada) return { ok: false, error: 'La clase ya está cancelada', status: 409 };

  // Una instructora solo puede darse de baja de SUS clases. Mismo mensaje que
  // "no encontrada" para no filtrar qué clases existen en el estudio.
  if (params.soloSiInstructorEs && clase.instructor_id !== params.soloSiInstructorEs) {
    return { ok: false, error: 'Clase no encontrada', status: 404 };
  }

  // Idempotencia (rápida): si ya hay una sustitución activa para esta clase, la devuelve.
  const { data: existente } = await admin
    .from('sustituciones').select('*')
    .eq('sesion_id', sesionId).not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle();
  if (existente) return { ok: true, sustitucion: existente, yaExistia: true };

  // Modo de autonomía del estudio (0039), degradado por plan: autónomo y
  // vacaciones son del plan Estudio+ (lo que anuncia la página de precios). Si
  // el estudio bajó de plan con el modo puesto, el motor cae a asistido en vez
  // de operar una feature que ya no paga.
  const { data: estudio } = await admin
    .from('studios').select('modo_autonomia, plan, subscription_status').eq('id', studioId).maybeSingle();
  let modo = (estudio?.modo_autonomia as string) ?? 'asistido';
  if ((modo === 'autonomo' || modo === 'vacaciones') &&
      !tieneFeature({ plan: estudio?.plan, subscriptionStatus: estudio?.subscription_status }, 'sustitucionesAutonomas')) {
    modo = 'asistido';
  }

  // Scoring: top-3 de candidatas con motivos en lenguaje humano (función 0038).
  const { data: ranking, error: errRank } = await admin.rpc('rankear_candidatas', { p_sesion_id: sesionId });
  if (errRank) {
    console.error('[crearBaja:rankear]', errRank.message);
    return { ok: false, error: mensajeSeguro(errRank.message,
      'No se han podido calcular las candidatas para cubrir esta clase. Inténtalo de nuevo en unos segundos.'), status: 500 };
  }

  // asistido → espera el visto bueno de la propietaria; autonomo/vacaciones →
  // arranca en 'contactando' y más abajo se avisa sola a la 1ª candidata.
  const estado = modo === 'autonomo' || modo === 'vacaciones' ? 'contactando' : 'pendiente_aprobacion';

  const nueva = {
    id: `sust-${uid()}`,
    studio_id: studioId,
    sesion_id: sesionId,
    instructor_original_id: clase.instructor_id,
    motivo,
    estado,
    origen,
    ranking: ranking ?? [],
    candidata_actual: 0,
  };

  const { data: insertada, error: errIns } = await admin
    .from('sustituciones').insert(nueva).select('*').single();

  if (errIns) {
    // Choque con el índice único parcial (dos bajas simultáneas de la misma
    // clase) → gana la primera; devolvemos la activa en vez de crear otra.
    if (errIns.code === '23505') {
      const { data: activa } = await admin
        .from('sustituciones').select('*')
        .eq('sesion_id', sesionId).not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle();
      if (activa) return { ok: true, sustitucion: activa, yaExistia: true };
    }
    console.error('[crearBaja:insertar]', errIns.message);
    return { ok: false, error: mensajeSeguro(errIns.message,
      'No se ha podido registrar la baja. Inténtalo de nuevo en unos segundos.'), status: 500 };
  }

  const sesionMin = { inicio: clase.inicio as string, tipo_clase_id: clase.tipo_clase_id as string | null };

  // Modo autónomo/vacaciones: la dueña ha "desaparecido" → el motor contacta solo
  // a la primera candidata contactable y arranca el escalado. En asistido no se
  // contacta a nadie aquí (espera el visto bueno de la propietaria en el panel).
  if (insertada.estado === 'contactando') {
    const rank = (Array.isArray(ranking) ? ranking : []) as RankingItem[];
    const r = await contactarDesde(admin, {
      sustitucionId: insertada.id, studioId, sesion: sesionMin, ranking: rank, desde: 0,
    });
    if (r.contactada) {
      await emitirEscalado({ sustitucionId: insertada.id, studioId, instructorId: r.instructorId, idx: r.idx });
    }
    // Si nadie es contactable (ranking vacío o sin emails), la baja queda en
    // 'contactando' con el ranking vacío → el panel muestra "cancelar clase".
  }

  // REGLA DURA del módulo: la propietaria se entera ANTES o A LA VEZ que las
  // alumnas. Si la baja nació fuera del panel, ella todavía no lo sabe → hay que
  // avisarla activamente, y en modo asistido además su visto bueno es lo único
  // que desbloquea el flujo (si no ve el aviso, la clase se queda sin cubrir).
  // Best-effort: que falle el email no puede tumbar una baja ya registrada.
  if (origen === 'instructora') {
    try {
      const { data: quien } = await admin
        .from('instructores').select('nombre').eq('id', clase.instructor_id ?? '').maybeSingle();
      await alertarPropietaria(admin, {
        studioId,
        sesion: sesionMin,
        tipo: 'baja',
        candidataNombre: quien?.nombre ?? undefined,
        yaContactando: insertada.estado === 'contactando',
      });
    } catch (e) {
      console.error('[sustituciones] no se pudo avisar a la propietaria de la baja', e);
    }
  }

  return { ok: true, sustitucion: insertada, yaExistia: false };
}
