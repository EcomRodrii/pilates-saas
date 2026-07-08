import { NextRequest, NextResponse } from 'next/server';
import { resolverLoginSocia } from '@/lib/supabase-data';

// Login del portal de socias: resuelve email → socia con service-role.
// Sustituye la lectura anónima directa sobre la tabla socios.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { slug?: string; email?: string } | null;
  if (!body?.slug || !body?.email) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }
  try {
    const socia = await resolverLoginSocia(body.slug, body.email);
    if (!socia) return NextResponse.json({ error: 'Email no encontrado' }, { status: 404 });
    return NextResponse.json(socia);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al iniciar sesión';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
