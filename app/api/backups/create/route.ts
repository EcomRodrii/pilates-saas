import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { guardarBackup, podarBackupsAntiguos } from '@/lib/engines/backup-engine';
import { errorInterno } from '@/lib/errores-servidor';

// Backup manual, disparado desde el panel. SOLO propietaria: la premisa de
// antes ("crear una copia no es destructivo") era falsa. `podarBackupsAntiguos`
// de dos líneas más abajo BORRA de R2 todo lo que pase de RETENCION.MANUAL
// (backup-engine.ts), así que crear copias en bucle expulsa y destruye las
// copias legítimas — justo la red de recuperación, justo antes de necesitarla.
// Además cada llamada dispara un volcado completo del negocio con service-role
// (salta RLS) y la propia policy `admin_read_backups` (0000_base.sql) exige
// PROPIETARIO para siquiera LEER la lista. La UI ya lo restringía
// (components/configuracion/tab-backups.tsx:47) — el servidor no, que es donde
// cuenta. Mismo criterio que su gemela /api/backups/restore.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Backups no configurados: falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede crear copias de seguridad' }, { status: 403 });
  }

  try {
    const { id, creadoEn } = await guardarBackup(admin, { studioId: sesion.studioId, tipo: 'MANUAL' });

    await podarBackupsAntiguos(admin, sesion.studioId, 'MANUAL');

    return NextResponse.json({ id, tipo: 'MANUAL', creadoEn });
  } catch (err: unknown) {
    return errorInterno('backups/create:POST', err, 'No se ha podido crear la copia de seguridad.');
  }
}
