import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { entregarExternos } from '@/lib/notifications/process';

// Entrega de canales EXTERNOS (push/email/WhatsApp/SMS) de notificaciones ya
// creadas. Es el sustituto de la cola de Inngest: engine.publish() escribe la
// in-app y llama aquí. Ruta interna (nunca la abre un navegador), autenticada
// con CRON_SECRET, y aislada en su propio módulo porque process.ts arrastra
// web-push → módulos de Node que no pueden llegar al bundle de cliente.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  if (req.headers.get('x-notif-secret') !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { notificationIds?: unknown } | null;
  const ids = Array.isArray(body?.notificationIds)
    ? body.notificationIds.filter((x): x is string => typeof x === 'string')
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, entregas: 0 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const r = await entregarExternos(admin, ids);
  return NextResponse.json({ ok: true, ...r });
}
