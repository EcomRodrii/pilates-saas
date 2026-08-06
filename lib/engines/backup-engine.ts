import type { SupabaseClient } from '@supabase/supabase-js';
// Imports relativos con extensión .ts explícita: es lo que necesita
// `node --test --experimental-strip-types` para poder cargar este módulo (el
// alias `@/` solo lo resuelve el bundler). Ver AGENTS.md / tentare-os.md.
import { r2Configurado, subirSnapshot, descargarSnapshot, borrarSnapshots } from '../r2.ts';
import { leerCatalogoCompleto } from '../migracion/catalogo.ts';
import { uid } from '../utils.ts';

// Todas las tablas de datos de un negocio, en el mismo orden en que las crean
// las migraciones (o sea, en orden de dependencias: una tabla nunca
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

// Cuántas tablas se leen a la vez. Ni 1 (eran 44 viajes en serie: 4342 ms
// medidos contra un estudio de 22 socias) ni 44 de golpe: un abanico así de
// ancho se estorba a sí mismo — medido en este mismo proyecto, 52 consultas
// simultáneas multiplican por ~19 lo que tarda cada una por separado.
const TABLAS_A_LA_VEZ = 8;

// Lee todas las filas de un negocio en cada tabla de BACKUP_TABLES. Requiere
// el cliente admin (service role) porque tiene que leer sin restricciones de
// RLS, sea quien sea quien lo dispare (staff logueado, o el cron sin sesión).
//
// ⚠️ Pagina con `leerCatalogoCompleto`. Antes hacía `.select('*')` a secas, y
// PostgREST corta en `max_rows` (1000, supabase/config.toml:18) EN SILENCIO:
// sin error y sin señal de que faltan filas. En un backup eso no es un informe
// incompleto, es PÉRDIDA DE DATOS — `restaurarSnapshot` borra y reinserta el
// snapshot tal cual, así que un estudio con más de 1000 reservas restauraba
// habiendo perdido todo lo que no cupo. El repo ya conocía este fallo y lo
// había arreglado en las lecturas del panel (`fetchAllRows`) y en los
// importadores (este mismo helper); a los backups nunca llegó.
export async function crearSnapshot(admin: SupabaseClient, studioId: string): Promise<BackupSnapshot> {
  const snapshot: BackupSnapshot = {};
  for (let i = 0; i < BACKUP_TABLES.length; i += TABLAS_A_LA_VEZ) {
    const lote = BACKUP_TABLES.slice(i, i + TABLAS_A_LA_VEZ);
    await Promise.all(lote.map(async tabla => {
      const { filas, truncado } = await leerCatalogoCompleto<Record<string, unknown>>(
        (desde, hasta) => admin.from(tabla).select('*').eq('studio_id', studioId).range(desde, hasta),
      ).catch((error: unknown) => {
        throw new Error(`Error leyendo ${tabla}: ${error instanceof Error ? error.message : String(error)}`);
      });
      // El tope de `leerCatalogoCompleto` es una red contra bucles infinitos.
      // Si salta, el snapshot estaría incompleto — y guardar un backup
      // incompleto como si fuera bueno es justo el fallo que arregla esto.
      if (truncado) throw new Error(`Error leyendo ${tabla}: la tabla superó el tope de paginación, el backup habría quedado incompleto`);
      snapshot[tabla] = filas;
    }));
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
