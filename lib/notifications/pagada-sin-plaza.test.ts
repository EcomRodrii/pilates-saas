import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avisoLlevaALaFicha, dedupKeyPagadaSinPlaza, SITUACION_PAGADA_SIN_PLAZA } from './pagada-sin-plaza.ts';
import { EVENTOS, plantillaDe, render } from './catalog.ts';

// `uq_notification_dedup (studio_id, dedup_key)` decide si un aviso de dinero
// EXISTE: dos avisos con la misma clave son uno, y el segundo se descarta en
// silencio. Aquí se fija qué clave lleva cada situación de «cobrado sin plaza».

const base = { sesionId: 'ses-1', socioId: 'soc-1' };

test('ya-tenia-reserva: dos pagos distintos de la misma socia y clase dan DOS avisos', () => {
  const a = dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...base, paymentIntentId: 'pi_A' });
  const b = dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...base, paymentIntentId: 'pi_B' });
  assert.notEqual(a, b, 'con la clave por (sesión, socia) el segundo pago a devolver desaparecía');
});

test('ya-tenia-reserva: el MISMO pago repetido (webhook + conciliador) da UN aviso', () => {
  assert.equal(
    dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...base, paymentIntentId: 'pi_A' }),
    dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...base, paymentIntentId: 'pi_A' }),
  );
});

test('ya-tenia-reserva sin pago conocido cae a (sesión, socia), nunca a una clave vacía', () => {
  assert.equal(dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...base, paymentIntentId: null }), 'reserva-pagada-ya-tenia:ses-1:soc-1');
});

test('las situaciones de siempre conservan su clave EXACTA: cambiarla repetiría avisos ya enviados', () => {
  // Aunque llegue el pago, estas siguen por (sesión, socia).
  const conPago = { ...base, paymentIntentId: 'pi_A' };
  assert.equal(dedupKeyPagadaSinPlaza('sin-reserva', conPago), 'reserva-pagada-sin-plaza:ses-1:soc-1');
  assert.equal(dedupKeyPagadaSinPlaza('en-espera', conPago), 'reserva-pagada-en-espera:ses-1:soc-1');
  assert.equal(dedupKeyPagadaSinPlaza('cerrada', conPago), 'espera-sin-plaza-cerrada:ses-1:soc-1');
});

test('cada situación tiene su propio prefijo de clave: ninguna se traga a otra', () => {
  const prefijos = Object.values(SITUACION_PAGADA_SIN_PLAZA).map(s => s.dedup);
  assert.equal(new Set(prefijos).size, prefijos.length);
});

test('ya-tenia-reserva: el aviso dice que el pago no se usó y lleva a la ficha (donde se devuelve)', () => {
  const pl = plantillaDe(EVENTOS.RESERVA_PAGADA_SIN_PLAZA, 'RECEPCION')!;
  const texto = render(pl.body, {
    socia: 'Una socia', clase: 'Reformer', cuando: 'el martes',
    situacion: SITUACION_PAGADA_SIN_PLAZA['ya-tenia-reserva'].texto,
  });
  assert.match(texto, /ya tenía plaza/);
  assert.match(texto, /no se ha usado/);
  assert.equal(avisoLlevaALaFicha('ya-tenia-reserva'), true);
  assert.equal(pl.deepLink!({ sesionId: 'ses-1', socioId: 'soc-1', aLaFicha: true }), '/clientas/soc-1');
  // Las que aún pueden acabar en plaza siguen yendo al calendario.
  assert.equal(avisoLlevaALaFicha('sin-reserva'), false);
  assert.equal(avisoLlevaALaFicha('en-espera'), false);
  assert.equal(pl.deepLink!({ sesionId: 'ses-1', socioId: 'soc-1', aLaFicha: false }), '/calendario?sesion=ses-1');
});

test('emitirReservaPagadaSinPlaza usa la clave de este módulo, no una construida a mano', () => {
  const emit = readFileSync(join(import.meta.dirname, 'emit.ts'), 'utf8');
  const cuerpo = emit.slice(emit.indexOf('export async function emitirReservaPagadaSinPlaza('));
  const fin = cuerpo.indexOf('\n}\n');
  assert.match(cuerpo.slice(0, fin), /dedupKey: dedupKeyPagadaSinPlaza\(situacion, p\)/);
});
