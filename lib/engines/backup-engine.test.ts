import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  crearSnapshot, BACKUP_TABLES, COLUMNAS_SOCIOS_QUE_NO_VUELVEN_ATRAS, TABLAS_ACTUALIZAR,
  TABLAS_FISCALES_SOLO_INSERTAR, planModosRestauracion, sociasAReanonimizar, type ReferenciaFk,
} from './backup-engine.ts';

// ─── Restauración (C4 / R-1) ─────────────────────────────────────────────────

// FKs que apuntan a tablas de BACKUP_TABLES, leídas del catálogo de producción
// (`pg_constraint`, 13-sep-2026). Solo el par referenciada ← referenciante: el
// ON DELETE da igual, porque cualquiera de ellos (cascada, set null o bloqueo)
// rompe un DELETE de la madre si la hija no se reinserta.
const FK_PRODUCCION: Record<string, string[]> = {
  achievement_definitions: ['achievement_history', 'achievement_progress'],
  automation_rules: ['automation_logs'],
  automatizaciones: ['automation_logs'],
  challenge_definitions: ['challenge_history', 'challenge_progress'],
  codigos_descuento: ['codigos_descuento_consumos'],
  instructores: ['citas_disponibilidad', 'contenido_portal_banners', 'instructor_dependency_snapshots',
    'instructor_enlaces_vigentes', 'instructor_tarifas', 'instructora_ausencias', 'instructora_disponibilidad',
    'instructora_disponibilidad_excepciones', 'liquidaciones_instructoras', 'novedades_estudio',
    'red_formalizaciones', 'sustitucion_contactos', 'sustituciones', 'valoraciones', 'citas',
    'mensajes_equipo', 'notas_progreso', 'preferencias_socio', 'sesiones', 'videos_on_demand'],
  planes_tarifa: ['matricula_cupo_liberaciones', 'plan_tipos_clase', 'suscripciones', 'ventas_pos'],
  posts_comunidad: ['comentarios_comunidad', 'post_evento_asistentes', 'post_likes'],
  productos_pos: ['movimientos_stock'],
  recibos: ['codigos_descuento_consumos', 'devoluciones', 'penalizaciones', 'facturas'],
  reservas: ['conversaciones', 'red_resenas'],
  reward_actions: ['reward_history'],
  reward_catalog: ['reward_redemptions'],
  reward_rules: ['reward_history'],
  salas: ['bloqueos_maquina', 'plazas_fijas', 'sesiones', 'spots'],
  sesiones: ['conversaciones', 'intentos_reserva_fallidos', 'recordatorio_envios', 'respuestas_sesion',
    'sustituciones', 'valoraciones', 'widget_eventos', 'reservas'],
  socios: ['codigos_descuento_consumos', 'comunicaciones_socio', 'condiciones_salud', 'conversacion_participantes',
    'devoluciones', 'documentos_socio', 'favoritos_clase', 'intentos_reserva_fallidos', 'lecturas_ficha_salud',
    'mandatos_sepa', 'memoria_socio', 'pagos_historicos', 'plazas_fijas', 'post_evento_asistentes',
    'recomendaciones', 'recordatorio_envios', 'recuperaciones', 'respuestas_cuestionario_salud',
    'respuestas_sesion', 'reto_participaciones', 'socio_companeras', 'socio_excepciones',
    'socio_tipos_clase_autorizados', 'tareas', 'valoraciones', 'valoraciones_iniciales',
    'valoraciones_iniciales_salud', 'widget_eventos', 'achievement_history', 'achievement_progress',
    'actividad_reciente', 'challenge_history', 'challenge_progress', 'citas', 'credit_transactions',
    'member_credits', 'notas_internas', 'notas_progreso', 'preferencias_socio', 'recibos', 'reservas',
    'reward_actions', 'reward_history', 'reward_redemptions', 'suscripciones', 'ventas_pos'],
  spots: ['bloqueos_maquina', 'plazas_fijas', 'reservas'],
  suscripciones: ['congelaciones', 'recibos'],
  tipos_clase: ['favoritos_clase', 'intentos_reserva_fallidos', 'plan_tipos_clase', 'plazas_fijas',
    'socio_tipos_clase_autorizados', 'sesiones'],
  ventas_pos: ['devoluciones', 'ventas_pos_lineas', 'facturas'],
};
const fks = (mapa: Record<string, string[]>): ReferenciaFk[] =>
  Object.entries(mapa).flatMap(([referenciada, hijas]) => hijas.map(referenciante => ({ referenciada, referenciante })));

const migracionRestaurar = readFileSync(new URL(
  '../../supabase/migrations/20260913170200_restaurar_backup_conserva_fiscal_y_supresiones.sql', import.meta.url), 'utf8');
function arraySql(nombre: string): string[] {
  const m = migracionRestaurar.match(new RegExp(`${nombre} constant text\\[\\] := array\\[([\\s\\S]*?)\\];`));
  assert.ok(m, `no encuentro ${nombre} en la migración`);
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]);
}

test('restaurar: lo fiscal nunca se borra ni se revierte', () => {
  const modos = planModosRestauracion(fks(FK_PRODUCCION));
  for (const t of ['recibos', 'facturas', 'ventas_pos'] as const) {
    assert.equal(modos[t], 'insertar_faltantes', `${t} no puede reemplazarse`);
  }
});

test('restaurar: socios se actualiza sin DELETE (sin cascadas a salud, documentos, mensajes)', () => {
  assert.equal(planModosRestauracion(fks(FK_PRODUCCION)).socios, 'actualizar');
});

test('restaurar: con el catálogo de producción, ninguna tabla a reemplazar arrastra datos fuera de la copia', () => {
  const lista = fks(FK_PRODUCCION);
  const modos = planModosRestauracion(lista);
  const reemplazadas = new Set(BACKUP_TABLES.filter(t => modos[t] === 'reemplazar'));
  for (const t of reemplazadas) {
    const fuera = lista.filter(fk => fk.referenciada === t && !reemplazadas.has(fk.referenciante as never));
    assert.deepEqual(fuera, [], `borrar ${t} arrastraría ${fuera.map(f => f.referenciante).join(', ')}`);
  }
  // Lo que la v1 destruía o no podía borrar se queda sin DELETE.
  for (const t of ['instructores', 'sesiones', 'reservas', 'suscripciones', 'planes_tarifa', 'tipos_clase',
    'salas', 'spots', 'productos_pos', 'codigos_descuento', 'posts_comunidad'] as const) {
    assert.equal(modos[t], 'insertar_faltantes', `${t}`);
  }
  // Y lo que no cuelga de nada ajeno se sigue restaurando entero (no verde por vacío).
  for (const t of ['notas_internas', 'automation_logs', 'automation_rules', 'reward_redemptions', 'citas'] as const) {
    assert.equal(modos[t], 'reemplazar', `${t}`);
  }
});

test('restaurar: una FK nueva desde una tabla no respaldada saca a su madre de reemplazar, en cadena', () => {
  const modos = planModosRestauracion([
    ...fks(FK_PRODUCCION),
    { referenciada: 'automation_logs', referenciante: 'tabla_nueva_sin_backup' },
  ]);
  assert.equal(modos.automation_logs, 'insertar_faltantes');
  // automation_logs ya no se borra → borrar sus madres la arrastraría.
  assert.equal(modos.automation_rules, 'insertar_faltantes');
  assert.equal(modos.automatizaciones, 'insertar_faltantes');
});

test('restaurar: una tabla que la copia no trae ni se borra ni se vacía', () => {
  const sinDashboard = BACKUP_TABLES.filter(t => t !== 'dashboard_charts');
  assert.equal(planModosRestauracion(fks(FK_PRODUCCION), sinDashboard).dashboard_charts, 'ausente');
});

test('restaurar: una socia suprimida después de la copia se vuelve a anonimizar', () => {
  const ids = sociasAReanonimizar({
    sociasTrasRestaurar: [
      { id: 'activa', borrado_en: null },
      { id: 'suprimida-despues', borrado_en: null }, // la copia la trae viva…
      { id: 'borrada-en-copia', borrado_en: '2026-08-01T00:00:00Z' },
      { id: 'borrada-antes', borrado_en: null },
    ],
    borradasAntes: ['borrada-antes'],
    suprimidas: ['suprimida-despues', 'suprimida-despues'], // …pero está en `supresiones`
  });
  assert.deepEqual(ids, ['borrada-antes', 'borrada-en-copia', 'suprimida-despues']);
});

test('restaurar: las listas de TS y las de la migración son las mismas', () => {
  assert.deepEqual(arraySql('c_tablas'), [...BACKUP_TABLES]);
  assert.deepEqual(arraySql('c_fiscales'), [...TABLAS_FISCALES_SOLO_INSERTAR]);
  assert.deepEqual(arraySql('c_actualizar'), [...TABLAS_ACTUALIZAR]);
  assert.deepEqual(arraySql('c_socios_no_vuelven_atras').sort(), [...COLUMNAS_SOCIOS_QUE_NO_VUELVEN_ATRAS].sort());
});

test('restaurar: la función es solo de service_role y lo comprueba al aplicarse', () => {
  const firma = 'public.restaurar_backup(text, jsonb)';
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.ok(migracionRestaurar.includes(`revoke all on function ${firma} from ${rol};`), `falta revoke ${rol}`);
  }
  assert.ok(migracionRestaurar.includes(`grant execute on function ${firma} to service_role;`));
  for (const rol of ['anon', 'authenticated', 'service_role']) {
    assert.ok(migracionRestaurar.includes(`has_function_privilege('${rol}', '${firma}'`), `falta comprobación ${rol}`);
  }
});

// ─── Copia (crearSnapshot) ───────────────────────────────────────────────────

// Simula lo que hace PostgREST de verdad: devolver como mucho `max_rows` filas
// por petición (1000, supabase/config.toml:18) y hacerlo EN SILENCIO — sin
// error y sin ninguna señal de que faltan más. Es justo lo que convertía un
// backup en pérdida de datos: `restaurarSnapshot` borra y reinserta el snapshot
// tal cual, así que lo que no cupo en la primera página no volvía nunca.
const MAX_ROWS = 1000;

function adminFalso(filasPorTabla: Record<string, number>) {
  let peticiones = 0;
  const ordenes: Record<string, string | null> = {};
  const admin = {
    from(tabla: string) {
      const total = filasPorTabla[tabla] ?? 0;
      if (!(tabla in ordenes)) ordenes[tabla] = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        order(columna: string) { ordenes[tabla] = columna; return builder; },
        range(desde: number, hasta: number) {
          peticiones++;
          const pedidas = hasta - desde + 1;
          const disponibles = Math.max(0, total - desde);
          const n = Math.min(pedidas, disponibles, MAX_ROWS);
          const data = Array.from({ length: n }, (_, i) => ({ id: `${tabla}-${desde + i}` }));
          return Promise.resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
  return {
    admin: admin as unknown as SupabaseClient,
    peticiones: () => peticiones,
    ordenes: () => ordenes,
  };
}

test('crearSnapshot pagina: una tabla con más de 1000 filas se guarda ENTERA', async () => {
  const { admin } = adminFalso({ reservas: 2500 });
  const snapshot = await crearSnapshot(admin, 'studio-1');

  // El fallo original devolvía exactamente 1000 aquí, sin error: el backup
  // parecía correcto y restaurarlo habría borrado las otras 1500 reservas.
  assert.equal(snapshot.reservas.length, 2500);
  assert.equal(snapshot.reservas[0].id, 'reservas-0');
  assert.equal(snapshot.reservas[2499].id, 'reservas-2499');
});

test('TODAS las tablas se leen con ORDER BY, y por una columna que existe', async () => {
  // `leerCatalogoCompleto` lo EXIGE en su contrato: sin ORDER BY, LIMIT/OFFSET
  // no garantiza páginas disjuntas, así que una fila puede salir dos veces y
  // otra ninguna — en un backup eso es pérdida de datos silenciosa, que es
  // exactamente lo que el test de arriba cree estar evitando. Estaba paginando
  // sin `.order()` desde el día que se escribió.
  //
  // La columna importa tanto como el ORDER BY: `member_credits` y
  // `preferencias_socio` NO tienen columna `id` (su PK es `socio_id`,
  // verificado contra el catálogo de producción), y ordenarlas por `id` las
  // reventaría con un 42703 — un backup que falla entero, peor que el fallo
  // que esto arregla.
  const SIN_COLUMNA_ID = new Set(['member_credits', 'preferencias_socio']);
  const { admin, ordenes } = adminFalso(Object.fromEntries(BACKUP_TABLES.map(t => [t, 3])));
  await crearSnapshot(admin, 'studio-1');

  for (const tabla of BACKUP_TABLES) {
    const columna = ordenes()[tabla];
    assert.ok(columna, `la tabla ${tabla} se pagina SIN order()`);
    assert.equal(
      columna,
      SIN_COLUMNA_ID.has(tabla) ? 'socio_id' : 'id',
      `${tabla} se ordena por una columna que no es la suya`,
    );
  }
});

test('crearSnapshot cubre TODAS las tablas de BACKUP_TABLES', async () => {
  const { admin } = adminFalso(Object.fromEntries(BACKUP_TABLES.map(t => [t, 3])));
  const snapshot = await crearSnapshot(admin, 'studio-1');

  for (const tabla of BACKUP_TABLES) {
    assert.equal(snapshot[tabla]?.length, 3, `falta o llega incompleta la tabla ${tabla}`);
  }
});

test('crearSnapshot no se atraganta con tablas vacías', async () => {
  const { admin } = adminFalso({});
  const snapshot = await crearSnapshot(admin, 'studio-1');

  for (const tabla of BACKUP_TABLES) {
    assert.deepEqual(snapshot[tabla], []);
  }
});

test('crearSnapshot propaga el error diciendo QUÉ tabla falló', async () => {
  const admin = {
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: () => tabla === 'reservas'
          ? Promise.resolve({ data: null, error: new Error('boom') })
          : Promise.resolve({ data: [], error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  // Un backup a medias NO debe guardarse como si fuera bueno.
  await assert.rejects(() => crearSnapshot(admin, 'studio-1'), /reservas/);
});

test('el error de PostgREST llega LEGIBLE, no como "[object Object]"', async () => {
  // Lo que se vio en Sentry durante tres noches seguidas: «Error leyendo
  // planes_tarifa: [object Object]» — un estudio sin copia de seguridad y sin
  // forma de saber por qué. El error de PostgREST es un objeto plano, no un
  // `Error`, así que `String(error)` lo convierte en eso.
  const admin = {
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: () => Promise.resolve({
          data: null,
          error: { message: 'canceling statement due to statement timeout', code: '57014', details: 'x' },
        }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  await assert.rejects(() => crearSnapshot(admin, 'studio-1'), (e: Error) => {
    assert.match(e.message, /statement timeout/);
    assert.match(e.message, /57014/);
    assert.doesNotMatch(e.message, /\[object Object\]/);
    return true;
  });
});
