import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearSnapshot, BACKUP_TABLES } from './backup-engine.ts';

// Simula lo que hace PostgREST de verdad: devolver como mucho `max_rows` filas
// por petición (1000, supabase/config.toml:18) y hacerlo EN SILENCIO — sin
// error y sin ninguna señal de que faltan más. Es justo lo que convertía un
// backup en pérdida de datos: `restaurarSnapshot` borra y reinserta el snapshot
// tal cual, así que lo que no cupo en la primera página no volvía nunca.
const MAX_ROWS = 1000;

function adminFalso(filasPorTabla: Record<string, number>) {
  let peticiones = 0;
  const admin = {
    from(tabla: string) {
      const total = filasPorTabla[tabla] ?? 0;
      const builder = {
        select: () => builder,
        eq: () => builder,
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
  return { admin: admin as unknown as SupabaseClient, peticiones: () => peticiones };
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
