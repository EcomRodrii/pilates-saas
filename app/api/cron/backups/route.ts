import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { guardarBackup, podarBackupsAntiguos, type TipoBackup } from '@/lib/engines/backup-engine';

export const dynamic = 'force-dynamic';

// P0-37: parche hasta tener la cola (P0-36). El barrido de todos los estudios
// puede pasarse del límite por defecto de Vercel; 300s (Pro) da margen mientras
// cada backup no se descompone en jobs por-tenant.
export const maxDuration = 300;

// Backup automático diario para todos los negocios — lo dispara Vercel Cron
// (ver vercel.json) contra esta ruta con el CRON_SECRET como autenticación.
// Corre en segundo plano sin bloquear nada de la app: no hay ninguna
// "ventana de mantenimiento", reservar/cobrar/check-in siguen funcionando
// normal mientras se hace la copia.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Backups no configurados: falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  const now = new Date();
  const tipos: TipoBackup[] = ['DIARIO'];
  if (now.getDay() === 1) tipos.push('SEMANAL'); // lunes
  if (now.getDate() === 1) tipos.push('MENSUAL'); // día 1 del mes

  const { data: studios, error: studiosError } = await admin.from('studios').select('id');
  if (studiosError) {
    return errorInterno('cron:backups:listar-studios', studiosError,
      'No se ha podido listar los estudios para la copia de seguridad.');
  }

  const resultados: { studioId: string; tipo: TipoBackup; ok: boolean; error?: string }[] = [];

  for (const studio of studios ?? []) {
    for (const tipo of tipos) {
      try {
        await guardarBackup(admin, { studioId: studio.id, tipo });
        await podarBackupsAntiguos(admin, studio.id, tipo);
        resultados.push({ studioId: studio.id, tipo, ok: true });
      } catch (err: unknown) {
        // El fallo de un estudio no aborta el resto (se acumula en `resultados`),
        // pero sin esto Sentry nunca lo vería: lo reportamos con contexto para no
        // quedarnos ciegos ante un backup que lleva días fallando en silencio.
        Sentry.captureException(err, { tags: { cron: 'backups', tipo }, extra: { studioId: studio.id } });
        resultados.push({ studioId: studio.id, tipo, ok: false, error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
  }

  return NextResponse.json({ resultados });
}
