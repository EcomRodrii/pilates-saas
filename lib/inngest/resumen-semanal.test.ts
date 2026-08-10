import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanaAnterior, semanaPrevia } from './resumen-semanal-fechas.ts';

// El cron corre los lunes: `hoy` siempre es lunes. La semana que acaba de
// cerrar es el lunes–domingo anterior, no "los últimos 7 días desde hoy".
test('semanaAnterior: un lunes cualquiera devuelve el lunes-domingo justo anterior', () => {
  const { lunes, domingo } = semanaAnterior(new Date('2026-08-10T09:15:00Z')); // lunes
  assert.equal(lunes, '2026-08-03');
  assert.equal(domingo, '2026-08-09');
});

test('semanaAnterior: cruza de mes correctamente', () => {
  const { lunes, domingo } = semanaAnterior(new Date('2026-09-07T09:15:00Z')); // lunes
  assert.equal(lunes, '2026-08-31');
  assert.equal(domingo, '2026-09-06');
});

test('semanaAnterior: el rango son exactamente 7 días', () => {
  const { lunes, domingo } = semanaAnterior(new Date('2026-08-10T09:15:00Z'));
  const dias = (new Date(`${domingo}T00:00:00Z`).getTime() - new Date(`${lunes}T00:00:00Z`).getTime()) / 86400000;
  assert.equal(dias, 6); // lunes a domingo, ambos inclusive = 7 días = 6 de diferencia
});

// semanaPrevia toma el lunes de la semana silenciosa (ya calculado por
// semanaAnterior) y devuelve la semana justo antes de esa — el período de
// comparación de la prueba de ingresos.
test('semanaPrevia: dado el lunes de la semana silenciosa, devuelve la semana justo anterior', () => {
  const { lunes: lunesSilenciosa } = semanaAnterior(new Date('2026-08-10T09:15:00Z')); // 2026-08-03
  const { lunes, domingo } = semanaPrevia(lunesSilenciosa);
  assert.equal(lunes, '2026-07-27');
  assert.equal(domingo, '2026-08-02');
});

test('semanaPrevia: no se solapa con la semana de referencia', () => {
  const lunesRef = '2026-08-03';
  const { domingo } = semanaPrevia(lunesRef);
  assert.ok(domingo < lunesRef);
});

test('semanaPrevia: cruza de mes correctamente', () => {
  const { lunes, domingo } = semanaPrevia('2026-09-07');
  assert.equal(lunes, '2026-08-31');
  assert.equal(domingo, '2026-09-06');
});
