import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { interpretarRecibo } from '@/lib/notifications/recibo-dispositivo';

// El service worker (public/sw.js) llama aquí cuando MUESTRA un aviso push y
// cuando la usuaria lo PULSA. Es lo que convierte «el servicio de push lo
// aceptó» (SENT) en «el dispositivo lo mostró» (DELIVERED), y permite contestar
// «esta notificación no le llegó a esta alumna, ¿por qué?».
//
// Sin sesión A PROPÓSITO: un service worker no tiene el token de la usuaria. Lo
// que autoriza es conocer el id de la notificación (`not-<uuid>`, 122 bits), que
// solo viaja en el payload cifrado del push a su propio dispositivo. Lo único que
// se puede hacer con él es marcar ESA entrega como recibida / esa notificación
// como leída — nunca leer nada. Responde 204 igual exista o no, para no dar
// pistas sobre qué ids existen.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limitada = await enforceRateLimit(req, 'notif-receipt', { max: 120, windowSeconds: 60 });
  if (limitada) return limitada as NextResponse;

  const recibo = interpretarRecibo(await req.json().catch(() => null));
  if (!recibo) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return new NextResponse(null, { status: 204 });

  const ahora = new Date().toISOString();
  // Solo pasa de SENT a DELIVERED: nunca pisa un FAILED/SKIPPED ni repite.
  await admin.from('notification_delivery')
    .update({ status: 'DELIVERED', delivered_at: ahora })
    .eq('notification_id', recibo.nid).eq('channel', 'PUSH').eq('status', 'SENT');
  // Pulsarlo es haberlo visto: se marca leído (solo si no lo estaba ya).
  if (recibo.evento === 'click') {
    await admin.from('notification').update({ read_at: ahora }).eq('id', recibo.nid).is('read_at', null);
  }
  return new NextResponse(null, { status: 204 });
}
