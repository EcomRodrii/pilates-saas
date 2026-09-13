import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearSnapshot, BACKUP_TABLES, backupsAPodar, RETENCION_MANUAL_DIAS, type FilaBackupPoda } from './backup-engine.ts';

// ── Poda por FECHA de las copias manuales ──
const AHORA = new Date('2026-10-10T12:00:00Z');
const hace = (dias: number, id = `b-${dias}`): FilaBackupPoda =>
  ({ id, creado_en: new Date(AHORA.getTime() - dias * 86_400_000).toISOString(), storage_key: `backups/s/${id}.json` });

test('backupsAPodar: una MANUAL de más de 90 días se borra aunque no se llegue al tope de 100', () => {
  assert.equal(RETENCION_MANUAL_DIAS, 90);
  const ids = backupsAPodar([hace(1), hace(89), hace(91), hace(200)], 'MANUAL', AHORA).map(b => b.id);
  assert.deepEqual(ids.sort(), ['b-200', 'b-91']);
});

test('backupsAPodar: la copia MANUAL sin storage_key (snapshot inline, anterior a R2) también caduca', () => {
  const inline = { ...hace(95, 'inline'), storage_key: null };
  assert.deepEqual(backupsAPodar([inline], 'MANUAL', AHORA).map(b => b.id), ['inline']);
});

test('backupsAPodar: las automáticas NO caducan por fecha, solo por número', () => {
  assert.deepEqual(backupsAPodar([hace(400)], 'MENSUAL', AHORA), []);
  const diarias = Array.from({ length: 16 }, (_, i) => hace(i));
  assert.deepEqual(backupsAPodar(diarias, 'DIARIO', AHORA).map(b => b.id).sort(), ['b-14', 'b-15']);
});

test('backupsAPodar: una fecha ilegible no se borra por fecha', () => {
  assert.deepEqual(backupsAPodar([{ id: 'x', creado_en: 'basura', storage_key: null }], 'MANUAL', AHORA), []);
});

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
