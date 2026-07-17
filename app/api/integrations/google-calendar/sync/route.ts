import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { getValidAccessToken, upsertEventoClase, eliminarEventoClase } from '@/lib/google-calendar';
import { dbUpdateSesion } from '@/lib/supabase-data';

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (sesiones ?? []) as unknown as SesionConRelaciones[];
  let creadas = 0, actualizadas = 0, borradas = 0, fallidas = 0;

  for (const s of filas) {
    try {
      if (s.cancelada) {
        if (s.google_event_id) {
          await eliminarEventoClase(accessToken, s.google_event_id);
          await dbUpdateSesion(s.id, { googleEventId: null });
          borradas++;
        }
        continue;
      }
      const titulo = s.tipos_clase?.nombre ?? 'Clase';
      const descripcion = [s.salas?.nombre, s.instructores?.nombre].filter(Boolean).join(' · ');
      const googleEventId = await upsertEventoClase(accessToken, {
        id: s.id, titulo, descripcion, inicio: s.inicio, fin: s.fin, googleEventId: s.google_event_id,
      });
      if (googleEventId !== s.google_event_id) {
        await dbUpdateSesion(s.id, { googleEventId });
      }
      if (s.google_event_id) actualizadas++; else creadas++;
    } catch {
      fallidas++;
    }
  }

  return NextResponse.json({ ok: true, creadas, actualizadas, borradas, fallidas, total: filas.length });
}
