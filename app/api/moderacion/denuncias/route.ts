import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { listarDenunciasDelEstudio } from '@/lib/moderacion/denuncias-servidor';

// Las denuncias de la app que esperan al estudio (App Store 1.2). Las ve quien
// revisa cada ámbito (`puedeRevisarDenuncia`): el chat con una instructora, solo
// la propietaria (es la única que lee esos hilos); el tablón, quien lo modera.
// Las que van contra el propio estudio no salen aquí: las revisa Tentare.
//
// Con service-role: el filtro de estudio y de rol lo hace
// `listarDenunciasDelEstudio`, y el contenido denunciado viaja solo a quien lo
// tiene que revisar.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const denuncias = await listarDenunciasDelEstudio(admin, sesion.studioId, sesion.rol, sesion.userId);
    return NextResponse.json({ denuncias }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorInterno('moderacion/denuncias:GET', e, 'No se han podido cargar las denuncias.');
  }
}
