import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Lo que se busca en la ayuda y no se encuentra (`ayuda_busquedas`, 90 días, anonimizado). Mismo permiso que el resto del contenido.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db.from('ayuda_busquedas').select('dia, termino, veces').order('dia', { ascending: false }).limit(5000);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ terminos: [], totalBusquedas: 0, sinTabla: true });
    return NextResponse.json({ error: 'No se han podido cargar las búsquedas.' }, { status: 500 });
  }
  const porTermino = new Map<string, { termino: string; veces: number; ultimoDia: string }>();
  let total = 0;
  for (const f of data ?? []) {
    total += f.veces as number;
    const t = porTermino.get(f.termino as string);
    if (t) t.veces += f.veces as number;
    else porTermino.set(f.termino as string, { termino: f.termino as string, veces: f.veces as number, ultimoDia: f.dia as string });
  }
  const terminos = [...porTermino.values()].sort((a, b) => b.veces - a.veces || b.ultimoDia.localeCompare(a.ultimoDia)).slice(0, 100);
  return NextResponse.json({ terminos, totalBusquedas: total });
}
