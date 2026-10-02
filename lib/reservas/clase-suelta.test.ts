import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa } from '../types.ts';
import {
  avisoDeVentaSuelta, conceptoDeClaseSuelta, desenlaceVentaSuelta, idReciboDeSuscripcionDeClaseSuelta, idSuscripcionDeClaseSuelta,
  idSuscripcionDeReciboDeClaseSuelta, importeDeClaseSuelta, motivoSinClaseSuelta, planDeClaseSuelta,
} from './clase-suelta.ts';

const plan = (p: Partial<PlanTarifa> & { id: string }): PlanTarifa => ({
  studioId: 's', nombre: p.id, descripcion: null, precio: 15, tipo: 'PUNTUAL', sesiones: 1,
  validezDias: 30, limiteSemanal: null, activo: true, ...p,
} as PlanTarifa);

test('la clase suelta es la tarifa PUNTUAL de una sesión más barata que cubre la clase', () => {
  const planes = [
    plan({ id: 'cara', precio: 20 }),
    plan({ id: 'barata', precio: 15 }),
    plan({ id: 'bono', tipo: 'BONO', precio: 5, sesiones: 10 }),
    plan({ id: 'mensual', tipo: 'MENSUAL', precio: 1, sesiones: null }),
  ];
  assert.equal(planDeClaseSuelta(planes, 'tc-reformer')?.id, 'barata');
});

test('no hacen de clase suelta: la de prueba, la inactiva, la de 0 €, la de dos sesiones ni la de otro tipo', () => {
  const planes = [
    plan({ id: 'prueba', precio: 5, esPrueba: true }),
    plan({ id: 'inactiva', precio: 6, activo: false }),
    plan({ id: 'gratis', precio: 0 }),
    plan({ id: 'doble', precio: 7, sesiones: 2 }),
    plan({ id: 'solo-mat', precio: 8, tiposClaseIds: ['tc-mat'] }),
  ];
  assert.equal(planDeClaseSuelta(planes, 'tc-reformer'), null);
  // La de Mat sí vale para una clase de Mat.
  assert.equal(planDeClaseSuelta(planes, 'tc-mat')?.id, 'solo-mat');
});

test('a igual precio, desempata por id: pantalla y servidor eligen la misma', () => {
  const planes = [plan({ id: 'b' }), plan({ id: 'a' })];
  assert.equal(planDeClaseSuelta(planes, null)?.id, 'a');
  assert.equal(planDeClaseSuelta([...planes].reverse(), null)?.id, 'a');
});

test('el precio de la sesión manda sobre el de la tarifa; un 0 es una clase gratuita y no se cobra', () => {
  const p = plan({ id: 'suelta', precio: 15 });
  assert.equal(importeDeClaseSuelta(null, p), 15);
  assert.equal(importeDeClaseSuelta(25, p), 25);
  assert.equal(importeDeClaseSuelta(0, p), null);
  assert.equal(importeDeClaseSuelta(25, null), null, 'sin tarifa que la cubra no se vende, aunque la sesión tenga precio');
});

test('la clase suelta cuelga de la reserva, gemela de su recibo', () => {
  assert.equal(idSuscripcionDeClaseSuelta('res-abc_1'), 'sus-suelta-res-abc_1');
  assert.equal(idSuscripcionDeClaseSuelta('res con espacio'), null);
  assert.equal(idSuscripcionDeClaseSuelta(`res-${'x'.repeat(200)}`), null);
});

test('el concepto dice qué clase y cuándo, en hora del estudio', () => {
  // 07:00 UTC del 2 de octubre = 09:00 en Madrid (horario de verano).
  assert.equal(conceptoDeClaseSuelta('Reformer', '2026-10-02T07:00:00.000Z'), 'Clase suelta — Reformer, vie 2 oct 09:00');
  assert.match(conceptoDeClaseSuelta(null, '2026-10-02T07:00:00.000Z'), /^Clase suelta — clase, /);
});

test('qué pasó con la venta después de reservar', () => {
  const base = { suscripcionSuelta: 'sus-suelta-r1', bonoDecidido: true, bonoSuscripcionId: 'sus-suelta-r1' };
  assert.equal(desenlaceVentaSuelta({ ...base, estado: 'CONFIRMADA' }), 'vendida');
  assert.equal(desenlaceVentaSuelta({ ...base, estado: 'ASISTIDA' }), 'vendida', 'el walk-in con check-in también ocupa plaza');
  assert.equal(desenlaceVentaSuelta({ ...base, estado: 'CONFIRMADA', bonoSuscripcionId: 'sus-bono' }), 'otro-bono');
  assert.equal(desenlaceVentaSuelta({ ...base, estado: 'CONFIRMADA', bonoSuscripcionId: null }), 'sin-gastar');
  assert.equal(desenlaceVentaSuelta({ ...base, estado: 'CONFIRMADA', bonoDecidido: false, bonoSuscripcionId: null }), 'sin-decidir');
  for (const estado of ['LISTA_ESPERA', 'PENDIENTE_APROBACION', 'CANCELADA']) {
    assert.equal(desenlaceVentaSuelta({ ...base, estado }), 'no-ocupa', estado);
  }
});

test('al quitarla de la clase, dice qué pasa con su clase suelta según la política, y nunca devuelve dinero solo', async () => {
  const { avisoClaseSueltaAlQuitar } = await import('./clase-suelta.ts');
  const cobrado = { estado: 'COBRADO', importe: 15, importeDevuelto: 0, suscripcionId: 'sus-suelta-r1' };
  const pendiente = { estado: 'PENDIENTE', importe: 15, importeDevuelto: 0, suscripcionId: 'sus-suelta-r1' };
  const a = (recibo: typeof cobrado | null, bonoDevuelto: boolean, tardia: boolean) =>
    avisoClaseSueltaAlQuitar({ recibo, reservaId: 'r1', bonoDevuelto, tardia });
  assert.match(a(cobrado, true, false)!, /^Recupera su clase suelta para otro día\. Si prefieres devolverle el dinero/);
  assert.match(a(pendiente, true, false)!, /Recupera su clase suelta para otro día, y sigue debiendo 15,00/);
  assert.equal(a(cobrado, false, true), 'Fuera de plazo: pierde la clase suelta');
  assert.match(a(pendiente, false, true)!, /pierde la clase suelta, y sigue debiendo 15,00/);
  assert.equal(a(null, true, false), null);
  // El recibo suelto de antes (sin suscripción): ninguna política lo ve.
  const deAntes = { estado: 'COBRADO', importe: 15, importeDevuelto: 5, suscripcionId: null };
  assert.match(avisoClaseSueltaAlQuitar({ recibo: deAntes, reservaId: 'r1', bonoDevuelto: false, tardia: false })!, /^Pagó 10,00/);
});

test('⚠️ una tarifa PUNTUAL sin número de sesiones no hace de clase suelta (nacería sin saldo y se cobraría dos veces)', () => {
  assert.equal(planDeClaseSuelta([plan({ id: 'sin-sesiones', sesiones: null })], null), null);
});

test('recibo y suscripción de una clase suelta se encuentran el uno al otro', () => {
  assert.equal(idReciboDeSuscripcionDeClaseSuelta('sus-suelta-res-abc'), 'rec-suelta-res-abc');
  assert.equal(idSuscripcionDeReciboDeClaseSuelta('rec-suelta-res-abc'), 'sus-suelta-res-abc');
  assert.equal(idReciboDeSuscripcionDeClaseSuelta('sus-otra-cosa'), null);
  assert.equal(idSuscripcionDeReciboDeClaseSuelta('rec-cita-abc'), null);
  assert.equal(idReciboDeSuscripcionDeClaseSuelta(null), null);
});

test('sin clase suelta que vender, el mostrador dice qué hacer: terminar el borrador antes que crear otra', () => {
  const borrador = plan({ id: 'b', nombre: 'Clase suelta', precio: 0, activo: false });
  assert.deepEqual(motivoSinClaseSuelta([borrador], 'tc-reformer', null),
    { texto: 'Tu tarifa «Clase suelta» no tiene precio y está desactivada: ponle precio y actívala', aPaquetes: true });
  assert.match(motivoSinClaseSuelta([plan({ id: 'b', nombre: 'Suelta', activo: false })], null, null).texto, /está desactivada: actívala$/);
  assert.match(motivoSinClaseSuelta([plan({ id: 'b', nombre: 'Suelta', precio: 0 })], null, null).texto, /no tiene precio: pónselo$/);
  assert.match(motivoSinClaseSuelta([plan({ id: 'mat', tiposClaseIds: ['tc-mat'] })], 'tc-reformer', null).texto, /no vale para este tipo de clase/);
  assert.match(motivoSinClaseSuelta([], null, null).texto, /crea tu tarifa «Clase suelta»/);
  assert.deepEqual(motivoSinClaseSuelta([], null, 0), { texto: 'Esta clase es gratuita: apúntala como cortesía.', aPaquetes: false });
});

test('lo que se le dice a recepción cuando la clase suelta no queda vendida como se pidió', () => {
  assert.equal(avisoDeVentaSuelta('vendida', null), null);
  // Sobraba y se deshizo limpia: ya lo dicen la lista de espera o «ya cubría».
  assert.equal(avisoDeVentaSuelta('no-ocupa', 'anulada'), null);
  assert.equal(avisoDeVentaSuelta('otro-bono', 'anulada'), null);
  assert.match(avisoDeVentaSuelta('no-ocupa', 'fallo') ?? '', /recibo de su clase suelta que sobra/);
  assert.match(avisoDeVentaSuelta('sin-gastar', 'anulada') ?? '', /«Nuevo cobro»/);
  // ⚠️ Si no se sabe cómo quedó, nunca «Nuevo cobro»: serían dos recibos por una clase.
  for (const desenlace of ['desconocido', 'sin-decidir'] as const) {
    const texto = avisoDeVentaSuelta(desenlace, null) ?? '';
    assert.match(texto, /antes de cobrarle/);
    assert.doesNotMatch(texto, /Nuevo cobro/);
  }
  assert.doesNotMatch(avisoDeVentaSuelta('sin-gastar', 'fallo') ?? '', /Nuevo cobro/);
  // ⚠️ Si la clase suelta no se pudo deshacer, nunca «borra el recibo que sobra»: quedaría gratis.
  for (const desenlace of ['no-ocupa', 'otro-bono'] as const) {
    const texto = avisoDeVentaSuelta(desenlace, 'sin-deshacer') ?? '';
    assert.match(texto, /no se ha podido deshacer/);
    assert.doesNotMatch(texto, /que sobra/);
  }
});
