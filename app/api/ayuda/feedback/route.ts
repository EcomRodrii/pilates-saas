import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { articuloDe } from '@/lib/ayuda/registro';

// "¿Te ha ayudado este artículo?" al pie de cada página de /ayuda. Anónimo y
// público (cualquier visitante, sin sesión), así que no puede usar el patrón de
// `dbInsertSoporteSolicitud` (RLS atada a studio_id): va por API con service
// role, igual que /api/soporte. Ver supabase/migrations/20260828120000_ayuda_feedback.sql.
const VALORACIONES = new Set(['MALO', 'REGULAR', 'BUENO']);

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'ayuda-feedback', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { categoria?: string; articulo?: string; valoracion?: string; url?: string }
    | null;

  const categoria = typeof body?.categoria === 'string' ? body.categoria.trim() : '';
  const articulo = typeof body?.articulo === 'string' ? body.articulo.trim() : '';
  const valoracion = typeof body?.valoracion === 'string' ? body.valoracion.trim() : '';
  const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 300) : '';

  if (!VALORACIONES.has(valoracion)) {
    return NextResponse.json({ error: 'Valoración no válida' }, { status: 400 });
  }
  // No se acepta feedback de un artículo que no existe en el registro — evita
  // basura en la tabla desde peticiones fabricadas a mano.
  if (!articuloDe(categoria, articulo)) {
    return NextResponse.json({ error: 'Artículo no reconocido' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: true, skipped: true });

  const { error } = await db.from('ayuda_feedback').insert({
    categoria_slug: categoria, articulo_slug: articulo, valoracion, url,
  });
  if (error) {
    console.error('[ayuda/feedback]', error);
    return NextResponse.json({ error: 'No se ha podido guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
