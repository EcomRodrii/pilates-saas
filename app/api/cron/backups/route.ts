import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crearSnapshot, podarBackupsAntiguos, type TipoBackup } from '@/lib/backup-engine';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ error: studiosError.message }, { status: 500 });
  }

  const resultados: { studioId: string; tipo: TipoBackup; ok: boolean; error?: string }[] = [];

  for (const studio of studios ?? []) {
    for (const tipo of tipos) {
      try {
        const snapshot = await crearSnapshot(admin, studio.id);
        const id = `bak-${Date.now()}-${uid()}`;
        const { error } = await admin.from('backups').insert({
          id, studio_id: studio.id, tipo, datos: snapshot, creado_en: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        await podarBackupsAntiguos(admin, studio.id, tipo);
        resultados.push({ studioId: studio.id, tipo, ok: true });
      } catch (err: unknown) {
        resultados.push({ studioId: studio.id, tipo, ok: false, error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
  }

  return NextResponse.json({ resultados });
}
