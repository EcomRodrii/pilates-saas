import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { SIN_ACCESO, exigirGestorWebhooks } from '@/lib/api-publica/webhooks/gestion';

// POST: vuelve a poner en cola una entrega (fallida, descartada o ya entregada,
// si el programa la perdió), con los intentos a cero. Manda el evento tal y como quedó guardado (mismo id: el
// destino puede reconocerlo y no duplicarlo). Solo si su webhook está activo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-webhooks-reenviar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { g } = r;
  if (!g.activada) return NextResponse.json({ error: 'La API no está activada para tu estudio.' }, { status: 403 });
  if (!g.conAcceso) return NextResponse.json({ error: SIN_ACCESO }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9A-Za-z_-]{1,80}$/.test(id)) return NextResponse.json({ error: 'Entrega no encontrada' }, { status: 404 });

  const { data: e } = await g.admin.from('api_webhook_entregas')
    .select('id, estado, webhook_id, api_webhooks(desactivado_en, borrado_en)')
    .eq('id', id).eq('studio_id', g.studioId).maybeSingle();
  if (!e) return NextResponse.json({ error: 'Entrega no encontrada' }, { status: 404 });
  const w = (Array.isArray(e.api_webhooks) ? e.api_webhooks[0] : e.api_webhooks) as { desactivado_en: string | null; borrado_en: string | null } | null;
  if (!w || w.borrado_en) return NextResponse.json({ error: 'Entrega no encontrada' }, { status: 404 });
  if (w.desactivado_en) return NextResponse.json({ error: 'Activa el webhook antes de reenviar.' }, { status: 409 });
  if (e.estado === 'PENDIENTE') return NextResponse.json({ error: 'Ya está en cola.' }, { status: 409 });
  const { error } = await g.admin.from('api_webhook_entregas')
    .update({ estado: 'PENDIENTE', intentos: 0, proximo_intento_en: new Date().toISOString(), ultimo_error: null })
    .eq('id', id).eq('studio_id', g.studioId).in('estado', ['FALLIDA', 'DESCARTADA', 'ENTREGADA']);
  if (error) return NextResponse.json({ error: 'No se pudo poner en cola.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
