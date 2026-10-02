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
