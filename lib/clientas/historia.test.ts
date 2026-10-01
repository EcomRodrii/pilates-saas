import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactarHistoria, historiaDeClienta } from './historia.ts';

const AHORA = new Date('2026-10-01T12:00:00+02:00');
const vacio = { fechaAlta: '2025-03-12', reservas: [], recibos: [], comunicaciones: [], notas: [], planes: [] };
const ver = { verDinero: true, verNotas: true, ahora: AHORA };

test('las clases pasadas cuentan; las que están por venir no son historia', () => {
  const h = historiaDeClienta({
    ...vacio,
    reservas: [
      { id: 'a', estado: 'ASISTIDA', inicio: '2026-09-10T16:00:00Z', tipoClase: 'Reformer', instructora: 'Laura' },
      { id: 'b', estado: 'CONFIRMADA', inicio: '2026-10-02T16:00:00Z', tipoClase: 'Mat', instructora: null },
      { id: 'c', estado: 'NO_ASISTIO', inicio: '2026-09-15T16:00:00Z', tipoClase: 'Mat', instructora: null },
      { id: 'd', estado: 'CANCELADA', canceladaTardia: true, inicio: '2026-09-20T16:00:00Z', tipoClase: 'Reformer', instructora: null },
      { id: 'e', estado: 'CANCELADA', claseCancelada: true, inicio: '2026-09-22T16:00:00Z', tipoClase: 'Barre', instructora: null },
    ],
  }, ver);
  assert.deepEqual(h.map(e => e.titulo), [
    'Se canceló la clase de Barre',
    'Canceló Reformer',
    'No vino a Mat',
    'Vino a Reformer',
    'Se dio de alta en el estudio',
  ]);
  assert.equal(h.find(e => e.titulo === 'Canceló Reformer')?.detalle, 'Fuera de plazo');
  assert.equal(h.find(e => e.titulo === 'Vino a Reformer')?.detalle, 'con Laura');
  // Sin saber si fue tarde, no se afirma nada.
  const sinDato = historiaDeClienta({ ...vacio, reservas: [{ id: 'x', estado: 'CANCELADA', inicio: '2026-09-20T16:00:00Z', tipoClase: 'Mat', instructora: null }] }, ver);
  assert.equal(sinDato[0].detalle, undefined);
});

test('el dinero solo para quien lo puede ver', () => {
  const datos = {
    ...vacio,
    recibos: [
      { id: 'r1', concepto: 'Mensual septiembre', importe: 59, estado: 'COBRADO', fechaVencimiento: '2026-09-12', fechaCobro: '2026-09-12', fechaDevolucion: null },
      { id: 'r2', concepto: 'Mensual octubre', importe: 59, estado: 'FALLIDO', fechaVencimiento: '2026-09-30', fechaCobro: null, fechaDevolucion: null },
      { id: 'r3', concepto: 'Bono', importe: 99.5, estado: 'PENDIENTE', fechaVencimiento: '2026-09-28', fechaCobro: null, fechaDevolucion: null },
    ],
    planes: [{ id: 's1', plan: 'Mensual 2×/semana', fechaInicio: '2025-03-14' }],
  };
  const conDinero = historiaDeClienta(datos, ver).map(e => e.titulo);
  assert.deepEqual(conDinero, ['No se pudo cobrar 59 €', 'Cobro de 59 €', 'Empezó Mensual 2×/semana', 'Se dio de alta en el estudio']);
  const sinDinero = historiaDeClienta(datos, { ...ver, verDinero: false }).map(e => e.titulo);
  assert.deepEqual(sinDinero, ['Se dio de alta en el estudio']);
});

test('un correo del equipo es un contacto; uno automático, un aviso; uno que no llegó, un problema', () => {
  const h = historiaDeClienta({
    ...vacio,
    comunicaciones: [
      { id: 'c1', asunto: 'Te echamos de menos', estado: 'ENVIADO', error: null, creadoEn: '2026-09-29T10:00:00Z', creadoPorNombre: 'Ana' },
      { id: 'c2', asunto: 'Recordatorio de tu clase', estado: 'ENVIADO', error: null, creadoEn: '2026-09-28T10:00:00Z', creadoPorNombre: null },
      { id: 'c3', asunto: 'Tu factura', estado: 'FALLIDO', error: 'buzón lleno', creadoEn: '2026-09-27T10:00:00Z', creadoPorNombre: null },
    ],
  }, ver);
  assert.deepEqual(h.slice(0, 3).map(e => [e.grupo, e.tono]), [['CONTACTOS', 'contacto'], ['AVISOS', null], ['AVISOS', 'problema']]);
  assert.equal(h[2].detalle, 'No le llegó: buzón lleno');
});

test('las notas solo si se pueden ver; los contactos apuntados con canal y resultado', () => {
  const datos = {
    ...vacio,
    notas: [{ id: 'n1', texto: 'Prefiere mañanas', tipo: 'NOTA' as const, creadoEn: '2026-09-01T10:00:00Z', autor: 'Ana' }],
    contactos: [{ id: 'k1', canal: 'LLAMADA' as const, resultado: 'VA_A_VOLVER' as const, nota: 'Vuelve el lunes', creadoEn: '2026-10-01T09:00:00Z', autor: 'Ana' }],
  };
  const h = historiaDeClienta(datos, ver);
  assert.equal(h[0].titulo, 'La llamó · va a volver');
  assert.equal(h[0].detalle, '«Vuelve el lunes»');
  assert.equal(h[0].quien, 'Ana');
  assert.equal(historiaDeClienta(datos, { ...ver, verNotas: false }).some(e => e.tipo === 'NOTA'), false);
});

test('las clases seguidas de una semana van en una línea; una falta en medio las separa; y un separador por mes', () => {
  const h = historiaDeClienta({
    ...vacio,
    reservas: [
      // Semana del lunes 28-sep: lunes, miércoles (vino) y viernes 2-oct (vino).
      { id: 'a', estado: 'ASISTIDA', inicio: '2026-09-28T16:30:00Z', tipoClase: 'Mat', instructora: null },
      { id: 'b', estado: 'ASISTIDA', inicio: '2026-09-30T16:30:00Z', tipoClase: 'Mat', instructora: null },
      // Semana del 21-sep: vino el lunes, faltó el miércoles, vino el viernes.
      { id: 'c', estado: 'ASISTIDA', inicio: '2026-09-21T16:30:00Z', tipoClase: 'Mat', instructora: null },
      { id: 'd', estado: 'NO_ASISTIO', inicio: '2026-09-23T16:30:00Z', tipoClase: 'Mat', instructora: null },
      { id: 'e', estado: 'ASISTIDA', inicio: '2026-09-25T08:00:00Z', tipoClase: 'Reformer', instructora: null },
      // Agosto.
      { id: 'f', estado: 'ASISTIDA', inicio: '2026-08-31T16:30:00Z', tipoClase: 'Mat', instructora: null },
    ],
  }, ver);
  const items = compactarHistoria(h, { agruparClases: true, meses: true, hoyISO: '2026-10-01' });
  assert.deepEqual(items.map(i => i.tipo === 'MES' ? `[${i.titulo}]` : i.evento.titulo), [
    '[Septiembre]',
    'Vino a 2 clases',
    'Vino a Reformer',
    'No vino a Mat',
    'Vino a Mat',
    '[Agosto]',
    'Vino a Mat',
    '[Marzo 2025]',
    'Se dio de alta en el estudio',
  ]);
  const semana = items.find(i => i.tipo === 'EVENTO' && i.evento.tipo === 'CLASES');
  assert.equal(semana?.tipo === 'EVENTO' && semana.evento.detalle, 'lun 28 Mat · mié 30 Mat');
  // Sin agrupar (la vista «Clases»), cada clase en su línea.
  assert.equal(compactarHistoria(h, { agruparClases: false, meses: false, hoyISO: '2026-10-01' }).length, h.length);
});

test('los contactos se cuentan con el género de la persona', () => {
  const datos = { ...vacio, contactos: [
    { id: 'k1', canal: 'LLAMADA' as const, resultado: null, nota: null, creadoEn: '2026-10-01T09:00:00Z', autor: null },
    { id: 'k2', canal: 'EN_PERSONA' as const, resultado: null, nota: null, creadoEn: '2026-09-30T09:00:00Z', autor: null },
  ] };
  assert.deepEqual(historiaDeClienta(datos, ver).slice(0, 2).map(e => e.titulo), ['La llamó', 'Habló con ella en el estudio']);
  assert.deepEqual(historiaDeClienta(datos, { ...ver, genero: 'HOMBRE' }).slice(0, 2).map(e => e.titulo), ['Lo llamó', 'Habló con él en el estudio']);
});

test('sin fecha de alta no se inventa el alta (ni 1970)', () => {
  for (const fechaAlta of [null, undefined, '', 'no-es-una-fecha']) {
    const eventos = historiaDeClienta({ ...vacio, fechaAlta }, ver);
    assert.equal(eventos.some(e => e.tipo === 'ALTA'), false, String(fechaAlta));
  }
});

