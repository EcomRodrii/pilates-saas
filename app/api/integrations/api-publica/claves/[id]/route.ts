import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { exigirGestorApi } from '@/lib/api-publica/gestion';

// DELETE: revoca una clave al momento. No se borra la fila (la auditoría la
// necesita): queda con `revocada_en` y deja de autenticar en la siguiente
// petición. Idempotente: revocar una ya revocada no cambia su fecha.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-claves-delete', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const g = await exigirGestorApi(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { id } = await params;

  const { data: clave } = await g.admin.from('api_claves').select('id, revocada_en')
    .eq('id', id).eq('studio_id', g.studioId).maybeSingle();
  if (!clave) return NextResponse.json({ error: 'Clave no encontrada' }, { status: 404 });
  if (!clave.revocada_en) {
    const { error } = await g.admin.from('api_claves')
      .update({ revocada_en: new Date().toISOString(), revocada_por: g.userId })
      .eq('id', id).eq('studio_id', g.studioId).is('revocada_en', null);
    if (error) return NextResponse.json({ error: 'No se pudo revocar.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
