import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarArchivos } from './analizador.ts';

// Sin clave de IA: estos tests cubren el camino DETERMINISTA (auto-mapeo por
// sinónimos) y la degradación a "sin clasificar" — la IA es fallback opcional.
delete process.env.ANTHROPIC_API_KEY;

const CTX = { planes: ['Bono 10'], instructores: ['Ana'], salas: ['Sala Reformer'], servicios: [] };

test('clasifica un export de clientas y valida todas las filas', async () => {
  const csv = 'Nombre;Apellidos;Email;Teléfono\nMaría;Soler;maria@test.com;600111222\nNora;Ruiz;nora@test.com;600333444\n';
  const plan = await analizarArchivos([{ nombre: 'clientas.csv', contenido: csv }], CTX);
  const a = plan.archivos[0];
  assert.equal(a.entidad, 'socias');
  assert.equal(a.origen, 'auto');
  assert.equal(a.ok, 2);
  assert.equal(a.errores, 0);
  assert.equal(a.confianza, 1);
  assert.equal((a.muestra[0] as { email: string }).email, 'maria@test.com');
  assert.deepEqual(plan.orden, ['socias']);
});

test('filas malas van a cuarentena con motivo, nunca se descartan en silencio', async () => {
  const csv = 'Nombre;Email\nMaría;maria@test.com\nSinEmail;\nOtra;maria@test.com\n';
  const plan = await analizarArchivos([{ nombre: 'clientas.csv', contenido: csv }], CTX);
  const a = plan.archivos[0];
  assert.equal(a.entidad, 'socias');
  assert.equal(a.ok, 1);
  assert.equal(a.errores + a.duplicadas, 2);
  assert.equal(a.cuarentena.length, 2);
  assert.ok(a.cuarentena.every(c => c.motivo.length > 0));
});

test('membresías con plan inexistente generan aviso de contexto', async () => {
  const csv = 'Email;Plan;Sesiones\nmaria@test.com;Bono 20;20\n';
  const plan = await analizarArchivos([{ nombre: 'bonos.csv', contenido: csv }], CTX);
  const a = plan.archivos[0];
  assert.equal(a.entidad, 'membresias');
  assert.ok(a.avisos.some(av => av.includes('bono 20')));
});

test('formato irreconocible queda sin clasificar (decide el humano)', async () => {
  const csv = 'colA;colB;colC\nx;y;z\n1;2;3\n';
  const plan = await analizarArchivos([{ nombre: 'misterio.csv', contenido: csv }], CTX);
  const a = plan.archivos[0];
  assert.equal(a.entidad, null);
  assert.ok(a.avisos[0].length > 0);
});

test('membresías sin archivo de clientas → aviso global; orden respeta dependencias', async () => {
  const socias = 'Nombre;Email\nMaría;maria@test.com\n';
  const bonos = 'Email;Plan\nmaria@test.com;Bono 10\n';
  const plan = await analizarArchivos(
    [{ nombre: 'bonos.csv', contenido: bonos }, { nombre: 'clientas.csv', contenido: socias }],
    CTX,
  );
  assert.deepEqual(plan.orden, ['socias', 'membresias']);
  assert.equal(plan.avisos.length, 0);

  const soloBonos = await analizarArchivos([{ nombre: 'bonos.csv', contenido: bonos }], CTX);
  assert.ok(soloBonos.avisos.some(a => a.includes('clientas')));
});
