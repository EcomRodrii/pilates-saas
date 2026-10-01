import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { SIN_ACCESO, comprobarDestino, exigirGestorWebhooks, webhookDelEstudio } from '@/lib/api-publica/webhooks/gestion';
import { validarCambiosWebhook } from '@/lib/api-publica/webhooks/gestion-reglas';

// PATCH: cambia la dirección, los avisos o la descripción, lo activa/desactiva o
// retira ya el secreto anterior. Reactivarlo empieza de cero su salud (no
// reenvía lo que se descartó: eso se hace entrega a entrega).
// DELETE: lo da de baja. La fila se queda (quién lo creó, a qué URL apuntaba,
// quién lo borró) como rastro, igual que una clave revocada; deja de verse y de
// mandar nada.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-webhooks-patch', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { g } = r;
  const { id } = await params;
  const w = await webhookDelEstudio(g.admin, g.studioId, id);
  if (!w) return NextResponse.json({ error: 'Webhook no encontrado' }, { status: 404 });

  const v = validarCambiosWebhook(await req.json().catch(() => null), g.tipos);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const c = v.valor;
  if (c.url) {
    const destino = await comprobarDestino(c.url);
    if (!destino.ok) return NextResponse.json({ error: destino.error }, { status: 400 });
  }
  if (c.activo === true && !g.activada) {
    return NextResponse.json({ error: 'La API no está activada para tu estudio.' }, { status: 403 });
  }
  if (c.activo === true && !g.conAcceso) return NextResponse.json({ error: SIN_ACCESO }, { status: 403 });

  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = { actualizado_en: ahora, actualizado_por: g.userId };
  if (c.url !== undefined) cambios.url = c.url;
  if (c.tipos !== undefined) cambios.tipos = c.tipos;
  if (c.descripcion !== undefined) cambios.descripcion = c.descripcion;
  if (c.activo === true) Object.assign(cambios, { desactivado_en: null, desactivado_por: null, desactivado_motivo: null, fallando_desde: null });
  if (c.activo === false && !w.desactivado_en) Object.assign(cambios, { desactivado_en: ahora, desactivado_por: g.userId, desactivado_motivo: 'manual' });
  if (c.retirarSecretoAnterior) Object.assign(cambios, { secreto_anterior_cifrado: null, secreto_anterior_expira_en: null });
  const { error } = await g.admin.from('api_webhooks').update(cambios).eq('id', id).eq('studio_id', g.studioId).is('borrado_en', null);
  if (error) return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });
  if (c.activo === false) {
    // Lo que quedaba por mandar ya no se manda.
    await g.admin.from('api_webhook_entregas').update({ estado: 'DESCARTADA', ultimo_error: 'El webhook se ha desactivado.' })
      .eq('webhook_id', id).eq('studio_id', g.studioId).eq('estado', 'PENDIENTE');
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-webhooks-delete', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { id } = await params;
  const w = await webhookDelEstudio(r.g.admin, r.g.studioId, id);
  if (!w) return NextResponse.json({ error: 'Webhook no encontrado' }, { status: 404 });
  const ahora = new Date().toISOString();
  const { error } = await r.g.admin.from('api_webhooks').update({
    borrado_en: ahora, borrado_por: r.g.userId,
    ...(w.desactivado_en ? {} : { desactivado_en: ahora, desactivado_por: r.g.userId, desactivado_motivo: 'borrado' }),
  }).eq('id', id).eq('studio_id', r.g.studioId).is('borrado_en', null);
  if (error) return NextResponse.json({ error: 'No se pudo borrar.' }, { status: 500 });
  await r.g.admin.from('api_webhook_entregas').update({ estado: 'DESCARTADA', ultimo_error: 'El webhook se ha borrado.' })
    .eq('webhook_id', id).eq('studio_id', r.g.studioId).eq('estado', 'PENDIENTE');
  return NextResponse.json({ ok: true });
}
