// ─────────────────────────────────────────────────────────────────────────────
// Embudo de alta — Fase 3 del onboarding (facetas 9/11: acompañamiento).
//
// Los empujones a estudios ya creados, sin cron propio: se cuelgan del hueco diario que ya abre
// reviewBoostDispatcher (lib/inngest/review-boost.ts) porque Inngest va al
// ~84% del plan gratuito y la decisión ya está tomada — reutilizar, no crear
// uno nuevo. Ninguno de los dos es una guardia de seguridad: el margen de
// hasta ~24h que da una cadencia diaria es aceptable para un nudge de
// producto, igual que ya asume review-boost con "trial recién terminado".
//
//  · Cuenta sin estudio (>24h): YA NO VIVE AQUÍ (1-oct-2026). Lo manda el
//    cron horario de pg_cron `altas-sin-terminar` (lib/alta/recordatorio-
//    servidor.ts), con el paso exacto en que se quedó cada alta guardado en
//    `public.altas_estudio`. Aquí leía `pending_studio` de la metadata, que
//    gotrue borra al completarse el alta, y no dejaba rastro de nada.
//  · Estudio sin clases (>48h): mismo hallazgo que ya documenta
//    components/onboarding/propuesta-horario.tsx — sin horario no puede
//    haber ni una reserva. Un único aviso por estudio en toda su vida
//    (dedupKey sin fecha en emitirEmbudoSinClasesProgramadas).
//  · Estudio con horario pero sin ninguna reserva (>72h): segundo atasco del
//    mismo recorrido (lib/onboarding/embudo-avisos.ts). Casi siempre es que el
//    enlace de reservas no ha salido del panel. Mismo criterio de un único
//    aviso por estudio, y sin un paso de Inngest más: sale del mismo barrido.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { emitirEmbudoSinClasesProgramadas, emitirEmbudoSinPrimeraReserva } from '@/lib/notifications/emit';
import { avisoDeEmbudo, HORAS_SIN_CLASES } from '@/lib/onboarding/embudo-avisos';

const MS_HORA = 3_600_000;
const VENTANA_DIAS_ESTUDIOS = 30; // mismo criterio que review-boost.ts: acota la ventana, no escanea la vida entera.

export async function barrerEstudiosSinClases(admin: SupabaseClient): Promise<{ avisados: number; sinReservas: number }> {
  const ahora = Date.now();
  const haceMinimo = new Date(ahora - HORAS_SIN_CLASES * MS_HORA).toISOString();
  const desdeVentana = new Date(ahora - VENTANA_DIAS_ESTUDIOS * 24 * MS_HORA).toISOString();

  const { data: studios } = await admin
    .from('studios')
    .select('id, creado_en, subscription_status')
    .lte('creado_en', haceMinimo)
    .gte('creado_en', desdeVentana)
    .is('suspendido_en', null)
    .limit(500);

  if (!studios?.length) return { avisados: 0, sinReservas: 0 };

  // Los dos atascos salen del mismo recorrido (sin clases a las 48 h, sin
  // ninguna reserva a las 72 h), así que no cuesta un paso de Inngest más.
  let avisados = 0;
  let sinReservas = 0;
  for (const studio of studios as { id: string; creado_en: string; subscription_status: string | null }[]) {
    // `avisoDeEmbudo` solo distingue «ninguna» de «alguna»: una fila basta. Un
    // `count: 'exact'` recorría todas las de cada estudio, hasta 1000 consultas
    // seguidas en este paso.
    const { data: unaSesion } = await admin.from('sesiones').select('id').eq('studio_id', studio.id).limit(1);
    const haySesiones = (unaSesion?.length ?? 0) > 0;
    // Las reservas solo se miran si hay horario: sin él no puede haberlas.
    let hayReservas = false;
    if (haySesiones) {
      const { data: unaReserva } = await admin.from('reservas').select('id').eq('studio_id', studio.id).limit(1);
      hayReservas = (unaReserva?.length ?? 0) > 0;
    }
    const aviso = avisoDeEmbudo({
      creadoHaceHoras: (ahora - new Date(studio.creado_en).getTime()) / MS_HORA,
      sesiones: haySesiones ? 1 : 0,
      reservas: hayReservas ? 1 : 0,
      pruebaExpirada: studio.subscription_status === 'trial_expirado',
    });
    if (aviso === 'SIN_CLASES') { await emitirEmbudoSinClasesProgramadas({ studioId: studio.id }); avisados++; }
    else if (aviso === 'SIN_RESERVAS') { await emitirEmbudoSinPrimeraReserva({ studioId: studio.id }); sinReservas++; }
  }
  return { avisados, sinReservas };
}
