import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FICHAS, RUTAS, fichaDe, progresoDeRuta, rutaDeGuia, rutaEmpezada, leerHechas, marcarHecha, CLAVE_HECHAS } from './academy.ts';
import { articuloDe } from './registro.ts';

const existe = (clave: string) => { const [c, s] = clave.split('/'); const a = articuloDe(c, s); return !!a && a.estado === 'publicado'; };

test('cada guía de cada ruta existe, está publicada y lleva su ficha; ninguna se repite', () => {
  const vistas = new Set<string>();
  for (const r of RUTAS) {
    assert.ok(r.guias.length >= 3, `${r.id}: una ruta de menos de tres guías no es una ruta`);
    for (const g of r.guias) {
      assert.ok(existe(g), `${r.id}: la guía ${g} no existe o no está publicada`);
      assert.ok(fichaDe(g), `${r.id}: la guía ${g} no tiene ficha`);
      assert.ok(!vistas.has(g), `${g} está en dos rutas`);
      vistas.add(g);
    }
  }
});

test('no hay fichas huérfanas: toda ficha es de una guía que existe y está en alguna ruta', () => {
  const enRutas = new Set(RUTAS.flatMap(r => r.guias));
  for (const clave of Object.keys(FICHAS)) {
    assert.ok(existe(clave), `la ficha ${clave} es de una guía que no existe`);
    assert.ok(enRutas.has(clave), `la ficha ${clave} no está en ninguna ruta`);
  }
});

test('las fichas son cortas y sin promesas de tiempo (la duración solo la pone un vídeo real)', () => {
  for (const [clave, f] of Object.entries(FICHAS)) {
    assert.ok(f.resultado.length >= 10 && f.resultado.length <= 120, clave);
    assert.doesNotMatch(f.resultado, /\d+\s*(min|minutos|segundos|horas)/i, `${clave}: no se inventan duraciones`);
  }
});

test('el progreso de una ruta cuenta solo sus guías y dice cuál toca', () => {
  const ruta = RUTAS[0];
  const hechas = new Set([ruta.guias[0], ruta.guias[1], 'otra/cosa']);
  assert.deepEqual(progresoDeRuta(ruta, hechas), { hechas: 2, total: ruta.guias.length, siguiente: ruta.guias[2] });
  assert.equal(progresoDeRuta(ruta, new Set(ruta.guias)).siguiente, null);
});

function almacenFalso(inicial?: string) {
  let v = inicial ?? null;
  return { getItem: () => v, setItem: (_: string, x: string) => { v = x; }, valor: () => v };
}

test('marcar una guía como hecha se recuerda; desmarcar la quita; un almacenamiento roto no tumba nada', () => {
  const a = almacenFalso();
  assert.deepEqual([...marcarHecha(a, 'empezar/crear-tu-cuenta', true)], ['empezar/crear-tu-cuenta']);
  assert.deepEqual([...leerHechas(a)], ['empezar/crear-tu-cuenta']);
  assert.equal(marcarHecha(a, 'empezar/crear-tu-cuenta', false).size, 0);
  assert.equal(leerHechas(almacenFalso('{no es json')).size, 0);
  assert.equal(leerHechas(almacenFalso(JSON.stringify({ no: 'lista' }))).size, 0);
  assert.equal(leerHechas(null).size, 0);
  const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(leerHechas(roto).size, 0);
  assert.doesNotThrow(() => marcarHecha(roto, 'a/b', true));
  assert.ok(CLAVE_HECHAS.startsWith('tentare:'));
});

test('la ruta de una guía, con su anterior y su siguiente', () => {
  const r = RUTAS[0];
  assert.deepEqual(rutaDeGuia(r.guias[0]), { ruta: r, indice: 0, anterior: null, siguiente: r.guias[1] });
  assert.equal(rutaDeGuia(r.guias[r.guias.length - 1])?.siguiente, null);
  assert.equal(rutaDeGuia('reservas/no-shows'), null);
});

test('«sigue donde lo dejaste»: solo con una ruta empezada y sin terminar', () => {
  assert.equal(rutaEmpezada(new Set()), null);
  const [a, b] = RUTAS;
  assert.equal(rutaEmpezada(new Set([a.guias[0]]))?.siguiente, a.guias[1]);
  // Terminada la primera, salta a la siguiente que esté empezada; con la primera completa y nada más, no hay nada que continuar.
  assert.equal(rutaEmpezada(new Set(a.guias)), null);
  assert.equal(rutaEmpezada(new Set([...a.guias, b.guias[0]]))?.ruta.id, b.id);
});
