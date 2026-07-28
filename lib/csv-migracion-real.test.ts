import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, detectarDelimitador, parsearSaldoBono,
  validarFilasMembresia, autoMapearMembresia, autoMapear,
  type CampoMembresia,
} from './csv.ts';

// Lo que rompe de verdad el día de la migración, no lo que rompe en un CSV de
// laboratorio. Todos estos casos salieron de mirar exports reales de Momence y
// de Excel en español.

// ── El saldo del bono es dinero ───────────────────────────────────────────────
//
// `Number()` a secas daba NaN con todo lo que no fuera un entero pelado, y eso
// acababa en `null`. El servidor lee `null` como «el CSV no traía saldo» y
// rellena con el bono ENTERO del catálogo: una clienta con 4 sesiones escritas
// «4 de 10» entraba con 10. Sobre 850 clientas son cientos de clases regaladas,
// y no se descubre hasta que se agotan.

test('el saldo se entiende escrito como lo escribe la gente', () => {
  assert.equal(parsearSaldoBono('4'), 4);
  assert.equal(parsearSaldoBono('4,0'), 4, 'coma decimal española');
  assert.equal(parsearSaldoBono('4.0'), 4);
  assert.equal(parsearSaldoBono('4 de 10'), 4, 'se queda con el saldo, no con el total');
  assert.equal(parsearSaldoBono('4/10'), 4);
  assert.equal(parsearSaldoBono('10 sesiones'), 10);
  assert.equal(parsearSaldoBono('10 credits'), 10);
  assert.equal(parsearSaldoBono(' 7 '), 7);
});

test('celda vacía es "sin saldo": ahí SÍ vale caer al bono del plan', () => {
  assert.equal(parsearSaldoBono(''), null);
  assert.equal(parsearSaldoBono('   '), null);
});

test('"ilimitado" no es un saldo ilegible: es una cuota mensual sin tope', () => {
  // Confundirlo con un error tumbaría la importación de TODAS las mensualidades.
  for (const s of ['ilimitado', 'Ilimitada', 'unlimited', 'sin límite', 'N/A', '-']) {
    assert.equal(parsearSaldoBono(s), null, s);
  }
});

test('un saldo que no sabemos leer NO se convierte en el bono entero', () => {
  // Es la regla de fondo: nunca inventar un saldo. Mejor una fila que la dueña
  // revisa que una clienta con sesiones de más que nadie ha decidido darle.
  assert.ok(Number.isNaN(parsearSaldoBono('pendiente') as number));
  assert.ok(Number.isNaN(parsearSaldoBono('???') as number));
});

test('la fila con saldo ilegible se marca error y dice qué escribir', () => {
  const m: Record<CampoMembresia, number> = {
    email: 0, plan: 1, sesiones: 2, fecha_inicio: -1, fecha_fin: -1, estado: -1,
  };
  const filas = validarFilasMembresia([
    ['ana@b.com', 'Bono 10', '4 de 10'],   // ahora se entiende
    ['eva@b.com', 'Bono 10', 'pendiente'], // ilegible → error, no bono entero
    ['sol@b.com', 'Mensual', 'ilimitado'], // sin saldo → ok
  ], m);

  assert.equal(filas[0].estado, 'ok');
  assert.equal(filas[0].datos.sesiones, 4);

  assert.equal(filas[1].estado, 'error');
  assert.match(filas[1].motivo!, /saldo/i);
  assert.match(filas[1].motivo!, /pendiente/, 'dice el valor que no entendió');

  assert.equal(filas[2].estado, 'ok');
  assert.equal(filas[2].datos.sesiones, null);
});

// ── El Excel español con título ───────────────────────────────────────────────
//
// `parseCsv` ya sabía saltarse un preámbulo para encontrar la cabecera, pero la
// detección del delimitador miraba la PRIMERA línea del archivo —el título, sin
// `;`— y elegía la coma. Todo el CSV acababa en una sola columna, el archivo se
// quedaba sin clasificar, y sin ninguna pista de por qué.

test('un título antes de la cabecera ya no rompe el separador ;', () => {
  const csv = 'Listado de clientas 2026\n\nNombre;Apellidos;Email\nMaría;Soler;maria@gmail.com\n';
  const r = parseCsv(csv);
  assert.deepEqual(r.headers, ['Nombre', 'Apellidos', 'Email']);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0][2], 'maria@gmail.com');
});

test('ni aunque el título lleve una coma suelta', () => {
  // El caso que ganaba antes: una coma en el título vencía a tres `;` reales.
  const csv = 'Listado de clientas, 2026\n\nNombre;Apellidos;Email\nNúria;Bonet;nuria@gmail.com\n';
  assert.equal(detectarDelimitador(csv), ';');
  const r = parseCsv(csv);
  assert.deepEqual(r.headers, ['Nombre', 'Apellidos', 'Email']);
});

test('un CSV normal con comas sigue detectándose igual', () => {
  assert.equal(detectarDelimitador('Nombre,Apellidos,Email\nAna,Ruiz,a@b.com'), ',');
});

// ── La basura que Excel mete entre el título y la cabecera ────────────────────

test('una fila de solo separadores no se toma como cabecera', () => {
  // `;;;;;` tiene el ancho correcto pero está vacía, así que "encajaba" y se
  // tomaba como cabecera: todas las columnas salían sin nombre y el archivo no
  // mapeaba ni un campo. Es la forma exacta que tiene un export de Excel.
  const csv = 'Listado de clientas - Momence export\n;;;;;\nfirstName;lastName;email\nMaría;Soler;maria@example.com\n';
  const r = parseCsv(csv);
  assert.deepEqual(r.headers, ['firstName', 'lastName', 'email']);
  assert.equal(r.rows.length, 1);
});

// ── Un identificador ajeno no puede acabar en un campo fiscal ─────────────────

test('el memberId de Momence NO se mete en el NIF', () => {
  // El sinónimo `id` del NIF casaba PARCIAL con `memberId` y guardaba "M-10234"
  // como NIF. Es un campo fiscal: sale en las facturas. Y no daba ningún error
  // porque el NIF no es obligatorio.
  const m = autoMapear(['firstName', 'lastName', 'email', 'memberId']);
  assert.equal(m.nif, -1, 'memberId no es un NIF');
  assert.equal(m.nombre, 0);
  assert.equal(m.email, 2);
});

test('pero una columna que SÍ es el NIF sigue mapeando', () => {
  // El arreglo restringe los sinónimos cortos a coincidencia exacta; los largos
  // y los exactos tienen que seguir funcionando.
  assert.equal(autoMapear(['Nombre', 'Email', 'NIF']).nif, 2);
  assert.equal(autoMapear(['Nombre', 'Email', 'DNI']).nif, 2);
  assert.equal(autoMapear(['Nombre', 'Email', 'Documento de identidad']).nif, 2);
});

test('las cabeceras camelCase de Momence siguen mapeando', () => {
  // Regresión: el arreglo del delimitador no puede haber tocado el auto-mapeo.
  const r = parseCsv('email,membershipName,creditsRemaining\nana@b.com,10 Class Pack,"4,0"');
  const m = autoMapearMembresia(r.headers);
  assert.ok(m.email >= 0 && m.plan >= 0 && m.sesiones >= 0);
  assert.equal(validarFilasMembresia(r.rows, m)[0].datos.sesiones, 4);
});
