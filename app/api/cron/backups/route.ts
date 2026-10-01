import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { ejecutarCopiaDiariaDeTodos } from '@/lib/backups/ejecutar-copia-diaria';
import { errorInterno } from '@/lib/errores-servidor';
import { cifrarConfigsIntegracionPendientes, cifrarCredencialesPendientes } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { recifrarSecretosWebhooks } from '@/lib/api-publica/webhooks/trabajador';

export const dynamic = 'force-dynamic';
// Recorre todos los estudios en una sola invocación (fan-out colapsado) —
// margen amplio, mismo criterio que app/api/cron/materializar-plazas.
export const maxDuration = 300;

// Piloto (2026-08-11): reemplaza lib/inngest/backups.ts (dispatcher+estudio).
// Disparado por Postgres (pg_cron + pg_net, ver migración), diario a las
// 03:00 UTC. Autenticado con SUPABASE_CRON_SECRET (Vault).
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const resumen = await ejecutarCopiaDiariaDeTodos();
    // ⚠️ Con `fallidos > 0` esto devolvía 200. Es el ÚNICO cron sin red —corre
    // una vez al día y no reintenta—, así que un estudio podía encadenar noches
    // sin copia sin que nada lo dijera: pasó de verdad (studio-1, sin backup
    // diario desde el 2026-09-09).
    //
    // ⚠️⚠️ Y el 5xx NO es la alarma. Aquí decía «deja rastro en pg_net y en
    // cualquier monitor de la ruta»; medido el 14-sep, eso es falso:
    // `cron.job_run_details` marcó «succeeded» las 2.184 ejecuciones de 48 h
    // —pg_cron solo encola con `net.http_post`, que es asíncrono— y
    // `net._http_response` se autopurga en ~6 h y no la lee nadie. Las cinco
    // noches sin copia de studio-1 las descubrió Sentry, no esto. Así que la
    // señal se emite explícitamente.
    if (resumen.fallidos > 0) {
      Sentry.captureMessage('[backups] estudios sin copia de seguridad esta noche', {
        level: 'error',
        tags: { cron: 'backups', tipo: 'copia-fallida' },
        extra: { ...resumen, queHacer: 'Un estudio sin copia diaria no es recuperable a esa fecha: mirar por qué falló ANTES de la noche siguiente.' },
      });
    }
    // De paso, el mantenimiento nocturno: cifrar los tokens y las claves de
    // integraciones que queden en claro (lib/integraciones/cifrado-credenciales.ts
    // y config-cifrada.ts). Aparte de la
    // copia: si falla, la copia sigue contando como hecha.
    let credenciales: Awaited<ReturnType<typeof cifrarCredencialesPendientes>> | null = null;
    let configs: Awaited<ReturnType<typeof cifrarConfigsIntegracionPendientes>> | null = null;
    let webhooks: Awaited<ReturnType<typeof recifrarSecretosWebhooks>> | null = null;
    try {
      credenciales = await cifrarCredencialesPendientes();
      configs = await cifrarConfigsIntegracionPendientes();
      // Los secretos de firma de los webhooks de la API (ya nacen cifrados: aquí
      // solo se pasan de la clave anterior a la actual tras rotarla).
      const admin = getSupabaseAdmin();
      if (admin) webhooks = await recifrarSecretosWebhooks(admin);
      if (credenciales.fallidas > 0 || configs.fallidas > 0 || (webhooks?.fallidos ?? 0) > 0) {
        Sentry.captureMessage('[backups] tokens de integraciones que no se pudieron cifrar', {
          level: 'warning', tags: { cron: 'backups', tipo: 'credenciales' }, extra: { credenciales, configs, webhooks },
        });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { cron: 'backups', tipo: 'credenciales' } });
    }
    return NextResponse.json(
      { ejecutadoEn: new Date().toISOString(), ...resumen, credenciales, configs, webhooks },
      resumen.fallidos > 0 ? { status: 500 } : undefined,
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'backups' } });
    return errorInterno('cron/backups:POST', err, 'Error ejecutando la copia de seguridad diaria.');
  }
}
