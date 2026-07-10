import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { restaurarSnapshot, cargarSnapshot, type BackupRow } from '@/lib/backup-engine';

// Restaurar sobrescribe TODOS los datos actuales del negocio con los del
// backup elegido — irreversible salvo que exista otro backup posterior.
// Solo la propietaria puede hacerlo (recepción/instructoras ni siquiera ven
// esta pantalla, ver RLS de la tabla backups, pero se revalida aquí también
// porque esta ruta usa la service role key, que no pasa por RLS).
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
    return NextResponse.json({ error: 'Solo la propietaria puede restaurar una copia de seguridad' }, { status: 403 });
  }

  const body = await req.json();
  const backupId = body?.backupId as string | undefined;
  if (!backupId) {
    return NextResponse.json({ error: 'backupId requerido' }, { status: 400 });
  }

  const { data: backup, error: readError } = await admin
    .from('backups')
    .select('id, studio_id, storage_key, datos')
    .eq('id', backupId)
    .eq('studio_id', sesion.studioId) // nunca restaurar un backup de otro negocio
    .maybeSingle();
  if (readError || !backup) {
    return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 });
  }

  try {
    // El snapshot sale de R2 (backups nuevos) o de la columna datos (antiguos).
    const snapshot = await cargarSnapshot(backup as BackupRow);
    await restaurarSnapshot(admin, sesion.studioId, snapshot);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
