import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { avisoInactividadActivo, elegirParaAvisar, MAX_AVISOS_POR_PASADA, type FilaSituacionAviso } from './aviso-inactividad-reglas.ts';
import { enviarAvisoInactividad } from '@/lib/emails/aviso-inactividad-server';
import { emailDeLaPropietaria } from '@/lib/notifications/recipients';

// ─────────────────────────────────────────────────────────────────────────────
// «Llevas 30 días sin usar Tentare»: UN aviso por estudio, a su propietaria. Solo avisa: no borra, no
// suspende ni cambia el estado de nada (ver aviso-inactividad-reglas.ts). Va colgado del cron horario que
// ya hace el resto de la retención (`notif-trial`): sin cron nuevo.
//
// · Apagado por defecto: solo con AVISO_INACTIVIDAD=on.
// · Reclama la fila ANTES de enviar (compare-and-set sobre la clave primaria): dos pasadas a la vez no
//   mandan dos correos. Si el envío falla, la reclamación se suelta y se reintenta en la hora siguiente.
// · Como mucho MAX_AVISOS_POR_PASADA por hora: el tope diario de Resend lo comparten los códigos de acceso.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenAvisoInactividad {
  candidatos: number;
  enviados: number;
  fallidos: number;
  sinCorreo: number;
}

export async function avisarEstudiosInactivos(
  admin: SupabaseClient, entorno: Record<string, string | undefined> = process.env,
): Promise<ResumenAvisoInactividad | { skipped: string }> {
  if (!avisoInactividadActivo(entorno)) return { skipped: 'AVISO_INACTIVIDAD no está en on' };

  const { data: filas, error } = await admin.rpc('situacion_estudios');
  if (error) throw new Error(`situacion_estudios: ${error.message}`);
  const todas = (filas ?? []) as FilaSituacionAviso[];

  // Una consulta acotada a los que ya cumplen los días: son unos pocos, no la lista entera de estudios.
  const aptos = elegirParaAvisar(todas, new Set(), todas.length);
  if (aptos.length === 0) return { candidatos: 0, enviados: 0, fallidos: 0, sinCorreo: 0 };
  const { data: previos, error: errPrevios } = await admin
    .from('avisos_inactividad').select('studio_id').in('studio_id', aptos.map(f => f.studio_id));
  if (errPrevios) throw new Error(`avisos_inactividad: ${errPrevios.message}`);
  const yaAvisados = new Set((previos ?? []).map(r => r.studio_id as string));
  const elegidos = elegirParaAvisar(todas, yaAvisados, MAX_AVISOS_POR_PASADA);

  let enviados = 0, fallidos = 0, sinCorreo = 0;
  for (const f of elegidos) {
    const { data: studio } = await admin.from('studios')
      .select('nombre, email, owner_auth_user_id').eq('id', f.studio_id).maybeSingle();
    if (!studio) continue;
    const email = studio.owner_auth_user_id
      ? await emailDeLaPropietaria(admin, studio.owner_auth_user_id as string, studio.email as string | null)
      : ((studio.email as string | null) ?? null);
    if (!email) { sinCorreo++; continue; }

    const { error: errReclamo } = await admin.from('avisos_inactividad')
      .insert({ studio_id: f.studio_id, dias_sin_actividad: Math.floor(f.dias_sin_actividad) });
    if (errReclamo) {
      if (errReclamo.code === '23505') continue; // ya lo reclamó otra pasada
      throw new Error(errReclamo.message);
    }

    const r = await enviarAvisoInactividad({
      to: email, estudioNombre: (studio.nombre as string | null) ?? 'tu estudio', dias: Math.floor(f.dias_sin_actividad),
    });
    if (r.ok) { enviados++; continue; }

    // No salió: se suelta la reclamación para que la hora siguiente lo reintente (sin ella, ese estudio
    // no recibiría nunca el aviso). Y se avisa, que un fallo de envío no puede ser silencioso.
    fallidos++;
    await admin.from('avisos_inactividad').delete().eq('studio_id', f.studio_id);
    Sentry.captureMessage('[aviso-inactividad] el correo no salió', {
      level: 'warning', tags: { area: 'retencion' }, extra: { studioId: f.studio_id, error: r.error ?? (r.skipped ? 'Resend sin configurar' : null) },
    });
    break; // si Resend falla (tope diario incluido), insistir con el siguiente solo repetiría el fallo
  }
  return { candidatos: elegidos.length, enviados, fallidos, sinCorreo };
}
