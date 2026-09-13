import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { estadoConsentimientoSalud } from '@/lib/datos-salud/consentimiento';

// Estado del consentimiento de salud de la PROPIA alumna, para su perfil.
// El `socioId` sale del JWT cruzado con el estudio (`socioAutenticado`), nunca
// de la petición. Solo devuelve el estado y la fecha: nada de salud.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-consentimiento-salud-leer', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const studioId = req.nextUrl.searchParams.get('studioId') ?? '';
  if (!studioId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 });
  try {
    const { data, error } = await admin.from('socios')
      .select('consentimiento_salud_fecha, consentimiento_salud_revocado_en')
      .eq('id', socioId).eq('studio_id', studioId).maybeSingle();
    if (error) throw error;
    const estado = estadoConsentimientoSalud({
      fecha: data?.consentimiento_salud_fecha as string | null,
      revocadoEn: data?.consentimiento_salud_revocado_en as string | null,
    });
    return NextResponse.json({
      estado,
      fecha: (data?.consentimiento_salud_fecha as string | null) ?? null,
      revocadoEn: (data?.consentimiento_salud_revocado_en as string | null) ?? null,
    });
  } catch (e) {
    return errorInterno('public/consentimiento-salud:GET', e, 'No hemos podido cargar tu consentimiento.');
  }
}
