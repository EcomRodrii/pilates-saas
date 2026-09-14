import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: la purga de un estudio vencido no deja vivo el motivo de
// las bajas y ausencias del equipo.
//
// `purgar_estudio_vencido` anonimiza `instructores` con UPDATE, así que el
// `on delete cascade` de sus tablas hijas no actúa nunca: lo que no borre la
// propia función sobrevive. Ese texto lo escribe la instructora (o el estudio
// sobre ella) y a veces habla de su salud. Si uno de estos falla, no se quita:
// se vuelve a meter la tabla en la purga.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const migraciones = readdirSync(MIGRACIONES)
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((n) => ({ nombre: n, sql: sinComentarios(readFileSync(join(MIGRACIONES, n), 'utf8')).toLowerCase() }));

// La definición vigente es la de la ÚLTIMA migración que la crea.
const ultima = migraciones.filter((m) => /create or replace function public\.purgar_estudio_vencido\s*\(/.test(m.sql)).at(-1);
assert.ok(ultima, 'no hay ninguna migración que defina purgar_estudio_vencido');
const cuerpo = ultima.sql.slice(ultima.sql.indexOf('function public.purgar_estudio_vencido'));
const funcion = cuerpo.slice(0, cuerpo.indexOf('\n$$;'));
const cBorrar = funcion.match(/c_borrar constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? '';
const tablasBorradas = new Set([...cBorrar.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

test('la purga borra las bajas y las ausencias del equipo', () => {
  assert.ok(tablasBorradas.size > 0, `no se encuentra c_borrar en ${ultima.nombre}`);
  assert.ok(tablasBorradas.has('bajas_instructora'), `${ultima.nombre}: falta bajas_instructora en c_borrar`);
  assert.ok(tablasBorradas.has('instructora_ausencias'), `${ultima.nombre}: falta instructora_ausencias en c_borrar`);
});

test('la purga vacía el motivo de las sustituciones, que se conservan', () => {
  const enEjecucion = funcion.slice(funcion.lastIndexOf('if p_ejecutar then'));
  assert.match(
    enEjecucion,
    /update public\.sustituciones set motivo = null where studio_id = p_studio_id/,
    `${ultima.nombre}: la purga ya no vacía sustituciones.motivo`,
  );
});

test('toda tabla que cuelga de instructores con un motivo o nota libre entra en la purga', () => {
  // El UPDATE de instructores no dispara ningún cascade: una tabla nueva con
  // texto libre sobre la instructora hay que añadirla a mano a la purga.
  const vaciadasEnSitio = new Set(['sustituciones']);
  const huerfanas: string[] = [];
  for (const { nombre, sql } of migraciones) {
    for (const [, tabla, columnas] of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\s*\);/g)) {
      const cuelga = /references (?:public\.)?instructores\s*\(/.test(columnas);
      const textoLibre = /^\s*(motivo|nota_estudio)\s+text\b/m.test(columnas);
      if (cuelga && textoLibre && !tablasBorradas.has(tabla) && !vaciadasEnSitio.has(tabla)) {
        huerfanas.push(`${tabla} (${nombre})`);
      }
    }
  }
  assert.deepEqual(huerfanas, [], 'tablas con texto libre sobre la instructora que la purga no limpia');
});
