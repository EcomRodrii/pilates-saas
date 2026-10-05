import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cuotaAunSinVencer, primerDiaDeCobro, renovacionAdoptable, tipoPlanEmbebido } from './renovacion-adoptable.ts';

// Una cuota nunca se cobra antes de su vencimiento. El recibo de renovación de una
// cuota puede nacer antes (la alumna pulsa «Renovar mi plan» con la cuota pausada,
// el estudio lo crea a mano): el cron solo lo adopta para cobrarlo solo cuando la
// cuota ya venció, el mismo criterio con el que él mismo crea su recibo.

const HOY = '2026-10-05';

test('una renovación MENSUAL con la cuota sin vencer NO se adopta (se cobraría adelantada)', () => {
  assert.equal(renovacionAdoptable({ tipoPlan: 'MENSUAL', fechaFin: '2026-10-20' }, HOY), false);
  // El mismo día del vencimiento todavía no: el cron crea el suyo con `fecha_fin < hoy`.
  assert.equal(renovacionAdoptable({ tipoPlan: 'MENSUAL', fechaFin: HOY }, HOY), false);
});

test('una renovación MENSUAL con la cuota ya vencida se adopta, como siempre', () => {
  assert.equal(renovacionAdoptable({ tipoPlan: 'MENSUAL', fechaFin: '2026-10-04' }, HOY), true);
});

test('una cuota sin fecha de fin no se adopta: no hay vencimiento con el que comparar', () => {
  assert.equal(renovacionAdoptable({ tipoPlan: 'MENSUAL', fechaFin: null }, HOY), false);
});

test('sin saber el plan, no se cobra solo; los bonos y las sueltas siguen como antes', () => {
  assert.equal(renovacionAdoptable({ tipoPlan: null, fechaFin: '2026-01-01' }, HOY), false);
  assert.equal(renovacionAdoptable({ tipoPlan: 'BONO', fechaFin: '2026-12-31' }, HOY), true);
  assert.equal(renovacionAdoptable({ tipoPlan: 'PUNTUAL', fechaFin: null }, HOY), true);
});

test('el plan embebido de Supabase llega como objeto o como lista', () => {
  assert.equal(tipoPlanEmbebido({ tipo: 'MENSUAL' }), 'MENSUAL');
  assert.equal(tipoPlanEmbebido([{ tipo: 'BONO' }]), 'BONO');
  assert.equal(tipoPlanEmbebido(null), null);
  assert.equal(tipoPlanEmbebido([]), null);
});

test('la adopción del cron usa la regla, con la fecha de fin y el plan de la cuota', () => {
  const s = readFileSync(join(import.meta.dirname, '..', 'inngest', 'renovaciones.ts'), 'utf8');
  const ini = s.indexOf('async function adoptarRecibosCliente(');
  const cuerpo = s.slice(ini, s.indexOf('async function generarRecibosRenovacion(', ini));
  assert.match(cuerpo, /\.select\('id, estado, baja_al_vencer, fecha_fin, planes_tarifa\(tipo\)'\)/);
  assert.match(cuerpo, /const hoy = nowISO\.slice\(0, 10\);/);
  assert.match(cuerpo, /const datosCuota = \{ tipoPlan: tipoPlanEmbebido\(cuota\.planes_tarifa\), fechaFin: /);
  assert.match(cuerpo, /if \(renovacionAdoptable\(datosCuota, hoy\)\) \{\s*cuandoPorRecibo\.set\(r\.id as string, nowISO\);/);
  // Revisión del 5-oct (#12): sin vencer y con método, se programa para su día (no se
  // deja sin reintento diciendo «no tiene tarjeta»).
  assert.match(cuerpo, /else if \(datosCuota\.tipoPlan === 'MENSUAL' && datosCuota\.fechaFin\) \{\s*cuandoPorRecibo\.set\(r\.id as string, `\$\{primerDiaDeCobro\(datosCuota\.fechaFin\)\}T00:00:00\.000Z`\);/);
  // Y el compare-and-set de siempre, en cada escritura.
  assert.match(cuerpo, /\.update\(\{ proximo_reintento: cuando \}\)[\s\S]*?\.is\('proximo_reintento', null\)\s*\.is\('checkout_session_id', null\)\s*\.is\('tras_cancelar_cuota', null\)/);
  // El mismo «hoy» que usa el generador.
  const gen = s.slice(s.indexOf('async function generarRecibosRenovacion('));
  assert.match(gen, /const hoy = nowISO\.slice\(0, 10\);/);
  assert.match(gen, /\.lt\('fecha_fin', hoy\)/);
});

test('el primer día en que una cuota se puede cobrar sola es el siguiente a su vencimiento', () => {
  assert.equal(primerDiaDeCobro('2026-10-31'), '2026-11-01');
  assert.equal(primerDiaDeCobro('2026-12-31'), '2027-01-01');
  assert.equal(primerDiaDeCobro('2028-02-28'), '2028-02-29');
  // Ese día ya no está «sin vencer»: el cobro automático que se programa ahí sí cobra.
  assert.equal(cuotaAunSinVencer({ tipoPlan: 'MENSUAL', fechaFin: '2026-10-31' }, primerDiaDeCobro('2026-10-31')), false);
  assert.equal(cuotaAunSinVencer({ tipoPlan: 'MENSUAL', fechaFin: '2026-10-31' }, '2026-10-31'), true);
  assert.equal(cuotaAunSinVencer({ tipoPlan: 'BONO', fechaFin: '2026-10-31' }, '2026-10-01'), false);
});
