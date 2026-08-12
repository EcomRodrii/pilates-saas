import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverApariencia, fondoCss, familiaCss, urlFuente, fuenteValida,
  APARIENCIA_POR_DEFECTO, type AparienciaWidget,
} from './apariencia-widget.ts';

const params = (q: string) => new URLSearchParams(q);

test('sin nada guardado ni en la URL, todo queda como estaba', () => {
  assert.deepEqual(resolverApariencia(null), APARIENCIA_POR_DEFECTO);
  assert.equal(fondoCss(APARIENCIA_POR_DEFECTO), null);
  assert.equal(familiaCss(APARIENCIA_POR_DEFECTO), null);
});

test('lo guardado se respeta', () => {
  const g: Partial<AparienciaWidget> = { fondo: 'transparente', ocultarPie: true };
  const r = resolverApariencia(g);
  assert.equal(r.fondo, 'transparente');
  assert.equal(r.ocultarPie, true);
  assert.equal(fondoCss(r), 'transparent');
});

test('la URL pisa lo guardado', () => {
  const r = resolverApariencia({ fondo: '#FFFFFF' }, params('fondo=transparente&radio=0&solo-pestana=1'));
  assert.equal(r.fondo, 'transparente');
  assert.equal(r.radio, 0);
  assert.equal(r.soloPestana, true);
});

test('⚠️ un parámetro con basura NO apaga lo guardado', () => {
  // Un error de tecleo en el snippet no puede romperle la web al estudio sin
  // decir nada. Se ignora y queda lo suyo.
  const g: Partial<AparienciaWidget> = { fondo: '#101010', radio: 12 };
  const r = resolverApariencia(g, params('fondo=azul&radio=999&fuente=<script>'));
  assert.equal(r.fondo, '#101010');
  assert.equal(r.radio, 12);
  assert.equal(r.fuente, null);
});

test('⚠️ `pie=false` NO es «sin pie»: solo valen 1 y 0', () => {
  // `Boolean('false')` es `true`. Ese fallo aquí dejaría el pie escondido para
  // siempre en cuanto alguien escribiera `pie=false` creyendo que apaga.
  assert.equal(resolverApariencia(null, params('pie=false')).ocultarPie, false);
  assert.equal(resolverApariencia(null, params('pie=0')).ocultarPie, true);
  assert.equal(resolverApariencia(null, params('pie=1')).ocultarPie, false);
});

test('`radio=0` se distingue de «sin decir nada»', () => {
  // 0 es un valor legítimo (esquinas rectas) y un `||` lo habría tratado como
  // ausente, devolviendo el radio del tema.
  assert.equal(resolverApariencia({ radio: 12 }, params('radio=0')).radio, 0);
  assert.equal(resolverApariencia({ radio: 12 }, params('')).radio, 12);
});

test('⚠️ un nombre de fuente solo admite letras, números y espacios', () => {
  // Acaba en una declaración CSS y en el `href` de un `<link>`: comillas,
  // llaves y paréntesis son justo lo que haría falta para salirse de ahí.
  assert.equal(fuenteValida('Space Grotesk'), true);
  assert.equal(fuenteValida('Roboto Slab 2'), true);
  assert.equal(fuenteValida("Foo'; }"), false);
  assert.equal(fuenteValida('url(javascript:alert(1))'), false);
  assert.equal(fuenteValida(''), false);
  assert.equal(fuenteValida('a'.repeat(41)), false);
});

test('la familia CSS lleva su pila de reserva detrás', () => {
  // Mientras la fuente carga —o si no existe— sin reserva se ve Times New
  // Roman, que es peor que la tipografía de Tentare.
  const r = resolverApariencia(null, params('fuente=Space Grotesk'));
  assert.equal(familiaCss(r), "'Space Grotesk', system-ui, sans-serif");
});

test('⚠️ la URL de Google Fonts usa `+`, no `%2B`', () => {
  // Codificar después de meter los `+` los convierte en `%2B` y Google
  // devuelve un 400: estarías pidiendo una familia con un signo más literal.
  const r = resolverApariencia(null, params('fuente=Space Grotesk'));
  const u = urlFuente(r)!;
  assert.ok(u.includes('family=Space+Grotesk'), u);
  assert.ok(!u.includes('%2B'), u);
});

test('sin fuente elegida no se carga ninguna', () => {
  assert.equal(urlFuente(APARIENCIA_POR_DEFECTO), null);
});
