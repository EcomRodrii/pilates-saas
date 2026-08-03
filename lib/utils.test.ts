// Tests de los formateadores de fecha/hora DEL ESTUDIO. Runner nativo: `npm test`.
//
// Por qué existen: la cadena que se le manda a una alumna ("tu clase es el
// sábado a las 09:00") se construía a mano en cinco sitios del panel, y solo
// UNA de las copias pasaba `timeZone`. Resultado: editar una serie mandaba la
// hora del estudio y editar esa misma clase suelta mandaba la del navegador de
// quien estaba editando. Mismo aviso, dos horas distintas.
//
// Estos tests fijan lo que importa: el resultado NO depende de la zona horaria
// de la máquina que ejecuta el código, solo del instante. Por eso se comprueban
// las dos mitades del año — en verano Madrid es UTC+2 y en invierno UTC+1, así
// que un formateo que ignorase la zona fallaría en al menos uno de los dos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuandoEstudio, fechaLargaEstudio, horaEstudio, TZ_ESTUDIO, formatEuro, inicioDeSemana, finDeSemana, compararVersiones } from './utils.ts';

test('compararVersiones: doble cifra no se ordena como texto', () => {
  assert.ok(compararVersiones('0.10', '0.9') > 0, '0.10 es mayor que 0.9 numéricamente');
  assert.ok(compararVersiones('0.10', '0.2') > 0, '0.10 es mayor que 0.2, aunque "1" < "2" como texto');
});

test('compararVersiones: mayor/menor entre distintas versiones mayores', () => {
  assert.ok(compararVersiones('1.0', '0.99') > 0);
  assert.ok(compararVersiones('0.92', '0.93') < 0);
});

test('compararVersiones: iguales da 0', () => {
  assert.equal(compararVersiones('1.0.3', '1.0.3'), 0);
});

test('compararVersiones: componentes de más se tratan como 0', () => {
  assert.equal(compararVersiones('1.0.0', '1.0'), 0);
  assert.ok(compararVersiones('1.0.1', '1.0') > 0);
});

test('la zona del estudio es la peninsular', () => {
  assert.equal(TZ_ESTUDIO, 'Europe/Madrid');
});

test('verano: 13:00 UTC son las 15:00 en el estudio (UTC+2)', () => {
  assert.equal(horaEstudio('2026-08-08T13:00:00+00:00'), '15:00');
});

test('invierno: 13:00 UTC son las 14:00 en el estudio (UTC+1)', () => {
  assert.equal(horaEstudio('2026-01-15T13:00:00+00:00'), '14:00');
});

test('acepta las dos formas de escribir el mismo instante (Postgres y toISOString)', () => {
  // Postgres devuelve "+00:00" y `Date.toISOString()` devuelve "Z": misma hora.
  assert.equal(
    horaEstudio('2026-08-08T13:00:00+00:00'),
    horaEstudio('2026-08-08T13:00:00.000Z'),
  );
});

test('el día es el del estudio, no el de UTC', () => {
  // 23:30 UTC del 7 de agosto ya es día 8 en Madrid (UTC+2).
  assert.equal(fechaLargaEstudio('2026-08-07T23:30:00+00:00'), 'sábado, 8 de agosto');
});

test('cuandoEstudio compone fecha y hora del estudio', () => {
  assert.equal(cuandoEstudio('2026-08-08T07:00:00+00:00'), 'sábado, 8 de agosto a las 09:00');
});

test('acepta Date además de cadena (los llamadores usan las dos)', () => {
  assert.equal(
    cuandoEstudio(new Date('2026-08-08T07:00:00+00:00')),
    cuandoEstudio('2026-08-08T07:00:00+00:00'),
  );
});

// ── formatEuro ───────────────────────────────────────────────────────────────
// Por qué existen: el panel de Cobros y el email de justificante de pago
// formateaban el dinero a mano con `toLocaleString('es-ES', {
// minimumFractionDigits: 2 })`. Sin `maximumFractionDigits`, Intl usa 3 por
// defecto, así que "Media por cliente" salía como "249,235 €" — un importe con
// tres decimales, que además se lee como doscientos cuarenta y nueve mil. Estos
// tests fijan el contrato para que reutilizar el helper siga siendo lo correcto.

test('formatEuro redondea siempre a dos decimales', () => {
  // El caso real que se vio en producción.
  assert.equal(formatEuro(249.235), '249,24 €');
  assert.equal(formatEuro(10.999), '11,00 €');
  assert.equal(formatEuro(1 / 3), '0,33 €');
});

test('formatEuro completa siempre los dos decimales', () => {
  assert.equal(formatEuro(22), '22,00 €');
  assert.equal(formatEuro(85.5), '85,50 €');
  assert.equal(formatEuro(0), '0,00 €');
});

test('formatEuro usa coma decimal y punto de millar (formato español)', () => {
  assert.equal(formatEuro(3240.05), '3240,05 €');
  assert.equal(formatEuro(1234567.891), '1.234.567,89 €');
});

test('formatEuro respeta los importes negativos (devoluciones)', () => {
  assert.equal(formatEuro(-64), '-64,00 €');
});

// ── Semanas ──────────────────────────────────────────────────────────────────
// Por qué existen: el lunes de la semana estaba calculado a mano en tres
// pantallas. La del dashboard hacía `getDate() - getDay() + 1`, que funciona de
// lunes a sábado y el DOMINGO suma un día: la ventana pasaba a ser la semana
// siguiente y "hoy" quedaba fuera. Los domingos mostraba 0% de ocupación con las
// clases del día llenas.
//
// Por eso se recorren los SIETE días: un cálculo roto solo en domingo pasa
// desapercibido seis de cada siete veces.

// 2026-08-03 es lunes; del 3 al 9 de agosto de 2026 es una semana natural.
const LUNES = '2026-08-03';

test('inicioDeSemana: cualquier día de la semana devuelve SU lunes', () => {
  const dias = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
                '2026-08-07', '2026-08-08', '2026-08-09'];
  for (const dia of dias) {
    const inicio = inicioDeSemana(`${dia}T12:00:00`);
    assert.equal(
      `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`,
      LUNES,
      `${dia} debería caer en la semana del ${LUNES}`,
    );
  }
});

test('inicioDeSemana: el domingo NO salta a la semana siguiente (el bug)', () => {
  // 2026-08-09 es domingo. El cálculo roto devolvía el lunes 10.
  const inicio = inicioDeSemana('2026-08-09T12:00:00');
  assert.equal(inicio.getDate(), 3);
  assert.equal(inicio.getMonth(), 7); // agosto
});

test('inicioDeSemana: deja la hora a medianoche', () => {
  const inicio = inicioDeSemana('2026-08-05T17:42:13');
  assert.equal(inicio.getHours(), 0);
  assert.equal(inicio.getMinutes(), 0);
  assert.equal(inicio.getSeconds(), 0);
});

test('inicioDeSemana: cruza el cambio de mes hacia atrás', () => {
  // Miércoles 2026-07-01 → su lunes es el 29 de junio.
  const inicio = inicioDeSemana('2026-07-01T09:00:00');
  assert.equal(inicio.getDate(), 29);
  assert.equal(inicio.getMonth(), 5); // junio
});

test('finDeSemana: el domingo de esa misma semana, al final del día', () => {
  const fin = finDeSemana('2026-08-05T09:00:00');
  assert.equal(fin.getDate(), 9);
  assert.equal(fin.getDay(), 0); // domingo
  assert.equal(fin.getHours(), 23);
});

test('finDeSemana: en domingo devuelve HOY, no el domingo que viene', () => {
  const fin = finDeSemana('2026-08-09T12:00:00');
  assert.equal(fin.getDate(), 9);
});

test('la semana contiene siempre a la fecha de partida', () => {
  // La propiedad que de verdad importa: hoy nunca puede quedar fuera de "esta semana".
  for (const dia of ['2026-08-03', '2026-08-06', '2026-08-09', '2026-07-01', '2027-01-03']) {
    const hoy = new Date(`${dia}T12:00:00`);
    assert.ok(inicioDeSemana(hoy) <= hoy, `${dia}: el inicio de semana quedó en el futuro`);
    assert.ok(finDeSemana(hoy) >= hoy, `${dia}: el fin de semana quedó en el pasado`);
  }
});
