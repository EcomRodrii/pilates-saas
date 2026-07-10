import type { SupabaseClient } from '@supabase/supabase-js';

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
    .select('id, creado_en')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .order('creado_en', { ascending: false });
  if (!data || data.length <= limite) return;
  const aBorrar = data.slice(limite).map((b: { id: string }) => b.id);
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
