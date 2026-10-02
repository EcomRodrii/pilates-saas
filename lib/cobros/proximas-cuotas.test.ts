import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximasCuotas, textoComoSeCobrara } from './proximas-cuotas.ts';

const PLANES = new Map([
  ['mensual', { tipo: 'MENSUAL', nombre: 'Mensual ilimitado', precio: 89 }],
  ['bono', { tipo: 'BONO', nombre: 'Bono 10', precio: 130 }],
]);
const TARJETA = { stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1', tarjetaExpMes: 5, tarjetaExpAnio: 2027 };
const cuota = (id: string, extra: Record<string, unknown> = {}) => ({ id, socioId: id, planId: 'mensual', estado: 'ACTIVA', fechaFin: '2026-10-31', ...extra });

const base = {
  planes: PLANES,
  clienta: (id: string) => ({ activa: id !== 'baja', pago: id === 'nada' || id === 'remesa' ? {} : id === 'sin-leer' ? null : TARJETA }),
  tieneMandatoVigente: (id: string) => id === 'remesa',
  estudioConStripe: true, estudioHaceRemesas: true, hoy: '2026-10-02',
};

test('solo cuotas mensuales activas de clientas en activo; se cobran el día siguiente al fin', () => {
  const { cuotas, sinFechaDeFin } = proximasCuotas({
    ...base,
    suscripciones: [
      cuota('ana'),
      cuota('bono', { planId: 'bono' }),
      cuota('pausada', { estado: 'PAUSADA' }),
      cuota('baja'),
      cuota('lejos', { fechaFin: '2026-12-15' }),
      cuota('sin-fin', { fechaFin: null }),
      cuota('vencida', { fechaFin: '2026-09-29' }),
    ],
  });
  assert.deepEqual(cuotas.map(c => [c.socioId, c.dia]), [['ana', '2026-11-01']]);
  assert.equal(cuotas[0].importe, 89);
  assert.equal(sinFechaDeFin, 1, 'sin fecha de fin no se renueva sola: se cuenta aparte');
});

test('cómo se cobrará cada una, con lo que hacen de verdad los crons', () => {
  const { cuotas } = proximasCuotas({
    ...base,
    suscripciones: [
      cuota('tarjeta'),
      cuota('caduca', { socioId: 'caduca' }),
      cuota('remesa'),
      cuota('nada'),
      cuota('programada', { bajaAlVencer: true }),
      cuota('sin-leer'),
    ],
    clienta: id => ({
      activa: true,
      pago: id === 'caduca' ? { ...TARJETA, tarjetaExpMes: 10, tarjetaExpAnio: 2026 }
        : id === 'nada' || id === 'remesa' ? {} : id === 'sin-leer' ? null : TARJETA,
    }),
  });
  const como = Object.fromEntries(cuotas.map(c => [c.socioId, c.como]));
  assert.deepEqual(como, {
    tarjeta: 'SOLA_TARJETA',
    caduca: 'TARJETA_CADUCA', // 10/2026 no llega al 1 de noviembre
    remesa: 'REMESA',
    nada: 'A_MANO',
    programada: 'NO_SE_RENUEVA',
    'sin-leer': 'NO_SE_SABE',
  });
});

test('sin Stripe en el estudio no se cobra sola aunque tenga tarjeta; sin cliente de Stripe tampoco', () => {
  const sinStripe = proximasCuotas({ ...base, estudioConStripe: false, estudioHaceRemesas: false, suscripciones: [cuota('ana')] });
  assert.equal(sinStripe.cuotas[0].como, 'A_MANO');
  const sinCliente = proximasCuotas({
    ...base, estudioHaceRemesas: false, suscripciones: [cuota('ana')],
    clienta: () => ({ activa: true, pago: { ...TARJETA, stripeCustomerId: null } }),
  });
  assert.equal(sinCliente.cuotas[0].como, 'A_MANO');
});

test('domiciliación de Stripe preferida: se cobra sola por domiciliación', () => {
  const { cuotas } = proximasCuotas({
    ...base, suscripciones: [cuota('ana')],
    clienta: () => ({ activa: true, pago: { ...TARJETA, metodoPagoPreferido: 'SEPA', sepaPaymentMethodId: 'pm_sepa' } }),
  });
  assert.equal(cuotas[0].como, 'SOLA_DOMICILIACION');
});

test('el fin de mes y el cambio de año', () => {
  const { cuotas } = proximasCuotas({ ...base, hoy: '2026-12-20', suscripciones: [cuota('ana', { fechaFin: '2026-12-31' })] });
  assert.equal(cuotas[0].dia, '2027-01-01');
});

test('cada frase dice lo que va a pasar, también lo malo', () => {
  assert.match(textoComoSeCobrara('TARJETA_CADUCA', '1 nov'), /fallará tres veces y su cuota se cancelará sola/);
  assert.equal(textoComoSeCobrara('REMESA', '1 nov'), 'Irá en la remesa que prepares a partir del 1 nov');
  assert.match(textoComoSeCobrara('A_MANO', '1 nov'), /La cobras tú/);
});
