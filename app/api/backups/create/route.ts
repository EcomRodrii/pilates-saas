import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crearSnapshot, podarBackupsAntiguos } from '@/lib/backup-engine';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

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
    const snapshot = await crearSnapshot(admin, sesion.studioId);
    const id = `bak-${Date.now()}-${uid()}`;
    const creadoEn = new Date().toISOString();
    const { error } = await admin.from('backups').insert({
      id, studio_id: sesion.studioId, tipo: 'MANUAL', datos: snapshot, creado_en: creadoEn,
    });
    if (error) throw new Error(error.message);

    await podarBackupsAntiguos(admin, sesion.studioId, 'MANUAL');

    return NextResponse.json({ id, tipo: 'MANUAL', creadoEn });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
