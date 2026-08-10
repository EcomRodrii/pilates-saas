import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { firmarTokenPreviewHome } from '@/lib/theme/home-preview-token';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Emite el token de /portal-preview/[slug] (Fase 4 del editor de temas) para
// el estudio de quien pide — gateado igual que app/api/plantillas-email/preview.
//
// ⚠️ Devuelve TAMBIÉN el slug, y no es un extra: la vista previa lo necesita
// para componer la URL del iframe, y hasta ahora lo sacaba de `useStudio()` —
// o sea, no arrancaba hasta que el contexto entero del panel había resuelto.
// Medido en producción: el iframe no empezaba a pedirse hasta los 3,2 s en
// caliente y 5,9 s en frío, después de 63 peticiones a Supabase (socios,
// reservas, recibos, facturas, POS…) que la vista previa no necesita para
// nada. Aquí ya sabemos de qué estudio es la sesión; resolver su slug es una
// lectura más en una petición que ya se hacía.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data } = admin
    ? await admin.from('studios').select('slug').eq('id', sesion.studioId).maybeSingle()
    : { data: null };

  return NextResponse.json({
    token: firmarTokenPreviewHome(sesion.studioId),
    slug: (data as { slug?: string } | null)?.slug ?? null,
  });
}
