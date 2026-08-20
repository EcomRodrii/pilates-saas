import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverConfigWidget, fuenteDeDataset, CONFIG_WIDGET_POR_DEFECTO,
  fuenteValida, familiaCssDe, urlFuenteGoogle,
} from './config-widget.ts';

test('sin parámetros devuelve exactamente los defaults (todo visible, sin filtros)', () => {
  const c = resolverConfigWidget(new URLSearchParams(''));
  assert.deepEqual(c, CONFIG_WIDGET_POR_DEFECTO);
});

test('listas separadas por coma, con espacios y UUIDs', () => {
  const c = resolverConfigWidget(new URLSearchParams(
    'tipos=tc-r, 0b7e6a1c-2f34-4d5e-9a8b-1c2d3e4f5a6b&instructoras=ins-1&salas=sala-1,sala-2',
  ));
  assert.deepEqual(c.tipos, ['tc-r', '0b7e6a1c-2f34-4d5e-9a8b-1c2d3e4f5a6b']);
  assert.deepEqual(c.instructoras, ['ins-1']);
  assert.deepEqual(c.salas, ['sala-1', 'sala-2']);
});

test('un id con basura se descarta sin tumbar el resto de la lista', () => {
  const c = resolverConfigWidget(new URLSearchParams('tipos=tc-r,<script>,tc-m,"x"'));
  assert.deepEqual(c.tipos, ['tc-r', 'tc-m']);
});

test('booleanos: 1/true/vacío encienden, 0/false apagan, basura se ignora', () => {
  const on = (q: string) => resolverConfigWidget(new URLSearchParams(q)).ocultarPrecio;
  assert.equal(on('ocultar-precio=1'), true);
  assert.equal(on('ocultar-precio=true'), true);
  // Atributo booleano escrito a pelo (data-ocultar-precio sin valor).
  assert.equal(on('ocultar-precio='), true);
  assert.equal(on('ocultar-precio=0'), false);
  assert.equal(on('ocultar-precio=false'), false);
  // Nunca Boolean('cualquiercosa').
  assert.equal(on('ocultar-precio=si'), false);
  assert.equal(on(''), false);
});

test('los tres toggles son independientes', () => {
  const c = resolverConfigWidget(new URLSearchParams('ocultar-nivel=1&ocultar-sustituta=true'));
  assert.equal(c.ocultarPrecio, false);
  assert.equal(c.ocultarNivel, true);
  assert.equal(c.ocultarSustituta, true);
});

test('vista solo acepta "hoy"; cualquier otra cosa cae a "todo"', () => {
  assert.equal(resolverConfigWidget(new URLSearchParams('vista=hoy')).vistaInicial, 'hoy');
  assert.equal(resolverConfigWidget(new URLSearchParams('vista=manana')).vistaInicial, 'todo');
  assert.equal(resolverConfigWidget(new URLSearchParams('')).vistaInicial, 'todo');
});

test('diseno solo acepta completo/ligero; basura queda en null (el default del modo)', () => {
  assert.equal(resolverConfigWidget(new URLSearchParams('diseno=completo')).diseno, 'completo');
  assert.equal(resolverConfigWidget(new URLSearchParams('diseno=ligero')).diseno, 'ligero');
  assert.equal(resolverConfigWidget(new URLSearchParams('diseno=bonito')).diseno, null);
});

test('colores: hex válido pasa, basura se ignora — nunca llega crudo al CSS', () => {
  const c = resolverConfigWidget(new URLSearchParams('marca=%23343825&fondo=%231C1F17&negro=%23F3F1E9'));
  assert.equal(c.colorPrimario, '#343825');
  assert.equal(c.colorFondo, '#1C1F17');
  assert.equal(c.colorNegro, '#F3F1E9');
  const mala = resolverConfigWidget(new URLSearchParams('marca=red&fondo=url(x)&negro=%23GGG'));
  assert.equal(mala.colorPrimario, null);
  assert.equal(mala.colorFondo, null);
  assert.equal(mala.colorNegro, null);
});

test('fuenteDeDataset traduce kebab a camelCase como hace DOMStringMap', () => {
  // Así llegan los data-* del contenedor de Modo B: data-ocultar-precio →
  // dataset.ocultarPrecio, data-tipos → dataset.tipos.
  const c = resolverConfigWidget(fuenteDeDataset({
    tipos: 'tc-r,tc-m', ocultarPrecio: 'true', vista: 'hoy', negro: '#111111',
  }));
  assert.deepEqual(c.tipos, ['tc-r', 'tc-m']);
  assert.equal(c.ocultarPrecio, true);
  assert.equal(c.vistaInicial, 'hoy');
  assert.equal(c.colorNegro, '#111111');
});

test('fuente y fuente-display: nombre de Google Fonts válido pasa, basura se ignora', () => {
  const c = resolverConfigWidget(new URLSearchParams('fuente=Space+Grotesk&fuente-display=Lobster'));
  assert.equal(c.fuente, 'Space Grotesk');
  assert.equal(c.fuenteDisplay, 'Lobster');
  // La puerta anti-XSS: nada que sirva para salirse de la declaración CSS o
  // del <link> que la carga — mismo criterio que fuenteValida en Modo A.
  const mala = resolverConfigWidget(new URLSearchParams("fuente=Foo'; }&fuente-display=url(javascript:alert(1))"));
  assert.equal(mala.fuente, null);
  assert.equal(mala.fuenteDisplay, null);
  // Sin parámetro, null: display hereda de fuente EN EL CONSUMIDOR, no aquí.
  assert.equal(resolverConfigWidget(new URLSearchParams('fuente=Lobster')).fuenteDisplay, null);
});

test('fuente por data-* (Modo B): data-fuente-display llega como dataset.fuenteDisplay', () => {
  const c = resolverConfigWidget(fuenteDeDataset({ fuente: 'Space Grotesk', fuenteDisplay: 'Lobster' }));
  assert.equal(c.fuente, 'Space Grotesk');
  assert.equal(c.fuenteDisplay, 'Lobster');
});

test('fuenteValida / familiaCssDe / urlFuenteGoogle: el trío compartido de los dos modos', () => {
  assert.equal(fuenteValida('Space Grotesk'), true);
  assert.equal(fuenteValida("Foo'; }"), false);
  assert.equal(fuenteValida(''), false);
  assert.equal(fuenteValida('a'.repeat(41)), false);
  assert.equal(familiaCssDe('Lobster'), "'Lobster', system-ui, sans-serif");
  // %20 → '+' DESPUÉS de codificar (al revés, Google devuelve 400) y siempre
  // con display=swap: la carga nunca bloquea el pintado.
  const url = urlFuenteGoogle('Space Grotesk');
  assert.ok(url!.includes('family=Space+Grotesk'));
  assert.ok(url!.includes('display=swap'));
  assert.equal(urlFuenteGoogle("Foo'; }"), null);
  assert.equal(urlFuenteGoogle(null), null);
});

test('fuenteDeDataset: atributo ausente es null, no cadena vacía', () => {
  const f = fuenteDeDataset({ studio: 'mi-estudio' });
  assert.equal(f.get('ocultar-precio'), null);
});
