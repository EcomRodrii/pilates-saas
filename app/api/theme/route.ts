import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getThemePublicado } from '@/lib/theme-data';

// Tema PUBLICADO del estudio del staff autenticado. Lo usa el panel para pintar
// la marca del estudio (--brand*). El modo claro/oscuro sigue siendo preferencia
// por-usuario (localStorage), no viene de aquí.
// (Fase 3 añadirá aquí PUT para guardar borrador y POST para publicar.)
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const theme = await getThemePublicado(sesion.studioId);
  return NextResponse.json(theme);
}
