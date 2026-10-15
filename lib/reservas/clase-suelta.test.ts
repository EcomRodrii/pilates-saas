import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Suscripcion } from '../types.ts';
import {
  avisoClaseSueltaAlQuitar, avisoDeVentaSuelta, clasesSueltasQueCubreSuCuota, conceptoDeClaseSuelta, cuotaQueCubreLaClase, cuotaQueYaTiene, cuotasQueCubren,
  desenlaceVentaSuelta, puedeAnularSueltaPorCuota, cabeEnElTopeSemanal, semanaEnEstudio, idReciboDeSuscripcionDeClaseSuelta, idSuscripcionDeClaseSuelta,
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

test('cuotas para dar desde el mostrador: mensuales activas, sin prueba, que incluyan la clase; las baratas primero', () => {
  const planes = [
    plan({ id: 'dos-dias', nombre: '2 días Semana Mensual', tipo: 'MENSUAL', precio: 115, sesiones: null }),
    plan({ id: 'un-dia', nombre: '1 día Semana Mes', tipo: 'MENSUAL', precio: 65, sesiones: null }),
    plan({ id: 'suelta', nombre: 'Clase Suelta', precio: 23 }),
    plan({ id: 'bono', tipo: 'BONO', precio: 90, sesiones: 10 }),
    plan({ id: 'prueba', tipo: 'MENSUAL', precio: 0, sesiones: null, esPrueba: true }),
    plan({ id: 'vieja', tipo: 'MENSUAL', precio: 50, sesiones: null, activo: false }),
    plan({ id: 'solo-mat', tipo: 'MENSUAL', precio: 40, sesiones: null, tiposClaseIds: ['tc-mat'] }),
  ];
  assert.deepEqual(cuotasQueCubren(planes, 'tc-reformer').map(p => p.id), ['un-dia', 'dos-dias']);
  assert.deepEqual(cuotasQueCubren(planes, 'tc-mat').map(p => p.id), ['solo-mat', 'un-dia', 'dos-dias']);
  assert.deepEqual(cuotasQueCubren([], 'tc-reformer'), []);
});

test('si ya tiene cuota (vencida, en pausa o que no incluye la clase), no se le ofrece otra: se dice cuál y por qué', () => {
  const planes = [
    plan({ id: 'cuota', nombre: '2 días Semana Mensual', tipo: 'MENSUAL', precio: 115, sesiones: null }),
    plan({ id: 'cuota-mat', nombre: 'Mat Mensual', tipo: 'MENSUAL', precio: 60, sesiones: null, tiposClaseIds: ['tc-mat'] }),
    plan({ id: 'suelta', nombre: 'Clase Suelta', precio: 23 }),
  ];
  const sus = (o: Partial<Suscripcion>) => ({
    id: 'x', socioId: 'ana', planId: 'cuota', estado: 'ACTIVA', fechaInicio: '2026-09-01', fechaFin: '2026-10-31', ...o,
  } as Suscripcion);
  const hoy = '2026-10-14';
  // Sin nada, o solo con una clase suelta gastada: se le puede dar cuota.
  assert.equal(cuotaQueYaTiene('ana', [], planes, hoy, 'tc-reformer'), null);
  assert.equal(cuotaQueYaTiene('ana', [sus({ planId: 'suelta', sesionesRestantes: 0, fechaFin: null })], planes, hoy, 'tc-reformer'), null);
  // Una cancelada o de otra alumna no cuenta.
  assert.equal(cuotaQueYaTiene('ana', [sus({ estado: 'CANCELADA' }), sus({ socioId: 'bea' })], planes, hoy, 'tc-reformer'), null);

  assert.deepEqual(cuotaQueYaTiene('ana', [sus({ fechaFin: '2026-10-13' })], planes, hoy, 'tc-reformer'), { nombre: '2 días Semana Mensual', motivo: 'VENCIDA' });
  assert.deepEqual(cuotaQueYaTiene('ana', [sus({ estado: 'PAUSADA' })], planes, hoy, 'tc-reformer'), { nombre: '2 días Semana Mensual', motivo: 'PAUSADA' });
  assert.deepEqual(cuotaQueYaTiene('ana', [sus({ planId: 'cuota-mat' })], planes, hoy, 'tc-reformer'), { nombre: 'Mat Mensual', motivo: 'NO_INCLUYE_LA_CLASE' });
  // Vigente y que incluye la clase, pero sin cobertura por otra cosa (p. ej. su tope semanal).
  assert.deepEqual(cuotaQueYaTiene('ana', [sus({})], planes, hoy, 'tc-reformer'), { nombre: '2 días Semana Mensual', motivo: 'OTRO' });
  // Con varias, manda la vencida: hay un cobro esperando.
  assert.equal(cuotaQueYaTiene('ana', [sus({ planId: 'cuota-mat' }), sus({ fechaFin: '2026-10-01' })], planes, hoy, 'tc-reformer')?.motivo, 'VENCIDA');
});

// ── La clase suelta de una clase que ya cubre su cuota ─────────────────────────
const cuotaPlan = plan({ id: 'cuota', nombre: '2 días Semana Mensual', tipo: 'MENSUAL', precio: 115, sesiones: null });
const cuotaMat = plan({ id: 'cuota-mat', nombre: 'Mat Mensual', tipo: 'MENSUAL', precio: 60, sesiones: null, tiposClaseIds: ['tc-mat'] });
const susCuota = (o: Partial<Suscripcion> = {}) => ({
  id: 'sus-c', socioId: 'ana', planId: 'cuota', estado: 'ACTIVA', fechaInicio: '2026-10-14', fechaFin: '2026-11-14', ...o,
} as Suscripcion);
// Lunes 19-oct-2026, 17:00 en Madrid (CEST, 15:00Z).
const LUNES = '2026-10-19T15:00:00Z';
const viva = (inicio: string, o: Partial<{ estado: string; tipoClaseId: string | null; cancelada: boolean }> = {}) =>
  ({ estado: 'CONFIRMADA', inicio, tipoClaseId: 'tc-reformer', ...o });

test('semanaEnEstudio: el lunes de la semana de Madrid, como date_trunc en la base de datos', () => {
  assert.equal(semanaEnEstudio('2026-10-19T15:00:00Z'), '2026-10-19');
  assert.equal(semanaEnEstudio('2026-10-25T21:30:00Z'), '2026-10-19'); // domingo noche en Madrid
  assert.equal(semanaEnEstudio('2026-10-25T23:30:00Z'), '2026-10-26'); // ya lunes en Madrid, domingo en UTC
});

test('cuotaQueCubreLaClase: la cuota activa que incluye ese día y ese tipo', () => {
  const planes = [cuotaPlan, cuotaMat];
  const una = [viva(LUNES)];
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota()], planes, LUNES, 'tc-reformer', una)?.id, 'cuota');
  // El día que empieza y el último, incluidos.
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota()], planes, '2026-10-14T08:00:00Z', null, una)?.id, 'cuota');
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota()], planes, '2026-11-14T08:00:00Z', null, una)?.id, 'cuota');
  // Antes de empezar la cuota (la clase suelta de la semana pasada se pagó aparte, bien pagada).
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota()], planes, '2026-10-13T08:00:00Z', null, una), null);
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota({ estado: 'PAUSADA' })], planes, LUNES, null, una), null);
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota({ planId: 'cuota-mat' })], planes, LUNES, 'tc-reformer', una), null);
  assert.equal(cuotaQueCubreLaClase('bea', [susCuota()], planes, LUNES, null, una), null);
});

test('tope semanal: con cuota de 2 días, la 3.ª clase de la semana NO la cubre (anularla regalaría una clase)', () => {
  const dos = plan({ id: 'cuota-2', nombre: '2 días', tipo: 'MENSUAL', precio: 115, sesiones: null, limiteSemanal: 2 });
  const semana = [viva('2026-10-19T15:00:00Z'), viva('2026-10-21T15:00:00Z')];
  assert.equal(cabeEnElTopeSemanal(dos, 'tc-reformer', LUNES, semana), true);
  assert.equal(cabeEnElTopeSemanal(dos, 'tc-reformer', LUNES, [...semana, viva('2026-10-23T15:00:00Z')]), false);
  // Lo cancelado, lo de otra semana y la clase cancelada no cuentan.
  assert.equal(cabeEnElTopeSemanal(dos, 'tc-reformer', LUNES, [
    ...semana, viva('2026-10-23T15:00:00Z', { estado: 'CANCELADA' }), viva('2026-10-27T15:00:00Z'), viva('2026-10-24T09:00:00Z', { cancelada: true }),
  ]), true);
  assert.equal(cuotaQueCubreLaClase('ana', [susCuota({ planId: 'cuota-2' })], [dos], LUNES, 'tc-reformer', [...semana, viva('2026-10-23T15:00:00Z')]), null);
});

test('tope por tipo de clase: cuenta solo las de ese tipo', () => {
  const mixta = plan({ id: 'mixta', nombre: 'Mixta', tipo: 'MENSUAL', precio: 90, sesiones: null, limitePorTipo: { 'tc-reformer': 1 } });
  assert.equal(cabeEnElTopeSemanal(mixta, 'tc-reformer', LUNES, [viva(LUNES), viva('2026-10-21T15:00:00Z', { tipoClaseId: 'tc-mat' })]), true);
  assert.equal(cabeEnElTopeSemanal(mixta, 'tc-reformer', LUNES, [viva(LUNES), viva('2026-10-21T15:00:00Z')]), false);
});

const reciboSuelta = (reservaId: string, o: Record<string, unknown> = {}) => ({
  id: `rec-suelta-${reservaId}`, socioId: 'ana', suscripcionId: `sus-suelta-${reservaId}`,
  estado: 'PENDIENTE', importe: 23, fechaCobro: null, ...o,
});

test('clasesSueltasQueCubreSuCuota: pendientes, pagadas y a medias de clases dentro de su cuota; ni las de antes ni las canceladas', () => {
  const sesiones: Record<string, { inicio: string; tipoClaseId: string | null; cancelada?: boolean }> = {
    lunes: { inicio: LUNES, tipoClaseId: 'tc-reformer' },
    semanaPasada: { inicio: '2026-10-06T15:00:00Z', tipoClaseId: 'tc-reformer' },
    miercoles: { inicio: '2026-10-21T15:00:00Z', tipoClaseId: 'tc-reformer' },
    jueves: { inicio: '2026-10-29T15:00:00Z', tipoClaseId: 'tc-reformer' },
    claseCancelada: { inicio: '2026-10-30T15:00:00Z', tipoClaseId: 'tc-reformer', cancelada: true },
  };
  const reservas = [
    { id: 'r-lunes', socioId: 'ana', sesionId: 'lunes', estado: 'CONFIRMADA', bonoSuscripcionId: 'sus-suelta-r-lunes' },
    { id: 'r-pasada', socioId: 'ana', sesionId: 'semanaPasada', estado: 'ASISTIDA' },
    { id: 'r-cancelada', socioId: 'ana', sesionId: 'miercoles', estado: 'CANCELADA' },
    { id: 'r-pagada', socioId: 'ana', sesionId: 'miercoles', estado: 'CONFIRMADA' },
    { id: 'r-medias', socioId: 'ana', sesionId: 'jueves', estado: 'CONFIRMADA', bonoSuscripcionId: 'sus-suelta-r-medias' },
    { id: 'r-clase-cancelada', socioId: 'ana', sesionId: 'claseCancelada', estado: 'CONFIRMADA' },
  ];
  const fuera = clasesSueltasQueCubreSuCuota({
    socioId: 'ana',
    recibos: [
      reciboSuelta('r-lunes'),
      reciboSuelta('r-pasada'),
      reciboSuelta('r-cancelada'),
      reciboSuelta('r-pagada', { estado: 'COBRADO', fechaCobro: '2026-10-14' }),
      // Anulada pero la reserva sigue colgando de la clase suelta: un intento a medias.
      reciboSuelta('r-medias', { estado: 'ANULADO' }),
      reciboSuelta('r-clase-cancelada'),
      // Un recibo suelto de antes, sin su clase suelta: no es de esto.
      { id: 'rec-suelta-r-lunes-2', socioId: 'ana', suscripcionId: null, estado: 'PENDIENTE', importe: 23 },
      // De otra alumna.
      { ...reciboSuelta('r-lunes'), socioId: 'bea' },
    ],
    reservas,
    sesion: id => sesiones[id],
    suscripciones: [susCuota()],
    planes: [cuotaPlan],
  });
  assert.deepEqual(fuera.map(f => [f.reciboId, f.pagado, f.aMedias, f.importe]), [
    ['rec-suelta-r-lunes', false, false, 23],
    ['rec-suelta-r-pagada', true, false, 23],
    ['rec-suelta-r-medias', false, true, 0],
  ]);
  // Anulada del todo (ni clase suelta activa ni reserva colgando): nada que decir.
  assert.deepEqual(clasesSueltasQueCubreSuCuota({
    socioId: 'ana', recibos: [reciboSuelta('r-pagada', { estado: 'ANULADO' })], reservas, sesion: id => sesiones[id], suscripciones: [susCuota()], planes: [cuotaPlan],
  }), []);
  // Sin cuota, nada que decir.
  assert.deepEqual(clasesSueltasQueCubreSuCuota({ socioId: 'ana', recibos: [reciboSuelta('r-lunes')], reservas, sesion: id => sesiones[id], suscripciones: [], planes: [cuotaPlan] }), []);
});

test('puedeAnularSueltaPorCuota: el servidor solo anula la clase suelta pendiente, sin cobro en marcha ni factura, de una reserva viva que cubre su cuota', () => {
  const recibo = {
    socio_id: 'ana', suscripcion_id: 'sus-suelta-r1', estado: 'PENDIENTE', fecha_cobro: null,
    stripe_payment_intent_id: null, checkout_session_id: null, cobro_mostrador_pi: null, cobro_off_session_clave: null,
  };
  const base = {
    reciboId: 'rec-suelta-r1', recibo, suelta: { estado: 'ACTIVA' },
    reserva: { socio_id: 'ana', estado: 'CONFIRMADA', bono_suscripcion_id: 'sus-suelta-r1' },
    sesion: { cancelada: false }, tieneFactura: false, cuota: cuotaPlan,
  };
  assert.deepEqual(puedeAnularSueltaPorCuota(base), { ok: true, reservaId: 'r1', suscripcionId: 'sus-suelta-r1', terminar: false });
  const motivo = (o: Partial<typeof base>) => { const r = puedeAnularSueltaPorCuota({ ...base, ...o }); return r.ok ? (r.terminar ? 'terminar' : 'ok') : r.motivo; };
  assert.equal(motivo({ reciboId: 'rec-otro-r1' }), 'NO_ES_CLASE_SUELTA');
  assert.equal(motivo({ recibo: { ...recibo, suscripcion_id: null } }), 'NO_ES_CLASE_SUELTA');
  assert.equal(motivo({ recibo: null }), 'NO_ES_CLASE_SUELTA');
  assert.equal(motivo({ recibo: { ...recibo, estado: 'COBRADO' } }), 'NO_PENDIENTE');
  assert.equal(motivo({ recibo: { ...recibo, fecha_cobro: '2026-10-14' } }), 'NO_PENDIENTE');
  assert.equal(motivo({ recibo: { ...recibo, checkout_session_id: 'cs_1' } }), 'COBRO_EN_MARCHA');
  assert.equal(motivo({ recibo: { ...recibo, cobro_off_session_clave: 'k' } }), 'COBRO_EN_MARCHA');
  assert.equal(motivo({ tieneFactura: true }), 'TIENE_FACTURA');
  assert.equal(motivo({ reserva: { socio_id: 'ana', estado: 'CANCELADA', bono_suscripcion_id: 'sus-suelta-r1' } }), 'RESERVA_NO_VALE');
  assert.equal(motivo({ reserva: { socio_id: 'bea', estado: 'CONFIRMADA', bono_suscripcion_id: null } }), 'RESERVA_NO_VALE');
  assert.equal(motivo({ sesion: { cancelada: true } }), 'RESERVA_NO_VALE');
  assert.equal(motivo({ cuota: null }), 'SIN_CUOTA_QUE_LA_CUBRA');
  // Anulado a medias: vale solo para terminar (la clase suelta sigue activa o la reserva colgando).
  assert.equal(motivo({ recibo: { ...recibo, estado: 'ANULADO' } }), 'terminar');
  assert.equal(motivo({ recibo: { ...recibo, estado: 'ANULADO' }, suelta: { estado: 'CANCELADA' } }), 'terminar');
  assert.equal(motivo({ recibo: { ...recibo, estado: 'ANULADO' }, suelta: { estado: 'CANCELADA' }, reserva: { ...base.reserva, bono_suscripcion_id: null } }), 'NO_PENDIENTE');
  // Y terminar también exige que la cuota la cubra.
  assert.equal(motivo({ recibo: { ...recibo, estado: 'ANULADO' }, cuota: null }), 'SIN_CUOTA_QUE_LA_CUBRA');
});

test('al quitarla de la clase, una clase suelta anulada (la cubría su cuota) no promete «recupera su clase suelta»', () => {
  const anulado = { estado: 'ANULADO', importe: 23, suscripcionId: 'sus-suelta-r1' };
  assert.equal(avisoClaseSueltaAlQuitar({ recibo: anulado, reservaId: 'r1', bonoDevuelto: true, tardia: false }), null);
});
