import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPITULOS_DEMO, DURACION_DEMO_SEG, VIDEO_DEMO, capitulosVisibles, formatoMinuto } from './demo.ts';
import { SECCIONES, esSeccionId, esTarjetaId, seccionDeTarjeta } from './secciones.ts';

// La demo es un vídeo con un índice por capítulos. Los minutos los genera el
// montaje a partir de lo grabado; estos tests fijan lo que, si se rompe, deja un
// capítulo apuntando a una pantalla que no existe o a un minuto que el vídeo no
// tiene.

const SECCIONES_DE_LA_DEMO = SECCIONES.filter(s => s.id !== 'demo').map(s => s.id as string);

test('formatoMinuto: minutos y segundos, con horas si hacen falta', () => {
  assert.equal(formatoMinuto(0), '0:00');
  assert.equal(formatoMinuto(83), '1:23');
  assert.equal(formatoMinuto(600), '10:00');
  assert.equal(formatoMinuto(3725), '1:02:05');
  assert.equal(formatoMinuto(-4), '0:00');
});

test('sin vídeo publicado no hay duración ni minutos que prometer, y con él sí hay índice', () => {
  if (VIDEO_DEMO.url === null) return;
  assert.ok(DURACION_DEMO_SEG && DURACION_DEMO_SEG > 0, 'hay vídeo pero no se sabe cuánto dura');
  assert.ok(CAPITULOS_DEMO.length > 0, 'hay vídeo pero no hay índice');
});

test('cada capítulo es una sección real, una sola vez, y nunca la propia demo', () => {
  const vistos = new Set<string>();
  for (const c of CAPITULOS_DEMO) {
    assert.ok(esSeccionId(c.seccion), c.seccion);
    assert.notEqual(c.seccion, 'demo');
    assert.ok(!vistos.has(c.seccion), `${c.seccion} repetida`);
    vistos.add(c.seccion);
  }
  // Si hay índice, cubre TODAS las secciones: «una entrada por sección».
  if (CAPITULOS_DEMO.length > 0) assert.deepEqual([...vistos].sort(), [...SECCIONES_DE_LA_DEMO].sort());
});

test('los minutos van en orden y caben dentro del vídeo', () => {
  let anterior = -1;
  for (const c of CAPITULOS_DEMO) {
    assert.ok(c.inicioSeg > anterior, `${c.seccion}: el capítulo empieza antes que el anterior`);
    anterior = c.inicioSeg;
    let momento = c.inicioSeg - 1;
    for (const m of c.momentos) {
      assert.ok(esTarjetaId(m.tarjeta), `${c.seccion}: «${m.tarjeta}» no es una tarjeta`);
      assert.equal(seccionDeTarjeta(m.tarjeta), c.seccion, `${m.tarjeta} no es de ${c.seccion}`);
      assert.ok(m.inicioSeg >= momento, `${m.tarjeta}: fuera de orden`);
      momento = m.inicioSeg;
    }
    if (DURACION_DEMO_SEG !== null) assert.ok(momento < DURACION_DEMO_SEG, `${c.seccion}: pasa del final del vídeo`);
  }
});

test('capitulosVisibles: la gerencia solo ve los capítulos de lo que puede abrir', () => {
  const gerencia = capitulosVisibles(['estudio', 'clases', 'demo']);
  assert.ok(gerencia.every(c => c.seccion === 'estudio' || c.seccion === 'clases'));
  assert.deepEqual(capitulosVisibles([]), []);
});
