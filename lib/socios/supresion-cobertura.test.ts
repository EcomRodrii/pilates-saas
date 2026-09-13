import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLASIFICACION_SUPRESION, COLUMNAS_QUE_APUNTAN_A_SOCIA, tablasPorAccion,
} from './supresion-clasificacion.ts';

// Cobertura de la supresión: la lista de qué se borra al dar de baja a una
// socia ya se dejó incompleta dos veces (I-14, H-2). Este test es lo que obliga
// a mirarla cada vez que aparece una tabla nueva con `socio_id`.

const dbTypes = readFileSync(new URL('../db-types.ts', import.meta.url), 'utf8');
const migracion = readFileSync(
  new URL('../../supabase/migrations/20260913170100_anonimizar_socio.sql', import.meta.url), 'utf8');
const cuerpoFuncion = migracion.slice(migracion.indexOf('create or replace function public.anonimizar_socio'));

/** `RowVentasPos` → `ventas_pos` (inverso de `pascal()` en scripts/gen-db-types.py). */
function aSnake(pascal: string): string {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function tablasDeDbTypes(): Map<string, Set<string>> {
  const tablas = new Map<string, Set<string>>();
  for (const m of dbTypes.matchAll(/^export interface Row(\w+) \{\n([\s\S]*?)\n\}/gm)) {
    const columnas = new Set([...m[2].matchAll(/^ {2}(\w+)\??:/gm)].map(c => c[1]));
    tablas.set(aSnake(m[1]), columnas);
  }
  return tablas;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('el parser de db-types ve las tablas con socia (no verde por vacío)', () => {
  const tablas = tablasDeDbTypes();
  assert.ok(tablas.size > 100, `solo ${tablas.size} tablas leídas de db-types`);
  for (const t of ['reservas', 'recibos', 'notas_internas', 'socio_companeras', 'notification']) {
    assert.ok(tablas.has(t), `el parser no encuentra ${t}`);
  }
});

test('toda tabla de db-types con una columna que apunta a una socia está clasificada', () => {
  const sinClasificar: string[] = [];
  for (const [tabla, columnas] of tablasDeDbTypes()) {
    const apunta = COLUMNAS_QUE_APUNTAN_A_SOCIA.some(c => columnas.has(c));
    if (apunta && !(tabla in CLASIFICACION_SUPRESION)) sinClasificar.push(tabla);
  }
  assert.deepEqual(sinClasificar, [],
    `Tablas con datos de una socia sin decidir qué pasa al suprimirla: ${sinClasificar.join(', ')}. `
    + 'Añádelas a lib/socios/supresion-clasificacion.ts y, si no son CONSERVAR, a anonimizar_socio.');
});

test('toda tabla BORRAR/ANONIMIZAR aparece en el cuerpo de anonimizar_socio', () => {
  const ausentes = [...tablasPorAccion('BORRAR'), ...tablasPorAccion('ANONIMIZAR')]
    .filter(t => !new RegExp(`public\\.${escapar(t)}\\b`).test(cuerpoFuncion));
  assert.deepEqual(ausentes, [], `Clasificadas pero la función no las toca: ${ausentes.join(', ')}`);
});

test('la función no borra ni modifica ninguna tabla fiscal ni el registro de accesos', () => {
  const intocables = ['recibos', 'facturas', 'ventas_pos', 'devoluciones', 'pagos_historicos',
    'codigos_descuento_consumos', 'lecturas_ficha_salud'];
  for (const t of intocables) {
    assert.equal(CLASIFICACION_SUPRESION[t]?.accion, 'CONSERVAR', `${t} debería ser CONSERVAR`);
    assert.doesNotMatch(cuerpoFuncion, new RegExp(`(delete\\s+from|update)\\s+public\\.${escapar(t)}\\b`, 'i'),
      `anonimizar_socio escribe en ${t}`);
  }
});

test('la cabecera de la migración documenta todas las tablas clasificadas', () => {
  const cabecera = migracion.slice(0, migracion.indexOf('create or replace function'));
  const sinDocumentar = Object.keys(CLASIFICACION_SUPRESION)
    .filter(t => !new RegExp(`\\b${escapar(t)}\\b`).test(cabecera));
  assert.deepEqual(sinDocumentar, []);
});

test('la función es solo de service_role y lo comprueba al aplicarse', () => {
  const firma = 'public.anonimizar_socio(text, text, uuid, text)';
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(migracion, new RegExp(`revoke all on function ${escapar(firma)} from ${rol};`));
  }
  assert.match(migracion, new RegExp(`grant execute on function ${escapar(firma)} to service_role;`));
  for (const rol of ['anon', 'authenticated', 'service_role']) {
    assert.match(migracion, new RegExp(`has_function_privilege\\('${rol}', '${escapar(firma)}'`));
  }
});
