import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pasadaQueLoCoge, primeraPasadaDesde, reintentoAutomatico } from './reintento-automatico.ts';
import { PASADA_COBRO_AUTOMATICO_UTC } from '../billing/dunning.ts';

// «Se reintenta sola el …» tiene que ser lo que hace el cobro automático diario.

const raiz = join(import.meta.dirname, '..', '..');
const d = (iso: string) => new Date(iso);

test('la hora de la pasada es la del cron del cobro automático', () => {
  const fuente = readFileSync(join(raiz, 'lib/inngest/dunning.ts'), 'utf8');
  const m = fuente.match(/id: 'dunning-dispatcher', triggers: \[\{ cron: '(\d+) (\d+) \* \* \*' \}\]/);
  assert.ok(m, 'no encuentro el cron del dispatcher del cobro automático');
  assert.deepEqual({ hora: Number(m[2]), minuto: Number(m[1]) }, { ...PASADA_COBRO_AUTOMATICO_UTC },
    'si cambia la hora del cron, cambia lo que la pantalla promete');
});

test('la pasada coge lo vencido hasta su hora: un segundo después, al día siguiente', () => {
  assert.equal(primeraPasadaDesde(d('2026-10-06T08:00:00Z')).toISOString(), '2026-10-06T08:30:00.000Z');
  assert.equal(primeraPasadaDesde(d('2026-10-06T08:30:00Z')).toISOString(), '2026-10-06T08:30:00.000Z');
  // El reintento se guarda con la hora en que se procesó el fallo, unos segundos después de la pasada.
  assert.equal(primeraPasadaDesde(d('2026-10-06T08:30:15Z')).toISOString(), '2026-10-07T08:30:00.000Z');
  assert.equal(primeraPasadaDesde(d('2026-10-31T23:59:00Z')).toISOString(), '2026-11-01T08:30:00.000Z', 'cambia de mes');
});

test('un reintento ya vencido que la pasada de hoy no cogió espera a la siguiente', () => {
  // Hoy a las 07:00 aún no ha pasado: lo coge la de hoy.
  assert.equal(pasadaQueLoCoge(d('2026-10-05T08:30:10Z'), d('2026-10-06T07:00:00Z')).toISOString(), '2026-10-06T08:30:00.000Z');
  // A las 12:00 la de hoy ya pasó (y no lo cogió): mañana.
  assert.equal(pasadaQueLoCoge(d('2026-10-05T08:30:10Z'), d('2026-10-06T12:00:00Z')).toISOString(), '2026-10-07T08:30:00.000Z');
  // Futuro: la primera pasada desde el reintento.
  assert.equal(pasadaQueLoCoge(d('2026-10-09T08:30:10Z'), d('2026-10-06T12:00:00Z')).toISOString(), '2026-10-10T08:30:00.000Z');
});

const RECIBO = { estado: 'PENDIENTE', proximoReintento: '2026-10-09T08:30:10Z', trasCancelarCuota: null } as const;
const TARJETA = { stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1', tarjetaExpMes: 5, tarjetaExpAnio: 2027 };
const AHORA = d('2026-10-06T12:00:00Z');
const base = { recibo: RECIBO, cuota: { estado: 'ACTIVA' }, estudioConStripe: true, clienta: TARJETA, ahora: AHORA };

test('se cobra sola: con su tarjeta, el día de la pasada que lo coge', () => {
  assert.deepEqual(reintentoAutomatico(base), { tipo: 'SE_COBRA_SOLO', cuando: d('2026-10-10T08:30:00Z'), metodo: 'TARJETA' });
  // Domiciliación de Stripe preferida.
  const sepa = reintentoAutomatico({ ...base, clienta: { ...TARJETA, metodoPagoPreferido: 'SEPA', sepaPaymentMethodId: 'pm_sepa' } });
  assert.equal(sepa?.tipo === 'SE_COBRA_SOLO' && sepa.metodo, 'SEPA');
  // Sin caducidad guardada (Link, o aún sin rellenar): no se afirma que caduque.
  assert.equal(reintentoAutomatico({ ...base, clienta: { stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_link' } })?.tipo, 'SE_COBRA_SOLO');
  // Recibo sin cuota (matrícula, penalización).
  assert.equal(reintentoAutomatico({ ...base, cuota: null })?.tipo, 'SE_COBRA_SOLO');
});

test('sin reintento programado no hay nada que decir', () => {
  assert.equal(reintentoAutomatico({ ...base, recibo: { ...RECIBO, proximoReintento: null } }), null);
});

test('lo que NO se cobrará solo, aunque tenga un reintento programado, y por qué', () => {
  const motivo = (o: Partial<typeof base>) => {
    const r = reintentoAutomatico({ ...base, ...o });
    return r?.tipo === 'NO_SE_COBRA_SOLO' ? r.motivo : r?.tipo;
  };
  assert.match(motivo({ cuota: { estado: 'PAUSADA' } }) ?? '', /congelada/);
  assert.match(motivo({ cuota: { estado: 'CANCELADA' } }) ?? '', /cancelada/);
  assert.match(motivo({ recibo: { ...RECIBO, trasCancelarCuota: 'SIN_REINTENTOS' } }) ?? '', /no reintentarlo/);
  assert.match(motivo({ estudioConStripe: false }) ?? '', /no tiene conectados los cobros con tarjeta/);
  assert.match(motivo({ clienta: {} }) ?? '', /no tiene tarjeta ni domiciliación/);
  assert.match(motivo({ clienta: { ...TARJETA, stripeCustomerId: null } }) ?? '', /no tiene tarjeta ni domiciliación/, 'sin cliente de Stripe no hay cobro sin ella');
  // Tarjeta 09/2026: el 10 de octubre ya no vale.
  assert.match(motivo({ clienta: { ...TARJETA, tarjetaExpMes: 9, tarjetaExpAnio: 2026 } }) ?? '', /caducada: fallará/);
});

test('cuota cancelada con «seguir reintentando»: sí se cobra sola', () => {
  assert.equal(reintentoAutomatico({ ...base, cuota: { estado: 'CANCELADA' }, recibo: { ...RECIBO, trasCancelarCuota: 'REINTENTAR' } })?.tipo, 'SE_COBRA_SOLO');
});

test('sin sus datos de pago no se afirma nada', () => {
  assert.deepEqual(reintentoAutomatico({ ...base, clienta: null }), { tipo: 'NO_SE_SABE' });
});
