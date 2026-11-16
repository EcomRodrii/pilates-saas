import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Una clase fija se ancla a una SALA (`plazas_fijas.sala_id` es NOT NULL) y el motor casa cada clase con su plaza por sala. Un estudio
// importó su horario sin columna de sala (las clases quedaron con `sala_id` vacío) y al dar una clase fija el servidor reventaba contra
// la base de datos: «No se pudo guardar la clase fija», sin decir por qué. Dos guardas, vigiladas en el fuente como el resto:
//  · la importación usa la sala del estudio cuando es la ÚNICA (no hay duda de cuál es), en vez de dejar clases sin sala;
//  · dar una clase fija sobre una clase sin sala contesta qué hacer, no un error genérico.

const raiz = join(import.meta.dirname, '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');

test('⚠️ importar clases: sin columna de sala y con una sola sala en el estudio, se usa esa sala', () => {
  const f = leer('app/api/clases/import/route.ts');
  assert.match(f, /const salaUnica = \(salas \?\? \[\]\)\.length === 1/);
  assert.match(f, /const sala = f\.sala \? salaPorNombre\.get\(norm\(f\.sala\)\) : \(salaUnica \?\? undefined\);/);
  // Un nombre de sala que NO cuadra sigue contando como «sin sala» (no se inventa una sala que no existe).
  assert.match(f, /if \(f\.sala && !sala\) sinSala\+\+;/);
});

test('⚠️ clase fija sobre una clase sin sala: lo dice y no llega a escribir', () => {
  const f = leer('lib/db/supabase-data-admin.ts');
  const i = f.indexOf('if (!ses.sala_id)');
  assert.ok(i > 0, 'falta la guarda de la sala');
  assert.match(f.slice(i, i + 260), /Esta clase no tiene sala asignada/);
  assert.ok(i < f.indexOf('const salaId = ses.sala_id as string;'), 'la guarda va antes de usar la sala');
});
