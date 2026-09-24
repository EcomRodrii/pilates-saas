// ─────────────────────────────────────────────────────────────────────────────
// Embudo de alta — Fase 3 del onboarding (facetas 9/11: acompañamiento).
//
// Dos empujones, sin cron propio: se cuelgan del hueco diario que ya abre
// reviewBoostDispatcher (lib/inngest/review-boost.ts) porque Inngest va al
// ~84% del plan gratuito y la decisión ya está tomada — reutilizar, no crear
// uno nuevo. Ninguno de los dos es una guardia de seguridad: el margen de
// hasta ~24h que da una cadencia diaria es aceptable para un nudge de
// producto, igual que ya asume review-boost con "trial recién terminado".
//
//  · Cuenta sin estudio (>24h): `pending_studio` (lib/crear-estudio) es la
//    misma señal que ya usa scripts/recuperar-altas-huerfanas.ts para
//    recuperar altas a medias hacia atrás — aquí es el aviso hacia delante.
//    Dos variantes de email según `email_confirmed_at`: quien no confirmó
//    vuelve a /crear-estudio, quien sí confirmó pero se quedó sin estudio
//    entra por /login (ya detecta pending_studio sola).
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
import { enviarAvisoEmbudoAlta } from '@/lib/emails/embudo-alta-server';
import { emitirEmbudoSinClasesProgramadas, emitirEmbudoSinPrimeraReserva } from '@/lib/notifications/emit';
import { avisoDeEmbudo, HORAS_SIN_CLASES } from '@/lib/onboarding/embudo-avisos';

const MS_HORA = 3_600_000;
const VENTANA_DIAS_ESTUDIOS = 30; // mismo criterio que review-boost.ts: acota la ventana, no escanea la vida entera.

interface PendingStudio {
  nombre: string;
}

function esPendingStudio(v: unknown): v is PendingStudio {
  return !!v && typeof v === 'object' && typeof (v as { nombre?: unknown }).nombre === 'string';
}

export async function barrerCuentasSinEstudio(admin: SupabaseClient): Promise<{ avisadas: number }> {
  // Un solo `listUsers` (perPage generoso): mismo alcance que ya usa
  // scripts/recuperar-altas-huerfanas.ts para este mismo problema — el
  // volumen de altas de Tentare no se acerca a necesitar paginar esto todavía.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);

  const hace24h = Date.now() - 24 * MS_HORA;
  let avisadas = 0;

  for (const u of data.users) {
    const pending = u.user_metadata?.pending_studio;
    if (!esPendingStudio(pending)) continue;
    if (u.user_metadata?.embudo_alta_avisado_en) continue;
    if (new Date(u.created_at).getTime() > hace24h) continue;
    if (!u.email) continue;

    // Por si acaso ya tiene estudio (se completó por otra vía y no se limpió
    // la metadata): no se avisa de nada, solo se deja de mirar esta cuenta.
    const { data: existentes } = await admin.from('studios').select('id').eq('owner_auth_user_id', u.id).limit(1);
    if (existentes && existentes.length > 0) {
      await admin.auth.admin.updateUserById(u.id, { user_metadata: { ...u.user_metadata, pending_studio: null } });
      continue;
    }

    const res = await enviarAvisoEmbudoAlta({
      to: u.email,
      confirmado: !!u.email_confirmed_at,
      estudioNombre: pending.nombre,
    });
    if (res.ok) {
      avisadas++;
      await admin.auth.admin.updateUserById(u.id, {
        user_metadata: { ...u.user_metadata, embudo_alta_avisado_en: new Date().toISOString() },
      });
    }
  }

  return { avisadas };
}

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
    const { count: sesiones } = await admin.from('sesiones').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id);
    // Las reservas solo se cuentan si hay horario: sin él no puede haberlas.
    let reservas = 0;
    if ((sesiones ?? 0) > 0) {
      const { count } = await admin.from('reservas').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id);
      reservas = count ?? 0;
    }
    const aviso = avisoDeEmbudo({
      creadoHaceHoras: (ahora - new Date(studio.creado_en).getTime()) / MS_HORA,
      sesiones: sesiones ?? 0,
      reservas,
      pruebaExpirada: studio.subscription_status === 'trial_expirado',
    });
    if (aviso === 'SIN_CLASES') { await emitirEmbudoSinClasesProgramadas({ studioId: studio.id }); avisados++; }
    else if (aviso === 'SIN_RESERVAS') { await emitirEmbudoSinPrimeraReserva({ studioId: studio.id }); sinReservas++; }
  }
  return { avisados, sinReservas };
}
