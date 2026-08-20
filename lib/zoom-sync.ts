// Cron de sincronización de reuniones de Zoom (lib/inngest o pg_cron según se
// cablee) — análogo a app/api/integrations/google-calendar/sync/route.ts pero
// automático, no un botón manual: el enlace de Zoom tiene que existir ANTES
// de que empiece la clase, así que depender de que alguien pulse
// "Sincronizar" es un fallo silencioso esperando a pasar.
//
// Por cada estudio con Zoom conectado: crea la reunión de las próximas
// sesiones online sin zoom_meeting_id, actualiza la hora de las que ya la
// tienen (reprogramaciones — nunca crea una reunión nueva), y borra la de las
// canceladas. Nunca bloquea el resto del barrido por un fallo puntual (mismo
// patrón fallidas++/continue que google-calendar/sync).
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken, crearReunionZoom, actualizarReunionZoom, eliminarReunionZoom } from '@/lib/zoom';

const VENTANA_DIAS = 14;

interface SesionZoomSync {
  id: string;
  studio_id: string;
  inicio: string;
  duracion_minutos: number;
  cancelada: boolean;
  zoom_meeting_id: number | null;
  tipos_clase: { nombre: string } | null;
}

async function guardarReunion(
  admin: SupabaseClient, sesionId: string, meetingId: number | null, joinUrl: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from('sesiones')
    .update({ zoom_meeting_id: meetingId, zoom_join_url: joinUrl })
    .eq('id', sesionId)
    .select('id');
  if (error) { console.error('[zoom-sync] no se pudo guardar zoom_meeting_id', error); return false; }
  return (data?.length ?? 0) > 0;
}

export async function sincronizarReunionesZoom(admin: SupabaseClient) {
  const desde = new Date().toISOString();
  const hasta = new Date(Date.now() + VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: estudios, error: errEstudios } = await admin
    .from('studios')
    .select('id, zoom_email')
    .not('zoom_email', 'is', null);
  if (errEstudios) { console.error('[zoom-sync] no se pudo listar estudios con Zoom', errEstudios); return { creadas: 0, actualizadas: 0, borradas: 0, fallidas: 0, sinToken: 0 }; }

  let creadas = 0, actualizadas = 0, borradas = 0, fallidas = 0, sinToken = 0;

  for (const estudio of estudios ?? []) {
    const accessToken = await getValidAccessToken(estudio.id);
    if (!accessToken) {
      sinToken++;
      Sentry.captureMessage('[zoom-sync] estudio con Zoom marcado pero sin token válido', {
        level: 'warning', extra: { studioId: estudio.id },
      });
      continue;
    }

    const { data: sesiones, error: errSesiones } = await admin
      .from('sesiones')
      .select('id, studio_id, inicio, cancelada, zoom_meeting_id, tipos_clase!inner(nombre, duracion_minutos, es_online)')
      .eq('studio_id', estudio.id)
      .eq('tipos_clase.es_online', true)
      .gte('inicio', desde)
      .lte('inicio', hasta);
    if (errSesiones) { console.error('[zoom-sync] no se pudo listar sesiones online', errSesiones); fallidas++; continue; }

    for (const fila of (sesiones ?? []) as unknown as (SesionZoomSync & { tipos_clase: { nombre: string; duracion_minutos: number } | null })[]) {
      try {
        if (fila.cancelada) {
          if (fila.zoom_meeting_id) {
            const r = await eliminarReunionZoom(accessToken, fila.zoom_meeting_id);
            if (r.ok && await guardarReunion(admin, fila.id, null, null)) borradas++;
            else fallidas++;
          }
          continue;
        }
        const tema = fila.tipos_clase?.nombre ?? 'Clase online';
        const duracion = fila.tipos_clase?.duracion_minutos ?? 60;

        if (!fila.zoom_meeting_id) {
          const r = await crearReunionZoom(accessToken, tema, fila.inicio, duracion);
          if (r.ok && await guardarReunion(admin, fila.id, r.id, r.joinUrl)) creadas++;
          else fallidas++;
        } else {
          const r = await actualizarReunionZoom(accessToken, fila.zoom_meeting_id, fila.inicio, duracion);
          if (r.ok) actualizadas++;
          else fallidas++;
        }
      } catch (e) {
        console.error('[zoom-sync] fallo en sesión', fila.id, e);
        fallidas++;
      }
    }
  }

  return { creadas, actualizadas, borradas, fallidas, sinToken };
}
