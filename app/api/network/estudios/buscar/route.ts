import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

// Buscador de estudios Tentare — solo para que una profesional elija a
// quién pedir la verificación de una experiencia (Fase 7). Nombre + ciudad
// únicamente: mismo nivel de exposición que ya tiene cualquier estudio en su
// propia página pública de reservas — no es un dato nuevo que se filtre.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ estudios: [] });

  const { data, error } = await admin
    .from('studios')
    .select('id, nombre, ciudad')
    .ilike('nombre', `%${q}%`)
    .order('nombre', { ascending: true })
    .limit(10);
  if (error) return errorInterno('network:estudios:buscar', error, 'No se han podido buscar estudios.');

  return NextResponse.json({
    estudios: (data ?? []).map(e => ({ id: e.id as string, nombre: e.nombre as string, ciudad: e.ciudad as string | null })),
  });
}
