import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { tablaReferencias } from '@/lib/asistente/referencias';
import { asistenteEncendido, nombresDeReferencias, type SesionAsistente } from '@/lib/asistente/servidor';

// GET /api/asistente/conversaciones — la lista de la columna izquierda del chat:
// las conversaciones de ESTA persona en ESTE estudio, la más reciente primero.
// El título es la primera pregunta tal como se guardó (seudonimizada, con
// `[ALUMNA_3]`); aquí se resuelve a nombres para el navegador, que es el único
// sitio donde viajan los nombres. Nunca se guardan.

const MAX = 50;
const MARCA = /\[((?:ALUMNA|EQUIPO)_\d+)\]/g;

type Fila = { id: string; titulo: string | null; referencias: unknown; ultima_en: string };

export async function GET(req: NextRequest) {
  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeUsarAsistente(sesionStaff.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  if (!asistenteEncendido(sesionStaff.studioId)) return NextResponse.json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, { status: 404 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion: SesionAsistente = { studioId: sesionStaff.studioId, userId: sesionStaff.userId, rol: sesionStaff.rol };

  const { data, error } = await admin.from('asistente_conversaciones').select('id, titulo, referencias, ultima_en')
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId)
    .order('ultima_en', { ascending: false }).limit(MAX);
  if (error) return NextResponse.json({ error: 'No disponible ahora' }, { status: 503 });

  const conversaciones = await Promise.all(((data ?? []) as Fila[]).map(async c => {
    const titulo = (c.titulo ?? '').trim();
    const usadas = [...new Set([...titulo.matchAll(MARCA)].map(m => m[1]))];
    if (!usadas.length) return { id: c.id, titulo: titulo || 'Conversación', ultimaEn: c.ultima_en };
    const nombres = await nombresDeReferencias(admin, sesion, tablaReferencias(c.referencias), usadas);
    return {
      id: c.id,
      titulo: titulo.replace(MARCA, (m, ref: string) => nombres[ref]?.nombre ?? m),
      ultimaEn: c.ultima_en,
    };
  }));
  return NextResponse.json({ conversaciones }, { headers: { 'Cache-Control': 'no-store' } });
}
