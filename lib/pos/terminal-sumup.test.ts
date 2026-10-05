import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cobrosParaBarrer, crearProveedorSumup, esDeEste, MINUTOS_ANTES_DE_BARRER, movimientosPorMirar, referenciaExterna, yaNoEsDelMostrador,
} from './terminal-sumup.ts';
import { ErrorSumup, leerReferenciaSumup, sumupPuedeCobrarAqui, type ClienteSumup, type TransaccionSumup } from './sumup.ts';

// El Solo de SumUp detrás del mismo contrato que el datáfono de Stripe. Sin red:
// el cliente es un doble que apunta lo que se le pide.

const T0 = new Date('2026-10-04T10:00:00Z');

function doble(o: {
  transaccion?: TransaccionSumup | null | Error;
  cobrar?: Error;
  terminar?: Error;
} = {}) {
  const llamadas: { metodo: string; args: unknown[] }[] = [];
  const cliente = {
    async emparejarLector() { throw new Error('no se usa'); },
    async estadoLector() { throw new Error('no se usa'); },
    async cobrar(...args: unknown[]) {
      llamadas.push({ metodo: 'cobrar', args });
      if (o.cobrar) throw o.cobrar;
      return { clientTransactionId: 'ctx-abc12345', checkoutId: 'chk-1' };
    },
    async terminar(...args: unknown[]) {
      llamadas.push({ metodo: 'terminar', args });
      if (o.terminar) throw o.terminar;
    },
    async buscarTransaccion(...args: unknown[]) {
      llamadas.push({ metodo: 'buscarTransaccion', args });
      if (o.transaccion instanceof Error) throw o.transaccion;
      return o.transaccion ?? null;
    },
    async devolver() { throw new Error('no se usa'); },
  } as unknown as ClienteSumup;
  return { cliente, llamadas };
}

function proveedor(c: ClienteSumup, ahora = T0) {
  return crearProveedorSumup({
    cliente: c, merchantCode: 'MC1', readerId: 'rdr-1', studioId: 'st-1',
    afiliado: { appId: 'app', key: 'k' },
    urlDeAviso: ref => `https://example.invalid/aviso?${ref.ventaId ? 'v' : 'r'}`,
    ahora: () => ahora,
  });
}

const pagada = (extra: Partial<TransaccionSumup> = {}): TransaccionSumup => ({
  id: 'txn-1', amount: 12.5, currency: 'EUR', status: 'SUCCESSFUL',
  client_transaction_id: 'ctx-abc12345', foreign_transaction_id: 'venta:v-1', ...extra,
});

test('iniciar manda céntimos, la referencia de vuelta y la URL de aviso, y guarda una referencia sumup: fechada', async () => {
  const { cliente, llamadas } = doble();
  const r = await proveedor(cliente).iniciar({ importeCentimos: 1250, concepto: 'Bono 10', ref: { ventaId: 'v-1' } });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.estado, 'PENDIENTE');
  const leida = leerReferenciaSumup(r.referencia);
  assert.equal(leida?.clientTransactionId, 'ctx-abc12345');
  assert.equal(leida?.emitidaEn.getTime(), Math.floor(T0.getTime() / 1000) * 1000);
  const [mc, lector, p] = llamadas[0].args as [string, string, { centimos: number; referenciaExterna: string; returnUrl: string }];
  assert.deepEqual([mc, lector, p.centimos, p.referenciaExterna, p.returnUrl],
    ['MC1', 'rdr-1', 1250, 'venta:v-1', 'https://example.invalid/aviso?v']);
});

test('iniciar: importe raro no llega a SumUp; token caducado y datáfono ocupado se dicen distinto', async () => {
  const { cliente, llamadas } = doble();
  assert.equal((await proveedor(cliente).iniciar({ importeCentimos: 0, concepto: 'x', ref: { ventaId: 'v' } })).ok, false);
  assert.equal((await proveedor(cliente).iniciar({ importeCentimos: 1.5, concepto: 'x', ref: { ventaId: 'v' } })).ok, false);
  assert.equal(llamadas.length, 0);

  const caducado = await proveedor(doble({ cobrar: new ErrorSumup(401, null, 'x') }).cliente)
    .iniciar({ importeCentimos: 100, concepto: 'x', ref: { reciboId: 'r' } });
  assert.match(!caducado.ok ? caducado.error : '', /volver a conectarse/);
  const ocupado = await proveedor(doble({ cobrar: new ErrorSumup(409, null, 'x') }).cliente)
    .iniciar({ importeCentimos: 100, concepto: 'x', ref: { reciboId: 'r' } });
  assert.match(!ocupado.ok ? ocupado.error : '', /otro cobro/);
  const rechazado = await proveedor(doble({ cobrar: new ErrorSumup(422, null, 'x') }).cliente)
    .iniciar({ importeCentimos: 100, concepto: 'x', ref: { reciboId: 'r' } });
  assert.match(!rechazado.ok ? rechazado.error : '', /encendido/);
});

test('⚠️ iniciar sin respuesta clara no se da por «no cobrado» a secas: se para el Solo y se avisa de mirarlo', async () => {
  for (const fallo of [new Error('red'), new ErrorSumup(502, null, 'sin id'), new ErrorSumup(503, null, 'x')]) {
    const { cliente, llamadas } = doble({ cobrar: fallo });
    const r = await proveedor(cliente).iniciar({ importeCentimos: 100, concepto: 'x', ref: { ventaId: 'v' } });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : '', /Mira su pantalla/);
    assert.deepEqual(llamadas.find(l => l.metodo === 'terminar')?.args, ['MC1', 'rdr-1']);
  }
  // Un «no» de SumUp no toca el lector (puede estar con otro cobro).
  const { cliente, llamadas } = doble({ cobrar: new ErrorSumup(409, null, 'x') });
  await proveedor(cliente).iniciar({ importeCentimos: 100, concepto: 'x', ref: { ventaId: 'v' } });
  assert.equal(llamadas.some(l => l.metodo === 'terminar'), false);
});

test('consultar: pagada en euros → PAGADO con importe en céntimos, a quién pertenece y el cargo de SumUp', async () => {
  const { cliente } = doble({ transaccion: pagada() });
  const c = await proveedor(cliente).consultar('sumup:1759572000:ctx-abc12345');
  assert.deepEqual(c, {
    estado: 'PAGADO', importeCentimos: 1250, metadata: { studioId: 'st-1', ventaId: 'v-1' },
    cargoSumup: 'txn-1',
  });
  const recibo = await proveedor(doble({ transaccion: pagada({ foreign_transaction_id: 'recibo:r-9' }) }).cliente)
    .consultar('sumup:1759572000:ctx-abc12345');
  assert.deepEqual(recibo.metadata, { studioId: 'st-1', reciboId: 'r-9' });
});

test('⚠️ consultar nunca da PAGADO a algo que no es este cobro en euros', async () => {
  const ref = 'sumup:1759572000:ctx-abc12345';
  assert.equal((await proveedor(doble({ transaccion: pagada({ currency: 'GBP' }) }).cliente).consultar(ref)).estado, 'ERROR');
  assert.equal((await proveedor(doble({ transaccion: pagada({ client_transaction_id: 'ctx-otro9999' }) }).cliente).consultar(ref)).estado, 'ERROR');
  assert.equal((await proveedor(doble({ transaccion: pagada({ status: 'REFUNDED' }) }).cliente).consultar(ref)).estado, 'ERROR');
  // Sin referencia de vuelta no sabe de quién es: la ruta lo rechazará («no corresponde»).
  assert.deepEqual((await proveedor(doble({ transaccion: pagada({ foreign_transaction_id: null }) }).cliente).consultar(ref)).metadata, {});
  // Una referencia que no es de SumUp no se pregunta.
  const { cliente, llamadas } = doble();
  assert.equal((await proveedor(cliente).consultar('pi_123')).estado, 'ERROR');
  assert.equal(llamadas.length, 0);
});

test('consultar: sin transacción todavía espera; pasado el plazo, EXPIRADO; sin red, PROCESANDO (no se sabe)', async () => {
  const emitida = Math.floor(T0.getTime() / 1000);
  const ref = `sumup:${emitida}:ctx-abc12345`;
  assert.equal((await proveedor(doble().cliente, new Date(T0.getTime() + 30_000)).consultar(ref)).estado, 'PENDIENTE');
  assert.equal((await proveedor(doble().cliente, new Date(T0.getTime() + 600_000)).consultar(ref)).estado, 'EXPIRADO');
  assert.equal((await proveedor(doble({ transaccion: new Error('red') }).cliente).consultar(ref)).estado, 'PROCESANDO');
});

test('consultar: el importe que cuenta es SIN la propina (va dentro de amount)', async () => {
  const c = await proveedor(doble({ transaccion: pagada({ amount: 14.5, tip_amount: 2 }) }).cliente).consultar('sumup:1759572000:ctx-abc12345');
  assert.equal(c.importeCentimos, 1250);
});

test('⚠️ cancelar solo para el Solo si ESTE cobro sigue abierto: si ya acabó, el datáfono puede estar con otro', async () => {
  const emitida = Math.floor(T0.getTime() / 1000);
  const ref = `sumup:${emitida}:ctx-abc12345`;
  for (const status of ['SUCCESSFUL', 'FAILED', 'CANCELLED']) {
    const { cliente, llamadas } = doble({ transaccion: pagada({ status }) });
    await proveedor(cliente).cancelar(ref);
    assert.equal(llamadas.some(l => l.metodo === 'terminar'), false, status);
  }
  // Ni uno que nunca llegó a aparecer, pasado el plazo.
  const expirado = doble();
  await proveedor(expirado.cliente, new Date(T0.getTime() + 600_000)).cancelar(ref);
  assert.equal(expirado.llamadas.some(l => l.metodo === 'terminar'), false);

  for (const transaccion of [null, pagada({ status: 'PENDING' })]) {
    const { cliente, llamadas } = doble({ transaccion });
    await proveedor(cliente).cancelar(ref);
    assert.deepEqual(llamadas.find(l => l.metodo === 'terminar')?.args, ['MC1', 'rdr-1']);
  }
  // Sin respuesta de SumUp no se sabe qué hace el lector: no se para.
  const mudo = doble({ transaccion: new Error('red') });
  await proveedor(mudo.cliente).cancelar(ref);
  assert.equal(mudo.llamadas.some(l => l.metodo === 'terminar'), false);
  // Que SumUp no deje parar no rompe: lo dirá la siguiente consulta.
  await proveedor(doble({ terminar: new Error('ocupado') }).cliente).cancelar(ref);
});

test('referenciaExterna: lo que vuelve en foreign_transaction_id', () => {
  assert.equal(referenciaExterna({ ventaId: 'v-1' }), 'venta:v-1');
  assert.equal(referenciaExterna({ reciboId: 'r-1' }), 'recibo:r-1');
});

test('⚠️ fuera de producción SumUp no cobra salvo que se active a propósito', () => {
  assert.equal(sumupPuedeCobrarAqui({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv), true);
  assert.equal(sumupPuedeCobrarAqui({ VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv), false);
  assert.equal(sumupPuedeCobrarAqui({} as NodeJS.ProcessEnv), false);
  assert.equal(sumupPuedeCobrarAqui({ SUMUP_PERMITIR_FUERA_DE_PRODUCCION: '1' } as NodeJS.ProcessEnv), true);
  assert.equal(sumupPuedeCobrarAqui({ SUMUP_PERMITIR_FUERA_DE_PRODUCCION: 'true' } as NodeJS.ProcessEnv), false);
});

test('⚠️ esDeEste: si SumUp dice que el cobro es de otro objeto u otro estudio, nunca vale', () => {
  const venta = { tipo: 'venta' as const, id: 'v-1' };
  const recibo = { tipo: 'recibo' as const, id: 'r-1' };
  assert.equal(esDeEste({ metadata: { studioId: 'st-1', ventaId: 'v-1' } }, 'st-1', venta, { exigirDueno: true }), true);
  assert.equal(esDeEste({ metadata: { studioId: 'st-1', ventaId: 'v-2' } }, 'st-1', venta, { exigirDueno: false }), false);
  assert.equal(esDeEste({ metadata: { studioId: 'st-1', reciboId: 'v-1' } }, 'st-1', venta, { exigirDueno: false }), false, 'un recibo no es una venta');
  assert.equal(esDeEste({ metadata: { studioId: 'st-2', reciboId: 'r-1' } }, 'st-1', recibo, { exigirDueno: true }), false);
  // Sin dueño dicho por SumUp: solo vale si basta la referencia guardada.
  assert.equal(esDeEste({ metadata: {} }, 'st-1', venta, { exigirDueno: false }), true);
  assert.equal(esDeEste({}, 'st-1', recibo, { exigirDueno: true }), false);
});

test('cobrosParaBarrer: deja al mostrador sus primeros minutos, agrupa por estudio y descarta lo que no es de SumUp', () => {
  const emitida = (minutosAntes: number) => `sumup:${Math.floor(T0.getTime() / 1000) - minutosAntes * 60}:ctx-abc12345`;
  const g = cobrosParaBarrer([
    { tipo: 'venta', id: 'v-1', studioId: 'st-1', referencia: emitida(30) },
    { tipo: 'recibo', id: 'r-1', studioId: 'st-1', referencia: emitida(2) },
    { tipo: 'recibo', id: 'r-2', studioId: 'st-2', referencia: emitida(MINUTOS_ANTES_DE_BARRER) },
    { tipo: 'venta', id: 'v-3', studioId: 'st-2', referencia: 'pi_123' },
    { tipo: 'venta', id: 'v-4', studioId: 'st-2', referencia: null },
  ], T0);
  assert.deepEqual([...g.keys()], ['st-1', 'st-2']);
  assert.deepEqual(g.get('st-1')?.map(c => c.objeto.id), ['v-1']);
  assert.deepEqual(g.get('st-2')?.map(c => [c.objeto.tipo, c.objeto.id, c.minutos]), [['recibo', 'r-2', MINUTOS_ANTES_DE_BARRER]]);
});

test('⚠️ yaNoEsDelMostrador: un SumUp «caducado» a los dos minutos todavía no es de nadie más', () => {
  const emitida = (segundosAntes: number) => `sumup:${Math.floor(T0.getTime() / 1000) - segundosAntes}:ctx-abc12345`;
  // `estadoDesdeSumup` lo da por caducado a los dos minutos sin transacción: puede ser un retraso de SumUp.
  assert.equal(yaNoEsDelMostrador(emitida(2 * 60 + 1), T0), false);
  assert.equal(yaNoEsDelMostrador(emitida(MINUTOS_ANTES_DE_BARRER * 60 - 1), T0), false);
  // Desde el mismo momento en que lo barre el barrido, y no antes.
  assert.equal(yaNoEsDelMostrador(emitida(MINUTOS_ANTES_DE_BARRER * 60), T0), true);
  assert.equal(yaNoEsDelMostrador(emitida(3 * 3600), T0), true);
  // Lo que no es una referencia de SumUp no se da por de nadie.
  assert.equal(yaNoEsDelMostrador('pi_123', T0), false);
  assert.equal(yaNoEsDelMostrador(null, T0), false);
});

test('⚠️ movimientosPorMirar: lo cobrado que nada cerró ni espera, incluida la venta ANULADA que cobró', () => {
  const clave = (t: string) => `sumup-txn:${t}`;
  const sabido = {
    recibosCerrados: new Set(['t-recibo']),
    reconciliados: new Set(['sumup-txn:t-anotado']),
    ventas: new Map<string, string | null>([['c-pagada', 'PAGADA'], ['c-pendiente', 'PENDIENTE_PAGO'], ['c-anulada', 'ANULADA']]),
    recibosEnVuelo: new Set(['c-en-vuelo']),
  };
  const movs = [
    { transaccionId: 't-recibo', clientTransactionId: 'c-1' },
    { transaccionId: 't-anotado', clientTransactionId: 'c-2' },
    { transaccionId: 't-3', clientTransactionId: 'c-pagada' },
    { transaccionId: 't-4', clientTransactionId: 'c-pendiente' },
    { transaccionId: 't-5', clientTransactionId: 'c-en-vuelo' },
    { transaccionId: 't-6', clientTransactionId: 'c-anulada' },
    { transaccionId: 't-7', clientTransactionId: 'c-desconocido' },
    { transaccionId: 't-8', clientTransactionId: null },
  ];
  assert.deepEqual(movimientosPorMirar(movs, sabido, clave).map(m => m.transaccionId), ['t-6', 't-7']);
});
