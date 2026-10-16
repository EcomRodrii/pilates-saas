import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  appEsperaAPersona, cifrasDelNegocio, estadosGratisPorEstudio, estudiosAMirar, haceCuanto, listaNombres,
  movimientoSuscripciones, pendientesPorSeccion, tareasDeHoy, TIPOS_TAREA, type FuentesTareas,
} from './hoy.ts';

const AHORA = new Date('2026-10-16T10:00:00Z');
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

const VACIAS: FuentesTareas = {
  facturacion: { impagos: [], descuadres: [] },
  denuncias: { n: 0, masAntigua: null },
  llamadas: { n: 0, masAntigua: null },
  apps: [], altas: { n: 0, fallidas: 0, masAntigua: null }, sinReservas: [],
};

test('sin nada pendiente no se inventa ninguna tarea', () => {
  assert.deepEqual(tareasDeHoy(VACIAS, AHORA), []);
  // Tampoco sin permiso a nada: `null` no es «hay algo».
  assert.deepEqual(tareasDeHoy({ facturacion: null, denuncias: null, llamadas: null, apps: null, altas: null, sinReservas: null }, AHORA), []);
});

test('el orden es el de lo que cuesta dejarlo: dinero y Apple primero, clientes nuevos después', () => {
  const tareas = tareasDeHoy({
    facturacion: { impagos: [{ nombre: 'Estudio A' }], descuadres: [{ nombre: 'Estudio B', motivo: 'Tiene acceso en la base y no hay nada en Stripe' }] },
    denuncias: { n: 1, masAntigua: hace(9) },
    llamadas: { n: 2, masAntigua: hace(20) },
    apps: [{ estudio: 'Estudio C', estado: 'EN_PRUEBAS', sinHueco: false }],
    altas: { n: 3, fallidas: 1, masAntigua: hace(50) },
    sinReservas: [{ id: 'e1', nombre: 'Estudio D', semanaAnterior: 41 }],
  }, AHORA);
  assert.deepEqual(tareas.map(t => t.tipo), [...TIPOS_TAREA]);
  assert.deepEqual(tareas.map(t => t.tono), ['rojo', 'rojo', 'rojo', 'ambar', 'ambar', 'gris', 'gris']);
  // Cada una lleva a la pantalla donde se resuelve.
  assert.deepEqual(tareas.map(t => t.href), [
    '/interno/facturacion', '/interno/facturacion', '/interno/denuncias', '/interno/apps-estudio',
    '/interno/llamadas', '/interno/crecimiento', '/interno/estudios/e1',
  ]);
});

test('los textos dicen el porqué con el dato real, en singular y en plural', () => {
  const [denuncia, llamadas, altas] = tareasDeHoy({ ...VACIAS, denuncias: { n: 1, masAntigua: hace(9) }, llamadas: { n: 2, masAntigua: hace(30) }, altas: { n: 3, fallidas: 1, masAntigua: hace(50) } }, AHORA);
  assert.equal(denuncia.titulo, '1 denuncia de la app de los estudios sin revisar');
  assert.match(denuncia.porque, /llegó hace 9 h\.$/);
  assert.equal(llamadas.titulo, '2 estudios nuevos pidieron que les llames');
  assert.match(llamadas.porque, /La más antigua la pidió hace 30 h/);
  assert.equal(altas.titulo, '3 altas se quedaron a medias esta semana');
  assert.match(altas.porque, /\(1 porque falló al montarlo\)/);

  const [uno] = tareasDeHoy({ ...VACIAS, sinReservas: [{ id: 'e1', nombre: 'Estudio D', semanaAnterior: 41 }] }, AHORA);
  assert.equal(uno.titulo, 'Estudio D lleva 7 días sin reservas');
  assert.match(uno.porque, /^La semana anterior tuvo 41\./);
  const [varios] = tareasDeHoy({ ...VACIAS, sinReservas: [{ id: 'a', nombre: 'A', semanaAnterior: 3 }, { id: 'b', nombre: 'B', semanaAnterior: null }] }, AHORA);
  assert.equal(varios.href, '/interno/estudios');
});

test('una app solo es tarea si espera a una persona', () => {
  assert.equal(appEsperaAPersona({ estado: 'EN_PRUEBAS', sinHueco: false }), true); // enviarla a revisión
  assert.equal(appEsperaAPersona({ estado: 'PEDIDA', sinHueco: true }), true); // crearla a mano
  // Lo demás lo hace la automatización sola, o ya está cerrado.
  for (const estado of ['PEDIDA', 'EN_PREPARACION', 'EN_REVISION', 'PUBLICADA', 'PAUSADA'] as const) {
    assert.equal(appEsperaAPersona({ estado, sinHueco: false }), false, estado);
  }
  const [t] = tareasDeHoy({ ...VACIAS, apps: [
    { estudio: 'A', estado: 'EN_PRUEBAS', sinHueco: false },
    { estudio: 'B', estado: 'PEDIDA', sinHueco: true },
    { estudio: 'C', estado: 'EN_REVISION', sinHueco: false },
  ] }, AHORA);
  assert.equal(t.n, 2);
  assert.match(t.porque, /A ya está en TestFlight/);
  assert.match(t.porque, /B no tiene hueco en el lote/);
});

test('el contador de cada sección suma sus tareas, y la ficha de un estudio cuenta en Estudios', () => {
  const tareas = tareasDeHoy({
    ...VACIAS,
    facturacion: { impagos: [{ nombre: 'A' }, { nombre: 'B' }], descuadres: [{ nombre: 'C', motivo: null }] },
    sinReservas: [{ id: 'e1', nombre: 'D', semanaAnterior: 0 }],
  }, AHORA);
  assert.deepEqual(pendientesPorSeccion(tareas), { '/interno/facturacion': 3, '/interno/estudios': 1 });
});

test('haceCuanto y listaNombres', () => {
  assert.equal(haceCuanto(hace(0.5), AHORA), 'hace menos de una hora');
  assert.equal(haceCuanto(hace(47), AHORA), 'hace 47 h');
  assert.equal(haceCuanto(hace(72), AHORA), 'hace 3 días');
  assert.equal(listaNombres(['A']), 'A');
  assert.equal(listaNombres(['A', 'B']), 'A y B');
  assert.equal(listaNombres(['A', 'B', 'C', 'D']), 'A, B y 2 más');
});

const sub = (o: { status: string; created: number; ended_at?: number | null; canceled_at?: number | null; euros: number }) => ({
  status: o.status, created: o.created, ended_at: o.ended_at ?? null, canceled_at: o.canceled_at ?? null,
  items: { data: [{ quantity: 1, price: { unit_amount: o.euros * 100, recurring: { interval: 'month', interval_count: 1 } } }] },
}) as unknown as Stripe.Subscription;
const seg = (diasAtras: number) => Math.floor(AHORA.getTime() / 1000) - diasAtras * 86_400;

test('altas y bajas de 30 días salen de Stripe, con su importe', () => {
  const m = movimientoSuscripciones([
    sub({ status: 'active', created: seg(5), euros: 59 }), // alta
    sub({ status: 'active', created: seg(90), euros: 29 }), // ya estaba
    sub({ status: 'canceled', created: seg(200), ended_at: seg(3), euros: 29 }), // baja
    sub({ status: 'canceled', created: seg(200), ended_at: seg(60), euros: 149 }), // baja antigua
    sub({ status: 'past_due', created: seg(2), euros: 59 }), // no cobra: no es alta
  ], AHORA);
  assert.deepEqual(m, { altas: 1, bajas: 1, eurosAltas: 59, eurosBajas: 29 });
});

test('ninguna cifra sin procedencia: si la fuente falla, «—» con el motivo, nunca 0', () => {
  const cifras = cifrasDelNegocio({
    dinero: { motivo: 'Sin respuesta de Stripe: timeout' },
    actividad: { motivo: 'No se han podido leer las reservas por estudio.' },
    reservas: { motivo: 'No tienes permiso para ver los estudios.' },
  });
  assert.equal(cifras.length, 4);
  for (const c of cifras) {
    assert.equal(c.valor, null, c.id);
    assert.ok(c.motivo, c.id);
    assert.ok(c.fuente, c.id);
  }
});

test('las cifras dicen el cambio frente al periodo anterior y su fuente', () => {
  const [mrr, pagan, actividad, reservas] = cifrasDelNegocio({
    dinero: { mrrEuros: 1247, pagando: 31, movimiento: { altas: 3, bajas: 1, eurosAltas: 147, eurosBajas: 29 } },
    actividad: { ahora: 58, antes: 52 },
    reservas: { ultimos7: 4912, anteriores7: 5012 },
  });
  assert.equal(reservas.valor, '4.912');
  assert.equal(mrr.valor, '1.247 €');
  assert.deepEqual(mrr.cambio, { texto: '+118 € en 30 días', sube: true });
  assert.match(mrr.fuente, /Stripe/);
  assert.deepEqual(pagan.cambio, { texto: '+3 altas · −1 baja en 30 días', sube: true });
  assert.deepEqual(actividad.cambio, { texto: '+6 frente a los 30 días anteriores', sube: true });
  assert.deepEqual(reservas.cambio, { texto: '−2 % que la semana anterior', sube: false });

  const [mrr0, , , res0] = cifrasDelNegocio({
    dinero: { mrrEuros: 0, pagando: 0, movimiento: { altas: 0, bajas: 0, eurosAltas: 0, eurosBajas: 0 } },
    actividad: { ahora: 0, antes: 0 },
    reservas: { ultimos7: 12, anteriores7: 0 },
  });
  // Un 0 leído de Stripe sí es un dato: se enseña, con su fuente.
  assert.equal(mrr0.valor, '0 €');
  assert.deepEqual(mrr0.cambio, { texto: 'Sin altas ni bajas en 30 días', sube: null });
  assert.deepEqual(res0.cambio, { texto: 'Ninguna la semana anterior', sube: true });
});

test('el plan gratis se mide por dueña, como el gate', () => {
  const estados = estadosGratisPorEstudio([
    { studioId: 'a1', ownerId: 'o1', alumnasActivas: 70, reservas30Dias: 130, excedidoDesde: null, medidoEn: hace(1) },
    { studioId: 'a2', ownerId: 'o1', alumnasActivas: 60, reservas30Dias: 120, excedidoDesde: '2026-10-10', medidoEn: hace(1) },
    { studioId: 'b1', ownerId: 'o2', alumnasActivas: 10, reservas30Dias: 20, excedidoDesde: null, medidoEn: hace(1) },
    { studioId: 'c1', ownerId: 'o3', alumnasActivas: null, reservas30Dias: null, excedidoDesde: null, medidoEn: null },
  ], '2026-10-16');
  // 250 reservas entre los dos: no pasa (el límite es «más de 250»), pero sí está cerca.
  assert.equal(estados.get('a1')!.fase, 'CERCA');
  assert.equal(estados.get('a1')!.estudiosDelGrupo, 2);
  assert.equal(estados.get('a1')!.uso!.reservas30Dias, 250);
  assert.equal(estados.get('b1')!.fase, 'DENTRO');
  // Sin medir no se dice nada del uso (nunca un 0 inventado).
  assert.equal(estados.get('c1')!.fase, 'SIN_MEDIR');
});

test('estudios que miraría: los peores primero, y los gratis solo si se acercan al límite', () => {
  const gratis = estadosGratisPorEstudio([
    { studioId: 'g1', ownerId: 'o1', alumnasActivas: 30, reservas30Dias: 231, excedidoDesde: null, medidoEn: hace(1) },
    { studioId: 'g2', ownerId: 'o2', alumnasActivas: 5, reservas30Dias: 12, excedidoDesde: null, medidoEn: hace(1) },
  ], '2026-10-16');
  const filas = estudiosAMirar(
    [
      { id: 'p1', nombre: 'Bien', plan: 'CADENA', impago: false, reservas7d: 120, semanaAnterior: 110, nivel: 'bien', primerAviso: null },
      { id: 'p2', nombre: 'Sin reservas', plan: 'BASE', impago: false, reservas7d: 0, semanaAnterior: 41, nivel: 'atencion', primerAviso: 'Ninguna reserva en los últimos 7 días' },
      { id: 'p3', nombre: 'Impago', plan: 'ESTUDIO', impago: true, reservas7d: 50, semanaAnterior: 48, nivel: 'riesgo', primerAviso: 'Su pago a Tentare ha fallado' },
    ],
    [{ id: 'g1', nombre: 'Gratis cerca', estado: gratis.get('g1')! }, { id: 'g2', nombre: 'Gratis lejos', estado: gratis.get('g2')! }],
  );
  assert.deepEqual(filas.map(f => f.nombre), ['Impago', 'Sin reservas', 'Gratis cerca', 'Bien']);
  assert.equal(filas[0].plan, 'Estudio');
  assert.equal(filas[1].uso, '0 reservas en 7 días (antes 41)');
  assert.equal(filas[2].uso, '231 de 250 reservas · 30 de 150 alumnas');
  assert.equal(filas[2].estado, 'Cerca del límite');
  assert.equal(filas[3].tono, 'verde');
});
