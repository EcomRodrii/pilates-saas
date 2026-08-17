import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { getValidAccessToken, upsertEventoClase, eliminarEventoClase } from '@/lib/google-calendar';
import type { SupabaseClient } from '@supabase/supabase-js';

// Guardar el id del evento de Google en la sesión. Antes esto llamaba a
// `dbUpdateSesion` (lib/supabase-data.ts), que escribe con el cliente ANON de
// navegador: en una ruta de servidor no hay sesión que ese cliente pueda usar,
// así que el rol efectivo era `anon` y la única política de UPDATE de
// `sesiones` es para `authenticated`
// (`studio_id = current_studio_id() AND puede_gestionar_calendario()`).
// Postgres no da error en un UPDATE que RLS deja sin filas: devuelve éxito con
// 0 filas afectadas. Resultado medido en producción: 148 sesiones, 0 con
// `google_event_id`. Cada "Sincronizar ahora" volvía a crear TODOS los eventos
// de las próximas 4 semanas en el calendario de la propietaria (duplicados
// acumulándose a cada pulsación), las clases canceladas nunca se borraban de
// Google, y la respuesta contaba las duplicadas como `creadas` con `ok: true`.
// Aquí se escribe con el cliente service-role que la ruta ya tiene, y se
// comprueba de verdad que la fila se actualizó.
async function guardarEventoId(
  admin: SupabaseClient, studioId: string, sesionId: string, googleEventId: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from('sesiones')
    .update({ google_event_id: googleEventId })
    .eq('id', sesionId)
    .eq('studio_id', studioId)
    .select('id');
  if (error) {
    console.error('[google-calendar:sync] no se pudo guardar google_event_id', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

interface SesionConRelaciones {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean | null;
  google_event_id: string | null;
  tipos_clase: { nombre: string } | null;
  salas: { nombre: string } | null;
  instructores: { nombre: string } | null;
}

// Sincronización manual ("Sincronizar ahora" en Configuración → Integraciones):
// empuja las próximas 4 semanas de clases al Google Calendar del estudio
// conectado (una llamada real a la API de Google, no una simulación), y
// borra del calendario las que se hayan cancelado desde la última vez.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const accessToken = await getValidAccessToken(sesion.studioId);
  if (!accessToken) {
    return NextResponse.json({ error: 'Este estudio no tiene Google Calendar conectado' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Supabase admin no configurado' }, { status: 503 });

  const desde = new Date().toISOString();
  const hasta = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sesiones, error } = await admin
    .from('sesiones')
    .select('id, inicio, fin, cancelada, google_event_id, tipos_clase(nombre), salas(nombre), instructores(nombre)')
    .eq('studio_id', sesion.studioId)
    .gte('inicio', desde)
    .lte('inicio', hasta);

  if (error) return errorInterno('google-calendar:sync', error,
    'No se ha podido sincronizar con Google Calendar. Vuelve a conectar la cuenta desde Configuración → Integraciones.');

  const filas = (sesiones ?? []) as unknown as SesionConRelaciones[];
  let creadas = 0, actualizadas = 0, borradas = 0, fallidas = 0;

  for (const s of filas) {
    try {
      if (s.cancelada) {
        if (s.google_event_id) {
          await eliminarEventoClase(accessToken, s.google_event_id);
          // Si el borrado en Google fue bien pero no podemos olvidar el id, no
          // se cuenta como borrada: al próximo sync se reintentaría, que es lo
          // correcto, en vez de dar por hecho que quedó limpio.
          if (await guardarEventoId(admin, sesion.studioId, s.id, null)) borradas++;
          else fallidas++;
        }
        continue;
      }
      const titulo = s.tipos_clase?.nombre ?? 'Clase';
      const descripcion = [s.salas?.nombre, s.instructores?.nombre].filter(Boolean).join(' · ');
      const googleEventId = await upsertEventoClase(accessToken, {
        id: s.id, titulo, descripcion, inicio: s.inicio, fin: s.fin, googleEventId: s.google_event_id,
      });
      if (googleEventId !== s.google_event_id) {
        // Un evento creado en Google cuyo id no se guarda es un duplicado
        // garantizado en la siguiente pasada: cuenta como fallo, no como éxito.
        if (!await guardarEventoId(admin, sesion.studioId, s.id, googleEventId)) {
          fallidas++;
          continue;
        }
      }
      if (s.google_event_id) actualizadas++; else creadas++;
    } catch {
      fallidas++;
    }
  }

  return NextResponse.json({ ok: true, creadas, actualizadas, borradas, fallidas, total: filas.length });
}
