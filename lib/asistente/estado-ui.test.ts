import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_INICIAL, enVuelo, errorDeRespuesta, reducirAsistente, sugerenciasPara, textoSinSaldo, trocearTexto, TEXTOS,
  type AccionAsistente, type EstadoAsistente,
} from './estado-ui.ts';
import type { EventoAsistente } from './protocolo.ts';
import { ESTADO_DEL_MOMENTO, estadoParaPintar } from '../tenti/asistente.ts';

const aplicar = (s: EstadoAsistente, ...as: AccionAsistente[]) => as.reduce(reducirAsistente, s);
const ev = (e: EventoAsistente): AccionAsistente => ({ tipo: 'evento', e });

test('una pregunta con herramienta: los momentos de Tenti en orden, el texto y la tarjeta', () => {
  let s = aplicar(ESTADO_INICIAL, { tipo: 'preguntar', id: 't1', pregunta: '¿Qué clases hay mañana?' });
  assert.equal(s.momento, 'esperando');
  assert.ok(enVuelo(s));
  s = aplicar(s, ev({ t: 'inicio', conversacionId: 'c1', disponibles: 50 }));
  assert.equal(s.conversacionId, 'c1');
  assert.equal(s.disponibles, 50);
  s = aplicar(s, ev({ t: 'herramienta', id: 'tu', nombre: 'agenda_del_dia', etiqueta: 'Mirando la agenda…' }));
  assert.equal(s.momento, 'consultando');
  assert.equal(s.turnos[0].estado, 'Mirando la agenda…');
  s = aplicar(s, ev({ t: 'bloque', id: 'tu-0', bloque: { tipo: 'metricas', titulo: 'x', metricas: [] } }));
  assert.equal(s.momento, 'esperando');
  s = aplicar(s, ev({ t: 'referencias', refs: { EQUIPO_1: { nombre: 'Marta', href: null } } }));
  s = aplicar(s, ev({ t: 'texto', delta: 'Tienes 6 ' }), ev({ t: 'texto', delta: 'clases.' }));
  assert.equal(s.momento, 'respondiendo');
  assert.equal(s.turnos[0].texto, 'Tienes 6 clases.');
  assert.equal(s.turnos[0].estado, null);
  s = aplicar(s, ev({ t: 'aviso', codigo: 'CIFRA_SIN_RESPALDO' }), ev({ t: 'aviso', codigo: 'CIFRA_SIN_RESPALDO' }));
  assert.deepEqual(s.turnos[0].avisos, ['CIFRA_SIN_RESPALDO']);
  s = aplicar(s, ev({ t: 'fin', unidades: 1, disponibles: 49, motivo: 'OK' }));
  assert.equal(s.momento, 'terminado');
  assert.equal(s.disponibles, 49);
  assert.ok(!enVuelo(s));
  assert.equal(s.referencias.EQUIPO_1.nombre, 'Marta');
  // El «hecho» breve vuelve a reposo.
  assert.equal(aplicar(s, { tipo: 'reposo' }).momento, 'listo');
});

test('sin tarjetas termina en listo (no celebra); una aclaración pone cara de pregunta', () => {
  const base = aplicar(ESTADO_INICIAL, { tipo: 'preguntar', id: 't1', pregunta: 'hola' }, ev({ t: 'texto', delta: 'Hola.' }));
  assert.equal(aplicar(base, ev({ t: 'fin', unidades: 1, disponibles: 3, motivo: 'OK' })).momento, 'listo');
  assert.equal(aplicar(base, ev({ t: 'fin', unidades: 1, disponibles: 3, motivo: 'ACLARACION' })).momento, 'aclarando');
  // 'reposo' no toca un momento que no es «terminado».
  assert.equal(aplicar(base, { tipo: 'reposo' }).momento, 'respondiendo');
});

test('errores: el evento de error y una red cortada dejan lo que ya llegó y ponen Tenti en fallo', () => {
  const base = aplicar(ESTADO_INICIAL, { tipo: 'preguntar', id: 't1', pregunta: 'x' }, ev({ t: 'texto', delta: 'Tienes ' }));
  const e = aplicar(base, ev({ t: 'error', codigo: 'IA_NO_DISPONIBLE', mensaje: 'x' }));
  assert.equal(e.momento, 'fallo');
  assert.equal(e.turnos[0].error?.mensaje, TEXTOS.IA);
  assert.equal(e.turnos[0].texto, 'Tienes ');
  const red = aplicar(base, { tipo: 'cortado', error: { codigo: 'RED', mensaje: TEXTOS.RED, reintentar: true, nueva: false } });
  assert.equal(red.momento, 'fallo');
  assert.equal(red.turnos[0].fase, 'error');
  // Un «cortado» de un turno ya terminado no hace nada.
  const hecho = aplicar(base, ev({ t: 'fin', unidades: 1, disponibles: 1, motivo: 'OK' }));
  assert.equal(aplicar(hecho, { tipo: 'cortado', error: null }), hecho);
});

test('nueva conversación: de cero, pero el saldo se queda', () => {
  const s = aplicar(ESTADO_INICIAL, { tipo: 'saldo', disponibles: 12 }, { tipo: 'preguntar', id: 't', pregunta: 'x' }, ev({ t: 'inicio', conversacionId: 'c', disponibles: 12 }));
  const n = aplicar(s, { tipo: 'nueva' });
  assert.deepEqual(n.turnos, []);
  assert.equal(n.conversacionId, null);
  assert.equal(n.disponibles, 12);
});

test('reabrir: los turnos guardados, ya terminados y con sus tarjetas', () => {
  const s = aplicar(ESTADO_INICIAL, { tipo: 'cargar', conversacionId: 'c', referencias: {}, turnos: [{ pregunta: 'a', texto: 'b', bloques: [{ tipo: 'metricas', titulo: 't', metricas: [] }] }] });
  assert.equal(s.turnos[0].fase, 'hecho');
  assert.equal(s.turnos[0].bloques.length, 1);
  assert.equal(s.momento, 'listo');
});

test('los textos de error exactos de la spec (§5.5)', () => {
  assert.equal(errorDeRespuesta(429, { codigo: 'SIN_SALDO' }, '2026-10-06', null).mensaje, 'Has usado las consultas de este mes. Vuelven el 1 de noviembre.');
  assert.equal(textoSinSaldo('2026-12-20', null), 'Has usado las consultas de este mes. Vuelven el 1 de enero.');
  assert.equal(textoSinSaldo('2026-10-06', { renuevaEl: '2026-11-01' }), 'Has usado las consultas de este mes. Vuelven el 1 de noviembre.');
  assert.match(textoSinSaldo('2026-10-06', { enPrueba: true }), /prueba gratuita/);
  assert.equal(errorDeRespuesta(429, { codigo: 'TOPE_DIARIO_GLOBAL' }, '2026-10-06', null).mensaje, 'Por hoy no puedo responder más. Mañana vuelvo a estar disponible.');
  assert.equal(errorDeRespuesta(429, null, '2026-10-06', null).mensaje, 'Vas muy rápido: espera unos segundos y vuelve a preguntar.');
  const llena = errorDeRespuesta(409, { codigo: 'CONVERSACION_LLENA' }, '2026-10-06', null);
  assert.equal(llena.mensaje, 'Esta conversación ya es muy larga. Empieza una nueva para seguir.');
  assert.ok(llena.nueva && !llena.reintentar);
  assert.equal(errorDeRespuesta(409, { codigo: 'OTRA_PREGUNTA_EN_CURSO' }, '2026-10-06', null).mensaje, 'Ya estoy respondiendo otra pregunta en otra pestaña.');
  assert.equal(errorDeRespuesta(503, { codigo: 'NO_DISPONIBLE' }, '2026-10-06', null).mensaje, 'No he podido responder ahora. No se ha descontado ninguna consulta.');
  assert.ok(errorDeRespuesta(500, null, '2026-10-06', null).reintentar);
  assert.equal(errorDeRespuesta(403, null, '2026-10-06', null).mensaje, 'Tu plan no incluye el asistente.');
});

test('las sugerencias: las de dinero solo a quien lo ve', () => {
  const gerente = sugerenciasPara(false);
  assert.ok(!gerente.some(s => /facturado|pagos/.test(s)));
  assert.ok(sugerenciasPara(true).some(s => /facturado/.test(s)));
  assert.equal(sugerenciasPara(false, 3).length, 3);
});

test('el texto se trocea en marcas de persona e importes (para el chip y CifraPrivada)', () => {
  assert.deepEqual(trocearTexto('Con [ALUMNA_3] llevas 1.234,50 € y 40 € más.'), [
    { tipo: 'texto', texto: 'Con ' }, { tipo: 'ref', ref: 'ALUMNA_3' }, { tipo: 'texto', texto: ' llevas ' },
    { tipo: 'euros', texto: '1.234,50 €' }, { tipo: 'texto', texto: ' y ' }, { tipo: 'euros', texto: '40 €' }, { tipo: 'texto', texto: ' más.' },
  ]);
  assert.deepEqual(trocearTexto('Nada que marcar'), [{ tipo: 'texto', texto: 'Nada que marcar' }]);
});

test('la cara de Tenti: cada momento a su estado, y «buscando» con tope de animación', () => {
  assert.equal(ESTADO_DEL_MOMENTO.consultando, 'buscando');
  assert.equal(estadoParaPintar('consultando', false), 'buscando');
  assert.equal(estadoParaPintar('consultando', true), 'pensando');
  assert.equal(estadoParaPintar('fallo', true), 'error');
});
