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

// El caso que perdía los bonos: Momence/Timp/Eversports exportan la clienta y
// su bono en la MISMA fila. Antes ganaba "socias" y las columnas del bono se
// tiraban en silencio → 850 clientas y 0 bonos, con el acta en verde.
test('un CSV con clienta Y bono en la misma fila importa las dos cosas', async () => {
  const csv =
    'First Name;Last Name;Email;Phone;Membership;Credits Remaining;Expiry Date;Status\n' +
    'Nora;Ruiz;nora@test.com;611333444;Bono 10;4;14/09/2026;Active\n' +
    'Lucía;García;lucia@test.com;622555666;Bono 10;9;20/10/2026;Active\n';
  const plan = await analizarArchivos([{ nombre: 'momence.csv', contenido: csv }], { ...CTX, planes: ['Bono 10'] });

  const socias = plan.archivos.find(a => a.entidad === 'socias');
  const bonos = plan.archivos.find(a => a.entidad === 'membresias');
  assert.ok(socias, 'debe seguir detectando las clientas');
  assert.ok(bonos, 'debe detectar además los bonos del mismo archivo');
  assert.equal(socias.ok, 2);
  assert.equal(bonos.ok, 2);

  // Da igual cuál gane como principal: las dos deben resolver al mismo archivo
  // subido, y la derivada llevar nombre propio para no pisar los ajustes
  // manuales de la otra.
  assert.equal(plan.archivos.length, 2);
  assert.notEqual(socias.nombre, bonos.nombre);
  for (const a of [socias, bonos]) assert.equal(a.origenNombre ?? a.nombre, 'momence.csv');
  assert.equal(plan.archivos.filter(a => a.origenNombre).length, 1, 'solo una es derivada');

  // Y trae el saldo y la caducidad reales, no los del catálogo.
  const primera = bonos.muestra[0] as { sesiones: number | null; fechaFin: string | null };
  assert.equal(primera.sesiones, 4);
  assert.ok(primera.fechaFin, 'la fecha de caducidad no puede perderse');

  // Las clientas se crean antes de colgarles el bono.
  assert.deepEqual(plan.orden, ['socias', 'membresias']);
});

test('avisa de las columnas que no se importan, en vez de tirarlas en silencio', async () => {
  const csv = 'Nombre;Email;Observaciones internas;Nº de taquilla\nMaría;maria@test.com;alergia al látex;14\n';
  const plan = await analizarArchivos([{ nombre: 'clientas.csv', contenido: csv }], CTX);
  const a = plan.archivos.find(x => x.entidad === 'socias');
  assert.ok(a);
  const aviso = a.avisos.find(v => v.includes('No se importan estas columnas'));
  assert.ok(aviso, 'debe avisar de las columnas descartadas');
  assert.ok(aviso.includes('Observaciones internas'));
  assert.ok(aviso.includes('Nº de taquilla'));
});

test('sin columnas propias no inventa una segunda entidad', async () => {
  const csv = 'Nombre;Apellidos;Email;Teléfono\nMaría;Soler;maria@test.com;600111222\n';
  const plan = await analizarArchivos([{ nombre: 'clientas.csv', contenido: csv }], CTX);
  assert.equal(plan.archivos.length, 1);
  assert.equal(plan.archivos[0].entidad, 'socias');
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
