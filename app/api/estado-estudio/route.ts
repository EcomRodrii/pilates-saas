import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { construirEstadoEstudio } from '@/lib/estado-estudio';
import { contarConteosEstudio } from '@/lib/estado-estudio-servidor';

// GET /api/estado-estudio — la bandeja única de la home (lib/estado-estudio.ts).
// Los recuentos, su gate por rol y por qué van con service-role viven en
// lib/estado-estudio-servidor.ts: los comparte con el asistente.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const conteos = await contarConteosEstudio(requireSupabaseAdmin(), {
    studioId: sesion.studioId, rol: sesion.rol, userId: sesion.userId, ahora: new Date(),
  });
  return NextResponse.json(construirEstadoEstudio(conteos));
}
