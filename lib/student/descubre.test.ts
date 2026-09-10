import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tarjetasDescubre, type BannerMin } from './descubre.ts';

const HOY = '2026-09-10';
const IMG = 'https://cdn.example.com/foto.jpg';

function banner(extra: Partial<BannerMin> = {}): BannerMin {
  return { id: 'b1', imagenUrl: IMG, titulo: 'Nuevas clases', linkValor: '/reservar', ...extra };
}

test('la ventana de fechas incluye el primer y el último día', () => {
  const dentro = [
    banner({ id: 'sin-fechas' }),
    banner({ id: 'empieza-hoy', fechaInicio: HOY }),
    banner({ id: 'acaba-hoy', fechaFin: HOY }),
    banner({ id: 'alrededor', fechaInicio: '2026-09-01', fechaFin: '2026-09-30' }),
  ];
  assert.deepEqual(tarjetasDescubre(dentro, HOY).map((t) => t.id).sort(), ['acaba-hoy', 'alrededor', 'empieza-hoy', 'sin-fechas']);
});

test('fuera de la ventana no se pinta', () => {
  const fuera = [
    banner({ id: 'futuro', fechaInicio: '2026-09-11' }),
    banner({ id: 'pasado', fechaFin: '2026-09-09' }),
  ];
  assert.deepEqual(tarjetasDescubre(fuera, HOY), []);
});

test('un enlace `javascript:` no llega a la tarjeta', () => {
  // El editor valida al guardar, pero quien pinta no puede fiarse de eso: el
  // portal que saneaba esto se borró (#1591) y la fila la escribe el estudio.
  const [t] = tarjetasDescubre([banner({ linkValor: 'javascript:alert(1)' })], HOY);
  assert.equal(t.enlace, null, 'la tarjeta se pinta, pero sin enlace');
  assert.equal(t.titulo, 'Nuevas clases');
});

test('distingue enlace interno de externo', () => {
  const [dentro] = tarjetasDescubre([banner({ linkValor: '/bonos' })], HOY);
  assert.deepEqual(dentro.enlace, { interno: true, valor: '/bonos' });
  const [fuera] = tarjetasDescubre([banner({ linkValor: 'https://estudio.example/taller' })], HOY);
  assert.deepEqual(fuera.enlace, { interno: false, valor: 'https://estudio.example/taller' });
});

test('sin imagen válida no hay tarjeta', () => {
  // En este bloque la foto ES la tarjeta. Y `http://` la bloquea el navegador
  // por contenido mixto: se vería un hueco, no una tarjeta.
  assert.deepEqual(tarjetasDescubre([banner({ imagenUrl: 'http://cdn.example.com/f.jpg' })], HOY), []);
  assert.deepEqual(tarjetasDescubre([banner({ imagenUrl: 'javascript:alert(1)' })], HOY), []);
  assert.deepEqual(tarjetasDescubre([banner({ imagenUrl: '' })], HOY), []);
});

test('manda `orden`, y el empate se rompe siempre igual', () => {
  const bs = [
    banner({ id: 'c', orden: 2 }), banner({ id: 'a', orden: 1 }),
    banner({ id: 'b', orden: 1 }), banner({ id: 'd' }),
  ];
  assert.deepEqual(tarjetasDescubre(bs, HOY).map((t) => t.id), ['d', 'a', 'b', 'c']);
});

test('sin banners no revienta', () => {
  assert.deepEqual(tarjetasDescubre(undefined, HOY), []);
  assert.deepEqual(tarjetasDescubre(null, HOY), []);
  assert.deepEqual(tarjetasDescubre([], HOY), []);
});
