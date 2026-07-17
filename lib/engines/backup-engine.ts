import type { SupabaseClient } from '@supabase/supabase-js';
import { r2Configurado, subirSnapshot, descargarSnapshot, borrarSnapshots } from '@/lib/r2';
import { uid } from '@/lib/utils';

// Todas las tablas de datos de un negocio, en el mismo orden en que
// schema.sql las crea (o sea, en orden de dependencias: una tabla nunca
// aparece antes que aquellas a las que hace referencia por FK). Restaurar
// inserta en este orden; borrar antes de restaurar lo hace en el orden
// inverso, para no violar ninguna referencia.
//
// "studios" queda fuera a propósito — es configuración/identidad del
// negocio (slug, cuenta de Stripe...), no datos que tenga sentido revertir
// a un backup antiguo.
export const BACKUP_TABLES = [
  'socios', 'planes_tarifa', 'suscripciones', 'salas', 'spots', 'tipos_clase',
  'instructores', 'sesiones', 'reservas', 'recibos', 'facturas', 'citas',
  'productos_pos', 'ventas_pos', 'campanas', 'automatizaciones', 'automation_rules',
  'automation_logs', 'codigos_descuento', 'actividad_reciente', 'mensajes_equipo',
  'notificaciones', 'videos_on_demand', 'posts_comunidad', 'notas_internas',
  'notas_progreso', 'integraciones', 'preferencias_socio',
  'reward_rules', 'reward_actions', 'reward_history', 'credit_transactions',
  'member_credits', 'reward_catalog', 'reward_redemptions',
  'achievement_definitions', 'achievement_progress', 'achievement_history',
  'level_definitions', 'challenge_definitions', 'challenge_progress', 'challenge_history',
  'dashboard_charts', 'soporte_solicitudes',
] as const;

export type TipoBackup = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'MANUAL';

const RETENCION: Record<TipoBackup, number> = { DIARIO: 14, SEMANAL: 8, MENSUAL: 12, MANUAL: 100 };

// Evita que la tabla crezca sin límite: conserva solo los N backups más
// recientes de cada tipo (14 diarios, 8 semanales, 12 mensuales, 100 manuales).
export async function podarBackupsAntiguos(admin: SupabaseClient, studioId: string, tipo: TipoBackup): Promise<void> {
  const limite = RETENCION[tipo];
  const { data } = await admin
    .from('backups')
    .select('id, creado_en, storage_key')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .order('creado_en', { ascending: false });
  if (!data || data.length <= limite) return;
  const sobran = data.slice(limite) as { id: string; storage_key: string | null }[];
  const aBorrar = sobran.map(b => b.id);
  // Primero R2 (best-effort), luego la fila. Si R2 fallara y la fila quedara,
  // la siguiente poda lo reintenta; nunca dejamos un objeto R2 huérfano sin
  // su metadata (que sería invisible para volver a purgarlo).
  const claves = sobran.map(b => b.storage_key).filter((k): k is string => !!k);
  if (claves.length > 0) await borrarSnapshots(claves);
  await admin.from('backups').delete().in('id', aBorrar);
}

export interface BackupSnapshot {
  [table: string]: Record<string, unknown>[];
}

// Lee todas las filas de un negocio en cada tabla de BACKUP_TABLES. Requiere
// el cliente admin (service role) porque tiene que leer sin restricciones de
// RLS, sea quien sea quien lo dispare (staff logueado, o el cron sin sesión).
export async function crearSnapshot(admin: SupabaseClient, studioId: string): Promise<BackupSnapshot> {
  const snapshot: BackupSnapshot = {};
  for (const tabla of BACKUP_TABLES) {
    const { data, error } = await admin.from(tabla).select('*').eq('studio_id', studioId);
    if (error) throw new Error(`Error leyendo ${tabla}: ${error.message}`);
    snapshot[tabla] = data ?? [];
  }
  return snapshot;
}

// Sobrescribe TODOS los datos actuales del negocio con los del snapshot.
// Operación destructiva e irreversible salvo que exista otro backup posterior.
//
// P0-15: el borrado + reinserción de las 44 tablas se hace en UNA transacción
// atómica (RPC restaurar_backup) en vez de 88 llamadas HTTP independientes. Si
// algo falla a mitad, se revierte entero — nunca deja al tenant con datos a
// medias (parte borrada, parte restaurada) sin posibilidad de rollback.
export async function restaurarSnapshot(admin: SupabaseClient, studioId: string, snapshot: BackupSnapshot): Promise<void> {
  const { error } = await admin.rpc('restaurar_backup', {
    p_studio_id: studioId,
    p_snapshot: snapshot,
  });
  if (error) throw new Error(`Error restaurando el backup: ${error.message}`);
}

// Fila de backups tal como la necesitan las lecturas (metadata + de dónde sale
// el snapshot). 'datos' solo viene poblado en backups antiguos (pre-R2).
export interface BackupRow {
  id: string;
  studio_id: string;
  storage_key: string | null;
  datos: BackupSnapshot | null;
}

// Crea el snapshot y lo guarda donde toque, en UNA función que comparten el
// cron y el backup manual (antes cada uno duplicaba el insert). Si R2 está
// configurado: sube el JSON a R2 y en la tabla deja solo metadata + clave. Si
// no: cae al modo antiguo (snapshot inline en 'datos'), así nada se rompe
// mientras R2 no esté puesto. Devuelve el id ya generado.
export async function guardarBackup(
  admin: SupabaseClient,
  opts: { studioId: string; tipo: TipoBackup; id?: string; creadoEn?: string }
): Promise<{ id: string; creadoEn: string }> {
  const id = opts.id ?? `bak-${Date.now()}-${uid()}`;
  const creadoEn = opts.creadoEn ?? new Date().toISOString();
  const snapshot = await crearSnapshot(admin, opts.studioId);

  if (r2Configurado()) {
    const storageKey = await subirSnapshot(opts.studioId, id, snapshot);
    const { error } = await admin.from('backups').insert({
      id, studio_id: opts.studioId, tipo: opts.tipo, storage_key: storageKey, datos: null, creado_en: creadoEn,
    });
    if (error) {
      // Si la fila no entra, no dejamos el objeto huérfano en R2.
      await borrarSnapshots([storageKey]);
      throw new Error(error.message);
    }
  } else {
    const { error } = await admin.from('backups').insert({
      id, studio_id: opts.studioId, tipo: opts.tipo, datos: snapshot, creado_en: creadoEn,
    });
    if (error) throw new Error(error.message);
  }

  return { id, creadoEn };
}

// Obtiene el snapshot de un backup, venga de R2 (nuevo) o de la columna datos
// (antiguo). Lo usa el restore.
export async function cargarSnapshot(row: BackupRow): Promise<BackupSnapshot> {
  if (row.storage_key) return descargarSnapshot(row.storage_key);
  if (row.datos) return row.datos;
  throw new Error('El backup no tiene datos ni objeto en R2');
}
