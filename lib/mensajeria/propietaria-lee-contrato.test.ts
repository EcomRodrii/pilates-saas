import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: la propietaria LEE los hilos instructora–alumna de su
// estudio y nada más (decisión del 14-sep-2026). Si falla, se arregla la
// migración, no la guardia.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = join(import.meta.dirname, '..', '..', 'supabase/migrations');
const NOMBRE = readdirSync(DIR).find((n) => n.endsWith('_mensajeria_propietaria_lee_instructora_alumna.sql'));
const SQL = NOMBRE ? readFileSync(join(DIR, NOMBRE), 'utf8').replace(/--.*$/gm, '') : '';

const POLITICAS: [politica: string, tabla: string][] = [
  ['conversaciones_lectura', 'public\\.conversaciones'],
  ['conversacion_participantes_lectura', 'public\\.conversacion_participantes'],
  ['mensajes_lectura', 'public\\.mensajes'],
  ['mensajeria_broadcast_lectura', 'realtime\\.messages'],
];

test('una rama más, de propietaria y solo en hilos instructora–alumna, en las cuatro políticas de lectura', () => {
  assert.ok(NOMBRE, 'falta la migración *_mensajeria_propietaria_lee_instructora_alumna.sql');
  for (const [politica, tabla] of POLITICAS) {
    assert.match(SQL, new RegExp(`drop policy if exists ${politica} on ${tabla};`), `${politica}: sin drop previo`);
    const bloque = SQL.match(new RegExp(`create policy ${politica} on ${tabla}\\b[\\s\\S]*?;`, 'i'))?.[0];
    assert.ok(bloque, `falta ${politica}`);
    assert.match(bloque!, /for select to authenticated/, `${politica}: tiene que ser de lectura`);
    assert.match(
      bloque!,
      /tipo = 'ALUMNA_INSTRUCTORA' and (c\.)?studio_id = \(select public\.current_studio_id\(\)\) and \(select public\.current_rol\(\)\) = 'PROPIETARIO'/,
      `${politica}: falta la rama de la propietaria`,
    );
    // Las ramas de siempre siguen ahí.
    assert.match(bloque!, /es_participante_conversacion\(/);
    assert.match(bloque!, /'ALUMNA_MOSTRADOR'[^\n]*puede_gestionar_calendario\(\)/);
  }
});

test('solo lectura: ni escritura, ni leído, ni funciones, ni grants, ni otros roles', () => {
  assert.doesNotMatch(SQL, /mensajes_escritura|marca_leido|for (insert|update|delete|all)\b/i);
  assert.doesNotMatch(SQL, /create (or replace )?function/i);
  assert.doesNotMatch(SQL, /\bgrant\b/i);
  const ramas = SQL.match(/tipo = 'ALUMNA_INSTRUCTORA'[^\n]*/g) ?? [];
  assert.equal(ramas.length, POLITICAS.length);
  for (const rama of ramas) assert.doesNotMatch(rama, /MANAGER|RECEPCION|puede_gestionar_calendario/);
});
