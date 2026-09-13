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

// Por qué columna se ordena cada tabla al paginar. `leerCatalogoCompleto` lo
// EXIGE ("`construir` DEBE incluir un `.order(...)` por una columna única"):
// sin ORDER BY, Postgres no garantiza que LIMIT/OFFSET devuelva páginas
// disjuntas, así que una fila puede salir dos veces y otra ninguna. En un
// backup eso no es un informe incompleto, es PÉRDIDA DE DATOS —
// `restaurarSnapshot` borra y reinserta el snapshot tal cual.
//
// `id` sirve para 42 de las 44 tablas; `member_credits` y `preferencias_socio`
// NO tienen columna `id` (su PK es `socio_id`, verificado en producción contra
// `pg_constraint`) y ordenarlas por `id` reventaría su lectura con un 42703,
// que es peor que el fallo que esto arregla.
// ⚠️ El tipo es EXHAUSTIVO (`Record`, no `Partial<Record>`) a propósito: así,
// añadir una tabla a `BACKUP_TABLES` no compila hasta decir por qué columna se
// ordena. Con un valor por defecto, la tabla 45 con PK distinta de `id` se
// habría paginado por una columna inexistente y su backup fallaría ENTERO en
// producción, sin que ningún check lo viera.
const COLUMNA_ORDEN: Record<(typeof BACKUP_TABLES)[number], string> = {
  socios: 'id', planes_tarifa: 'id', suscripciones: 'id', salas: 'id', spots: 'id',
  tipos_clase: 'id', instructores: 'id', sesiones: 'id', reservas: 'id', recibos: 'id',
  facturas: 'id', citas: 'id', productos_pos: 'id', ventas_pos: 'id', campanas: 'id',
  automatizaciones: 'id', automation_rules: 'id', automation_logs: 'id',
  codigos_descuento: 'id', actividad_reciente: 'id', mensajes_equipo: 'id',
  notificaciones: 'id', videos_on_demand: 'id', posts_comunidad: 'id',
  notas_internas: 'id', notas_progreso: 'id', integraciones: 'id',
  // Las dos SIN columna `id`: su PK es `socio_id` (verificado en el catálogo de
  // producción, `pg_constraint`).
  preferencias_socio: 'socio_id',
  member_credits: 'socio_id',
  reward_rules: 'id', reward_actions: 'id', reward_history: 'id',
  credit_transactions: 'id', reward_catalog: 'id', reward_redemptions: 'id',
  achievement_definitions: 'id', achievement_progress: 'id', achievement_history: 'id',
  level_definitions: 'id', challenge_definitions: 'id', challenge_progress: 'id',
  challenge_history: 'id', dashboard_charts: 'id', soporte_solicitudes: 'id',
};

/** Mensaje legible de un error de PostgREST, que NO es `Error` y da "[object Object]". */
function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (typeof e.message === 'string') {
      const code = typeof e.code === 'string' && e.code ? ` [${e.code}]` : '';
      const det = typeof e.details === 'string' && e.details ? ` — ${e.details}` : '';
      return `${e.message}${code}${det}`;
    }
    try { return JSON.stringify(error); } catch { /* cae al String de abajo */ }
  }
  return String(error);
}

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
      const orden = COLUMNA_ORDEN[tabla];
      const { filas, truncado } = await leerCatalogoCompleto<Record<string, unknown>>(
        (desde, hasta) => admin.from(tabla).select('*').eq('studio_id', studioId)
          .order(orden, { ascending: true }).range(desde, hasta),
      ).catch((error: unknown) => {
        // El error de PostgREST no es un `Error`: sin esto, el aviso que llega a
        // Sentry es literalmente «Error leyendo planes_tarifa: [object Object]»
        // y deja al equipo sin saber por qué lleva noches sin copia.
        throw new Error(`Error leyendo ${tabla}: ${mensajeDeError(error)}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// Restauración: qué se hace con cada tabla.
//
// La decisión la toma la RPC `restaurar_backup` (migr 20260913170200) EN CADA
// EJECUCIÓN mirando el catálogo de FKs; esto es su espejo puro, para poder
// testear la regla sin base de datos y para que nadie cambie una lista sin la
// otra (el test compara las dos con el SQL).
//
//   · reemplazar          DELETE + INSERT. Solo si ninguna tabla fuera del
//                         conjunto «reemplazar» la referencia (hasta punto fijo).
//   · insertar_faltantes  INSERT … ON CONFLICT DO NOTHING. Lo fiscal siempre, y
//                         toda tabla que no se puede borrar sin arrastrar datos
//                         que la copia no guarda. No revierte filas existentes:
//                         revertirlas movería dinero o acceso (una suscripción
//                         que vuelve a ACTIVA y se renueva, una instructora dada
//                         de baja que vuelve a entrar, una reserva que vuelve a
//                         NO_ASISTIO y dispara una penalización).
//   · actualizar          Solo `socios`: upsert sin DELETE, sin tocar las
//                         columnas de COLUMNAS_SOCIOS_QUE_NO_VUELVEN_ATRAS.
//   · ausente             La copia no trae la tabla: ni se borra ni se inserta.
// ─────────────────────────────────────────────────────────────────────────────

export type TablaBackup = (typeof BACKUP_TABLES)[number];
export type ModoRestauracion = 'reemplazar' | 'insertar_faltantes' | 'actualizar' | 'ausente';

/** Registro fiscal: nunca se borra ni se revierte. `ventas_pos_lineas`,
 * `devoluciones` y `pagos_historicos` no están en la copia: no se tocan nunca. */
export const TABLAS_FISCALES_SOLO_INSERTAR: readonly TablaBackup[] = ['recibos', 'facturas', 'ventas_pos'];

export const TABLAS_ACTUALIZAR: readonly TablaBackup[] = ['socios'];

/** Columnas de `socios` que una copia antigua NO puede pisar: prueban un
 * consentimiento, conectan con dinero o con la cuenta, o marcan la supresión. */
export const COLUMNAS_SOCIOS_QUE_NO_VUELVEN_ATRAS = [
  'id', 'studio_id', 'email', 'usuario', 'auth_user_id', 'borrado_en',
  'stripe_customer_id', 'stripe_payment_method_id', 'sepa_mandate_id', 'sepa_payment_method_id',
  'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio', 'metodo_pago_preferido',
  'aceptacion_fecha', 'aceptacion_firma', 'aceptacion_version', 'aceptacion_origen', 'aceptacion_por',
  'consentimiento_salud_fecha', 'consentimiento_salud_registrado_por',
  'consentimiento_salud_revocado_en', 'consentimiento_salud_texto',
  'consentimiento_marketing_en', 'consentimiento_marketing_texto', 'consentimiento_marketing_por',
] as const;

/** Una FK del catálogo: `referenciante` apunta a `referenciada`. */
export interface ReferenciaFk {
  referenciada: string;
  referenciante: string;
}

export function planModosRestauracion(
  fks: readonly ReferenciaFk[],
  tablasEnCopia: Iterable<string> = BACKUP_TABLES,
): Record<TablaBackup, ModoRestauracion> {
  const enCopia = new Set(tablasEnCopia);
  const reemplazar = new Set<string>(BACKUP_TABLES.filter(t =>
    !TABLAS_FISCALES_SOLO_INSERTAR.includes(t) && !TABLAS_ACTUALIZAR.includes(t) && enCopia.has(t)));

  // Punto fijo: sacar una tabla de «reemplazar» puede dejar bloqueada a otra
  // que ella referencia (su DELETE arrastraría en cascada una tabla que ya no
  // se va a reinsertar).
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const tabla of [...reemplazar]) {
      const bloqueada = fks.some(fk =>
        fk.referenciada === tabla && fk.referenciante !== tabla && !reemplazar.has(fk.referenciante));
      if (bloqueada) {
        reemplazar.delete(tabla);
        cambio = true;
      }
    }
  }

  const modos = {} as Record<TablaBackup, ModoRestauracion>;
  for (const tabla of BACKUP_TABLES) {
    modos[tabla] = !enCopia.has(tabla) ? 'ausente'
      : TABLAS_ACTUALIZAR.includes(tabla) ? 'actualizar'
        : reemplazar.has(tabla) ? 'reemplazar'
          : 'insertar_faltantes';
  }
  return modos;
}

/**
 * A quién se le vuelve a aplicar `anonimizar_socio` al terminar: toda socia del
 * estudio que esté en `supresiones`, que estuviera borrada ANTES de restaurar o
 * que, tras restaurar, tenga `borrado_en`. Una copia vieja no resucita a nadie.
 */
export function sociasAReanonimizar(opts: {
  sociasTrasRestaurar: readonly { id: string; borrado_en: string | null }[];
  borradasAntes: readonly string[];
  suprimidas: readonly string[];
}): string[] {
  const antes = new Set(opts.borradasAntes);
  const suprimidas = new Set(opts.suprimidas);
  const ids = opts.sociasTrasRestaurar
    .filter(s => s.borrado_en !== null || antes.has(s.id) || suprimidas.has(s.id))
    .map(s => s.id);
  return [...new Set(ids)].sort();
}

export interface ResumenRestauracion {
  modos: Record<string, ModoRestauracion>;
  reanonimizadas: number;
}

// Restaura la copia en UNA transacción (RPC restaurar_backup, P0-15): si algo
// falla a mitad, se revierte entero. Ya NO sobrescribe todo: ver los modos de
// arriba. Devuelve qué se hizo con cada tabla.
export async function restaurarSnapshot(
  admin: SupabaseClient, studioId: string, snapshot: BackupSnapshot,
): Promise<ResumenRestauracion> {
  const { data, error } = await admin.rpc('restaurar_backup', {
    p_studio_id: studioId,
    p_snapshot: snapshot,
  });
  if (error) throw new Error(`Error restaurando el backup: ${error.message}`);
  return data as ResumenRestauracion;
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
