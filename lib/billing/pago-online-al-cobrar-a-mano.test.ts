import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cerrarPagoOnlineAntesDeCobrarAMano, type SesionesDeStripe } from './pago-online-al-cobrar-a-mano.ts';

/** Una sesión de Stripe de mentira: su estado y lo que pasa al cerrarla. */
function sesion(opts: { estado?: string | null; alCerrar?: 'expired' | 'falla' | 'pagada'; consulta?: 'falla' | 'no-existe'; luego?: string }) {
  let estado = opts.estado ?? 'open';
  const llamadas = { consultar: 0, cerrar: 0 };
  const stripe: SesionesDeStripe = {
    async consultar() {
      llamadas.consultar++;
      if (opts.consulta === 'no-existe') throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing', statusCode: 404 });
      if (opts.consulta === 'falla') throw new Error('red');
      return { status: estado };
    },
    async cerrar() {
      llamadas.cerrar++;
      if (opts.alCerrar === 'falla') { estado = opts.luego ?? estado; throw new Error('no se pudo'); }
      if (opts.alCerrar === 'pagada') { estado = 'complete'; throw new Error('ya está completa'); }
      estado = 'expired';
      return { status: 'expired' };
    },
  };
  return { stripe, llamadas };
}

test('sin enlace de pago, se cobra sin preguntar a nadie', async () => {
  const { stripe, llamadas } = sesion({});
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano(null, stripe), { tipo: 'SEGUIR' });
  assert.equal(llamadas.consultar, 0);
});

test('abierto: se cierra y se cobra (ya nadie puede pagarlo online)', async () => {
  const { stripe, llamadas } = sesion({ estado: 'open' });
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', stripe), { tipo: 'SEGUIR' });
  assert.equal(llamadas.cerrar, 1);
});

test('ya pagado online: no se cobra otra vez', async () => {
  const { stripe, llamadas } = sesion({ estado: 'complete' });
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', stripe), { tipo: 'YA_PAGADO' });
  assert.equal(llamadas.cerrar, 0);
});

test('lo paga justo entre la consulta y el cierre: no se cobra', async () => {
  const { stripe } = sesion({ estado: 'open', alCerrar: 'pagada' });
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', stripe), { tipo: 'YA_PAGADO' });
});

test('caducado o inexistente en la cuenta: se cobra (si no, el recibo no se cobraría nunca)', async () => {
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', sesion({ estado: 'expired' }).stripe), { tipo: 'SEGUIR' });
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', sesion({ consulta: 'no-existe' }).stripe), { tipo: 'SEGUIR' });
});

test('Stripe no contesta, o no se deja cerrar y sigue abierto: no se cobra', async () => {
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', sesion({ consulta: 'falla' }).stripe), { tipo: 'NO_SE_SABE' });
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', sesion({ estado: 'open', alCerrar: 'falla', luego: 'open' }).stripe), { tipo: 'NO_SE_SABE' });
  // Si al fallar el cierre resulta que ya había caducado, se sigue.
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', sesion({ estado: 'open', alCerrar: 'falla', luego: 'expired' }).stripe), { tipo: 'SEGUIR' });
});

test('sin Stripe en el estudio no hay a quién preguntar: se sigue (si no, no se cobraría nunca)', async () => {
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', null), { tipo: 'SEGUIR' });
});

import { soltarCobroDeMostradorAntesDeCobrarAMano, type CobroDeMostrador, type EstadoCobroMostrador } from './pago-online-al-cobrar-a-mano.ts';

function mostrador(estados: EstadoCobroMostrador[], opts: { soltar?: boolean } = {}) {
  const ll = { consultar: 0, cancelar: 0, soltar: 0 };
  let i = 0;
  const cobro: CobroDeMostrador = {
    async consultar() { ll.consultar++; return estados[Math.min(i++, estados.length - 1)]; },
    async cancelar() { ll.cancelar++; },
    async soltar() { ll.soltar++; return opts.soltar ?? true; },
  };
  return { cobro, ll };
}

test('datáfono abandonado (esperando la tarjeta): se cancela, se suelta y se cobra a mano', async () => {
  const { cobro, ll } = mostrador(['PENDIENTE', 'CANCELADO']);
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', cobro), { tipo: 'SEGUIR' });
  assert.deepEqual(ll, { consultar: 2, cancelar: 1, soltar: 1 });
});

test('datáfono ya cancelado o rechazado: se suelta y se cobra', async () => {
  for (const e of ['CANCELADO', 'EXPIRADO', 'RECHAZADO'] as const) {
    assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', mostrador([e]).cobro), { tipo: 'SEGUIR' }, e);
  }
});

test('datáfono cobrando o ya cobrado, o Stripe sin contestar: no se cobra a mano', async () => {
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', mostrador(['PROCESANDO']).cobro), { tipo: 'EN_MARCHA' });
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', mostrador(['PAGADO']).cobro), { tipo: 'YA_PAGADO' });
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', mostrador(['ERROR']).cobro), { tipo: 'EN_MARCHA' });
  // Lo paga justo al cancelar.
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', mostrador(['PENDIENTE', 'PAGADO']).cobro), { tipo: 'YA_PAGADO' });
  // Cancelado pero no se pudo soltar la referencia (otro la cambió): no se cobra.
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', mostrador(['CANCELADO'], { soltar: false }).cobro), { tipo: 'EN_MARCHA' });
});

test('sin referencia o sin Stripe, se sigue', async () => {
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano(null, mostrador(['PROCESANDO']).cobro), { tipo: 'SEGUIR' });
  assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', null), { tipo: 'SEGUIR' });
});

// ─── Un cobro que sigue ESPERANDO, visto por la alumna que paga online ──────
// A mano se cancela ya (quien cobra está delante). La alumna solo puede darlo por
// abandonado pasado el margen: si no, le cortaría el cobro a la recepcionista.

import { cobroDeMostradorAbandonado, MINUTOS_COBRO_MOSTRADOR_ABANDONADO } from './pago-online-al-cobrar-a-mano.ts';

test('un cobro que sigue esperando NO se cancela si quien pregunta no puede darlo por abandonado', async () => {
  const { cobro, ll } = mostrador(['PENDIENTE']);
  const r = await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', { ...cobro, pendienteCancelable: () => false });
  assert.deepEqual(r, { tipo: 'EN_MARCHA' });
  assert.equal(ll.cancelar, 0, 'no se toca el cobro de quien lo tiene delante');
  assert.equal(ll.soltar, 0);
});

test('abandonado pasado el margen: se cancela, se suelta y se sigue', async () => {
  const { cobro, ll } = mostrador(['PENDIENTE', 'CANCELADO']);
  const r = await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', { ...cobro, pendienteCancelable: () => true });
  assert.deepEqual(r, { tipo: 'SEGUIR' });
  assert.deepEqual(ll, { consultar: 2, cancelar: 1, soltar: 1 });
});

test('un cobro ya terminado sin cobrar se suelta aunque no se pueda cancelar nada', async () => {
  for (const e of ['CANCELADO', 'EXPIRADO', 'RECHAZADO'] as const) {
    const { cobro } = mostrador([e]);
    assert.deepEqual(await soltarCobroDeMostradorAntesDeCobrarAMano('pi_1', { ...cobro, pendienteCancelable: () => false }), { tipo: 'SEGUIR' }, e);
  }
});

test('el margen: sin saber cuándo empezó, no está abandonado; con 30 min, sí', () => {
  const ahora = new Date('2026-10-05T12:00:00.000Z');
  const hace = (min: number) => (ahora.getTime() - min * 60_000) / 1000;
  assert.equal(cobroDeMostradorAbandonado(undefined, ahora), false);
  assert.equal(cobroDeMostradorAbandonado(null, ahora), false);
  assert.equal(cobroDeMostradorAbandonado(hace(MINUTOS_COBRO_MOSTRADOR_ABANDONADO - 1), ahora), false);
  assert.equal(cobroDeMostradorAbandonado(hace(MINUTOS_COBRO_MOSTRADOR_ABANDONADO), ahora), true);
  assert.equal(MINUTOS_COBRO_MOSTRADOR_ABANDONADO >= 30, true, 'el Bizum del mostrador dura 30 min: antes no está abandonado');
});
