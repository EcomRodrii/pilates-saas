import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasosMiApp, progresoMiApp, type DatosMiApp } from './mi-app-pasos.ts';

const base: DatosMiApp = {
  logo: true, favicon: true,
  apariencia: { resumen: 'Moderna · Serena · #7C6A52', propia: true },
  sinPublicar: false, portada: true, titular: true,
  clases: { total: 5, conFoto: 5 }, equipo: { total: 2, conFoto: 2 },
  tarjetasVisibles: 2, mensajeDestacado: true, fraseAMano: false, tieneDireccion: true,
};

test('siete pasos en el orden aprobado, cada uno con dónde lo ve y cuándo le llega', () => {
  const p = pasosMiApp(base);
  assert.deepEqual(p.map(x => x.id), ['logo', 'estilo', 'entrada', 'fotos', 'inicio', 'frase', 'compartir']);
  for (const x of p) {
    assert.ok(x.donde && x.cuando && x.porque && x.estado, x.id);
  }
  assert.deepEqual(p.map(x => x.peso), ['imprescindible', 'imprescindible', 'recomendado', 'recomendado', 'opcional', 'opcional', 'final']);
});

test('todo hecho: completa, 4 de 4; lo opcional no cuenta', () => {
  const pr = progresoMiApp(pasosMiApp({ ...base, tarjetasVisibles: 0, mensajeDestacado: false }));
  assert.equal(pr.hechos, 4);
  assert.equal(pr.total, 4);
  assert.equal(pr.titulo, 'Tu app está completa');
});

test('sin portada y con clases sin foto: se puede compartir y dice qué falta', () => {
  const pr = progresoMiApp(pasosMiApp({ ...base, portada: false, clases: { total: 5, conFoto: 3 } }));
  assert.equal(pr.hechos, 2);
  assert.ok(pr.listaParaCompartir);
  assert.match(pr.frase, /«La entrada a tu app» y «Fotos de tus clases y tu equipo»/);
  const fotos = pasosMiApp({ ...base, clases: { total: 5, conFoto: 3 } }).find(x => x.id === 'fotos')!;
  assert.equal(fotos.estado, '3 de 5 clases con foto · todo tu equipo con foto');
});

test('sin logo o con el color de serie no se puede compartir todavía', () => {
  const pr = progresoMiApp(pasosMiApp({ ...base, logo: false, apariencia: { resumen: 'x', propia: false } }));
  assert.equal(pr.listaParaCompartir, false);
  assert.match(pr.frase, /«Tu logo y tu icono» y «Color y estilo»/);
  const estilo = pasosMiApp({ ...base, apariencia: { resumen: 'x', propia: false } }).find(x => x.id === 'estilo')!;
  assert.equal(estilo.estado, 'Con el color de serie: pon el tuyo');
});

test('cambios sin publicar: se dice en el paso, sin darlo por terminado ni por perdido', () => {
  const estilo = pasosMiApp({ ...base, sinPublicar: true }).find(x => x.id === 'estilo')!;
  assert.match(estilo.estado, /tienes cambios sin publicar/);
  assert.equal(estilo.tono, 'falta');
  assert.equal(estilo.hecho, true);
});

test('el favicon sin saber no se cuenta como «sin icono»', () => {
  assert.equal(pasosMiApp({ ...base, favicon: undefined })[0].estado, 'Con logo');
  assert.equal(pasosMiApp({ ...base, favicon: false })[0].estado, 'Con logo · sin icono');
});

test('lo opcional vacío dice lo que pasa, no «te falta»', () => {
  const p = pasosMiApp({ ...base, tarjetasVisibles: 0, mensajeDestacado: false });
  assert.equal(p.find(x => x.id === 'inicio')!.estado, 'Nada (el inicio enseña solo sus clases)');
  assert.equal(p.find(x => x.id === 'frase')!.estado, 'Sin frase (no sale nada)');
  assert.equal(p.find(x => x.id === 'inicio')!.tono, 'nada');
});

test('con la App Store a la venta, el paso 7 la nombra (la fila de antes vive aquí)', () => {
  const p = pasosMiApp({ ...base, appEnTienda: true }).find(x => x.id === 'compartir')!;
  assert.match(p.estado, /App Store/);
  assert.doesNotMatch(pasosMiApp(base).find(x => x.id === 'compartir')!.estado, /App Store/);
});
