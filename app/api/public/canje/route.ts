import { NextRequest, NextResponse } from 'next/server';
import { canjearRecompensaPublica, socioAutenticado } from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';

// Canje de una recompensa desde el portal de la socia. Exige sesión real de
// socia (JWT de Supabase Auth): la identidad se deriva del token verificado, no
// del body — así nadie puede gastar los créditos de otra socia pasando su id.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    studioId?: string; catalogItemId?: string;
  } | null;

  if (!body?.studioId || !body?.catalogItemId) {
    return NextResponse.json({ error: 'Faltan datos del canje' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const r = await canjearRecompensaPublica({
      studioId: body.studioId, socioId, email: user.email, catalogItemId: body.catalogItemId,
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
    return NextResponse.json(r);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al canjear';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
