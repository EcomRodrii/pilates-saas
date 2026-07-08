import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicStudioData } from '@/lib/supabase-data';

// Datos para las páginas públicas (reserva/portal/kiosk) servidos con
// service-role y scopeados: catálogo público del estudio + (opcional) los
// datos de UNA socia validada por email. Sustituye el acceso anónimo directo,
// que exponía la PII de todas las socias.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    slug?: string;
    member?: { socioId?: string; email?: string };
  } | null;

  const slug = body?.slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: 'Falta el slug del estudio' }, { status: 400 });
  }

  const member = body?.member?.socioId && body?.member?.email
    ? { socioId: body.member.socioId, email: body.member.email }
    : undefined;

  try {
    const data = await fetchPublicStudioData(slug, member);
    if (!data) {
      return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al cargar los datos';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
