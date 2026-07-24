import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarEmailAlumnaClaseCubierta, enviarEmailAlumnaClaseCancelada, enviarEmailAlumnaClaseReprogramada } from './email';

// Avisa a las alumnas apuntadas a una clase — SOLO si el estudio lo tiene
// activado (studios.avisar_alumnas). Regla del producto: la propietaria SIEMPRE
// se entera antes o a la vez; por eso esto se llama DESPUÉS de confirmar/cancelar.
// Reutiliza la función alumnas_apuntadas (0037) → contactos reales del sistema
// de reservas existente. Degrada limpio si Resend no está configurado.

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha} · ${hora}`;
}

export async function avisarAlumnas(
  admin: SupabaseClient,
  // 'reprogramada': la clase se salva moviéndola — `cuandoAntes` es el horario
  // ORIGINAL ya formateado (la sesión, en ese momento, ya tiene el nuevo).
  params: { sesionId: string; studioId: string; tipo: 'cubierta' | 'cancelada' | 'reprogramada'; sustituta?: string; cuandoAntes?: string },
): Promise<{ avisadas: number; total: number; skipped: boolean; desactivado: boolean }> {
  const { data: estudio } = await admin
    .from('studios').select('nombre, slug, avisar_alumnas, color_primario, logo_url').eq('id', params.studioId).maybeSingle();
  if (!estudio?.avisar_alumnas) return { avisadas: 0, total: 0, skipped: false, desactivado: true };

  const { data: ses } = await admin
    .from('sesiones').select('inicio, tipo_clase_id').eq('id', params.sesionId).maybeSingle();
  const { data: tc } = await admin
    .from('tipos_clase').select('nombre').eq('id', ses?.tipo_clase_id ?? '').maybeSingle();
  const claseNombre = tc?.nombre ?? 'Clase';
  const cuando = ses?.inicio ? cuandoTexto(ses.inicio) : '';
  const estudioNombre = estudio.nombre ?? 'Tu estudio';

  // Notification Engine: la clase cancelada también llega al centro de la socia
  // (in-app/push), además del email. Respeta el toggle avisar_alumnas (ya filtrado
  // arriba). El motor resuelve las socias apuntadas de la sesión.
  if (params.tipo === 'cancelada') {
    const { publish } = await import('@/lib/notifications/engine');
    const { EVENTOS } = await import('@/lib/notifications/catalog');
    await publish({
      type: EVENTOS.CLASE_CANCELADA, studioId: params.studioId,
      data: { clase: claseNombre, cuando, slug: (estudio.slug as string | null) ?? '' },
      resource: { type: 'sesion', id: params.sesionId },
      dedupKey: `clase-cancelada:${params.sesionId}`,
    });
  }

  const { data: alumnas } = await admin.rpc('alumnas_apuntadas', { p_sesion_id: params.sesionId });
  const lista = (alumnas ?? []) as { nombre: string; email: string | null }[];

  let avisadas = 0, skipped = false;
  for (const a of lista) {
    if (!a.email) continue;
    const marca = { colorPrimario: estudio.color_primario, logoUrl: estudio.logo_url };
    const r = params.tipo === 'cubierta'
      ? await enviarEmailAlumnaClaseCubierta({ to: a.email, toName: a.nombre, estudioNombre, ...marca, claseNombre, cuando, sustituta: params.sustituta ?? 'otra instructora' })
      : params.tipo === 'reprogramada'
        ? await enviarEmailAlumnaClaseReprogramada({ to: a.email, toName: a.nombre, estudioNombre, ...marca, claseNombre, cuando: params.cuandoAntes ?? cuando, cuandoNuevo: cuando })
        : await enviarEmailAlumnaClaseCancelada({ to: a.email, toName: a.nombre, estudioNombre, ...marca, claseNombre, cuando });
    if ('ok' in r && r.ok) avisadas++;
    if ('skipped' in r) skipped = true;
  }
  return { avisadas, total: lista.length, skipped, desactivado: false };
}
