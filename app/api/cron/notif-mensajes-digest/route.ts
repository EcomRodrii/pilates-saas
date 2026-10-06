import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { barrerDigestMensajesNoLeidos } from '@/lib/mensajeria/digest';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  avisoParaSentry, DEFINICIONES, ID_DENUNCIAS_ESPERANDO_A_TENTARE, ID_DENUNCIAS_SIN_REVISAR_48H,
} from '@/lib/salud/comprobaciones';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Community & Messaging OS (P0): digest de baja frecuencia de mensajes sin
// leer (nunca un email por mensaje — ver lib/notifications/catalog.ts,
// EVENTOS.MENSAJE_DIGEST_NO_LEIDO). Disparado por pg_cron cada 3 horas,
// autenticado con SUPABASE_CRON_SECRET (Vault) — mismo patrón que
// notif-inactivas/notif-entregas-pendientes.
//
// De paso (sin cron nuevo), la alarma de moderación: las denuncias de la app
// que ya le tocan a Tentare y las que llevan 48 h sin decidir (App Store 1.2).
// Nadie sondea /api/health/flujos, así que si no se cuentan aquí no avisan a
// nadie. A Sentry solo va el número, nunca filas ni ids.
const VIGILADAS = [ID_DENUNCIAS_ESPERANDO_A_TENTARE, ID_DENUNCIAS_SIN_REVISAR_48H];

async function vigilarDenuncias() {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  for (const id of VIGILADAS) {
    try {
      const def = DEFINICIONES.find((d) => d.id === id);
      if (!def) continue;
      const aviso = avisoParaSentry(def, await def.contar(admin, new Date()));
      if (aviso) {
        Sentry.captureMessage(aviso.mensaje, { level: aviso.nivel, tags: { area: 'moderacion', tipo: 'salud' }, extra: aviso.extra });
      }
    } catch (e) {
      console.error('[moderación] vigilancia', id, e instanceof Error ? e.message : e);
    }
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await barrerDigestMensajesNoLeidos();
    await vigilarDenuncias();
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...resumen });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'notif-mensajes-digest' } });
    return errorInterno('cron/notif-mensajes-digest:POST', err, 'Error avisando de mensajes sin leer.');
  }
}
