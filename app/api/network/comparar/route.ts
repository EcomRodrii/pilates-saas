import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { obtenerPerfilPublicoPorId, type DetallePerfilPublico } from '@/lib/network/publico';

// Comparación de 2-3 perfiles a la vez, tercera pieza de F2 — mismo guard de
// sesión de staff que app/api/network/buscar y app/api/network/perfil/[id]
// (panel de un estudio, nunca el marketplace público). Reutiliza
// obtenerPerfilPublicoPorId TAL CUAL, la misma función que ya usa el detalle
// individual: nunca se leen columnas nuevas ni se cambia su forma, así que
// pedir varios ids a la vez no puede filtrar más datos de los que el detalle
// de UNO solo ya expone (nunca contacto/auth_user_id/datos internos).
const MAX_PERFILES_COMPARAR = 3;

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Nunca confiar en que el cliente respetó el tope de 3 — se recorta aquí
  // también, sin devolver error por exceso (mismo criterio permisivo que
  // filtroDesdeSearchParams: se ignora lo que sobra en vez de rechazar toda
  // la petición).
  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, MAX_PERFILES_COMPARAR);

  if (ids.length === 0) return NextResponse.json({ perfiles: [] });

  const resultados = await Promise.all(ids.map(id => obtenerPerfilPublicoPorId(admin, id)));

  for (const r of resultados) {
    if (r && 'error' in r) return errorInterno('network:comparar', r.error, 'No se han podido cargar los perfiles a comparar.');
  }

  // Perfil no encontrado/no publicado → se omite en vez de romper toda la
  // comparación (mismo criterio 404-silencioso que obtenerPerfilPublicoPorId
  // usa para un único perfil: nunca confirma qué ids existen y cuáles no).
  const perfiles = resultados.filter((r): r is DetallePerfilPublico => r !== null);

  return NextResponse.json({ perfiles });
}
