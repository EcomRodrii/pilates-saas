import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarEmailAlumnaClaseCubierta, enviarEmailAlumnaClaseCancelada } from './email';

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
  params: { sesionId: string; studioId: string; tipo: 'cubierta' | 'cancelada'; sustituta?: string },
): Promise<{ avisadas: number; total: number; skipped: boolean; desactivado: boolean }> {
  const { data: estudio } = await admin
    .from('studios').select('nombre, avisar_alumnas, color_primario, logo_url').eq('id', params.studioId).maybeSingle();
  if (!estudio?.avisar_alumnas) return { avisadas: 0, total: 0, skipped: false, desactivado: true };

  const { data: ses } = await admin
    .from('sesiones').select('inicio, tipo_clase_id').eq('id', params.sesionId).maybeSingle();
  const { data: tc } = await admin
    .from('tipos_clase').select('nombre').eq('id', ses?.tipo_clase_id ?? '').maybeSingle();
  const claseNombre = tc?.nombre ?? 'Clase';
  const cuando = ses?.inicio ? cuandoTexto(ses.inicio) : '';
  const estudioNombre = estudio.nombre ?? 'Tu estudio';

  const { data: alumnas } = await admin.rpc('alumnas_apuntadas', { p_sesion_id: params.sesionId });
  const lista = (alumnas ?? []) as { nombre: string; email: string | null }[];

  let avisadas = 0, skipped = false;
  for (const a of lista) {
    if (!a.email) continue;
    const marca = { colorPrimario: estudio.color_primario, logoUrl: estudio.logo_url };
    const r = params.tipo === 'cubierta'
      ? await enviarEmailAlumnaClaseCubierta({ to: a.email, toName: a.nombre, estudioNombre, ...marca, claseNombre, cuando, sustituta: params.sustituta ?? 'otra instructora' })
      : await enviarEmailAlumnaClaseCancelada({ to: a.email, toName: a.nombre, estudioNombre, ...marca, claseNombre, cuando });
    if ('ok' in r && r.ok) avisadas++;
    if ('skipped' in r) skipped = true;
  }
  return { avisadas, total: lista.length, skipped, desactivado: false };
}
