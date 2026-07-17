import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { guardarBackup, podarBackupsAntiguos } from '@/lib/engines/backup-engine';

// Backup manual, disparado desde el panel por cualquier miembro del equipo
// con sesión — crear una copia no es una operación destructiva, a
// diferencia de restaurarla (esa sí, ver /api/backups/restore).
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Backups no configurados: falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id, creadoEn } = await guardarBackup(admin, { studioId: sesion.studioId, tipo: 'MANUAL' });

    await podarBackupsAntiguos(admin, sesion.studioId, 'MANUAL');

    return NextResponse.json({ id, tipo: 'MANUAL', creadoEn });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
