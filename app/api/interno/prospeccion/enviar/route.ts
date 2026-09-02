import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { siguienteLote, TAMANO_LOTE } from '@/lib/interno/prospeccion';

export const runtime = 'nodejs';

// Encola el siguiente lote de correos aprobados.
//
// La ruta NO envía: publica el evento y devuelve. El envío SMTP puede tardar
// segundos por correo y aquí hay un límite de tiempo del runtime — diez envíos
// en serie dentro de una API route es exactamente cómo se queda un lote a
// medias sin que nadie sepa cuáles salieron. Inngest es donde este repo pone lo
// que puede tardar, fallar y tener que reintentarse solo.
export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'marketing.send');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Se comprueba aquí y no solo en el worker: si falta el buzón, es mejor
  // decirlo al pulsar el botón que dejar diez filas marcadas FALLIDO con un
  // error de configuración que no tiene nada que ver con los destinatarios.
  if (!process.env.SPACEMAIL_USER || !process.env.SPACEMAIL_PASSWORD) {
    return NextResponse.json({
      error: 'El buzón de envío no está configurado (SPACEMAIL_USER / SPACEMAIL_PASSWORD).',
    }, { status: 503 });
  }

  const { data: aprobados, error } = await db
    .from('plataforma_prospeccion_email')
    .select('id')
    .eq('estado', 'APROBADO')
    .order('aprobado_en', { ascending: true }); // el que lleva más esperando, primero
  if (error) return NextResponse.json({ error: 'No se ha podido leer la cola.' }, { status: 500 });

  const lote = siguienteLote((aprobados ?? []).map(a => a.id as string));
  if (lote.length === 0) {
    return NextResponse.json({ error: 'No hay ningún correo aprobado pendiente de enviar.' }, { status: 400 });
  }

  await inngest.send({ name: EVENTS.PROSPECCION_ENVIAR_LOTE, data: { ids: lote } });

  await registrar(db, req, {
    actor: g.admin,
    accion: 'prospeccion.lote.enviado',
    objetivoTipo: 'plataforma_prospeccion_email',
    resumen: `Lote de ${lote.length} correos en frío encolado para envío`,
    despues: { ids: lote },
  });

  return NextResponse.json({
    ok: true,
    encolados: lote.length,
    quedan: Math.max(0, (aprobados ?? []).length - lote.length),
    tamanoLote: TAMANO_LOTE,
  });
}
