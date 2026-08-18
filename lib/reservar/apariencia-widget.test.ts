import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverApariencia, fondoCss, familiaCss, urlFuente, fuenteValida,
  modoTextoDe, luminancia, radiosDe, coloresDe, familiaDisplayCss, urlFuenteDisplay,
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

// ── Color del texto ─────────────────────────────────────────────────────────

test('por defecto el texto se queda como estaba', () => {
  assert.equal(APARIENCIA_POR_DEFECTO.texto, 'auto');
  assert.equal(modoTextoDe(APARIENCIA_POR_DEFECTO), 'dia');
});

test('elegir «claro» pone la paleta de noche, que es la de letra clara', () => {
  // ⚠️ El nombre que ve la propietaria («texto claro») y el modo interno
  // («noche») son opuestos, y es fácil invertirlos sin darse cuenta.
  assert.equal(modoTextoDe(resolverApariencia({ texto: 'claro' })), 'noche');
  assert.equal(modoTextoDe(resolverApariencia({ texto: 'oscuro' })), 'dia');
});

test('en «auto», un fondo propio OSCURO aclara el texto solo', () => {
  assert.equal(modoTextoDe(resolverApariencia({ fondo: '#12131A', texto: 'auto' })), 'noche');
  assert.equal(modoTextoDe(resolverApariencia({ fondo: '#FFFFFF', texto: 'auto' })), 'dia');
});

test('⚠️ con fondo TRANSPARENTE, «auto» no adivina: se queda en oscuro', () => {
  // Un iframe no ve el documento que lo contiene, así que no hay dato con el
  // que decidir. Adivinar «probablemente su web es clara» dejaría ilegible a
  // quien la tenga oscura, sin avisar.
  assert.equal(modoTextoDe(resolverApariencia({ fondo: 'transparente', texto: 'auto' })), 'dia');
  // Y elegirlo a mano sí funciona, que es la salida que ofrece el panel.
  assert.equal(modoTextoDe(resolverApariencia({ fondo: 'transparente', texto: 'claro' })), 'noche');
});

test('⚠️ la luminancia pesa el verde, no hace la media de los canales', () => {
  // Un azul intenso pasaría por «claro» con una media y dejaría la letra
  // oscura ilegible encima.
  const azul = luminancia('#0000FF')!;
  const verde = luminancia('#00FF00')!;
  assert.ok(verde > azul * 5, `verde ${verde} vs azul ${azul}`);
  assert.equal(modoTextoDe(resolverApariencia({ fondo: '#0000FF', texto: 'auto' })), 'noche');
});

test('la luminancia entiende el hex de 3 dígitos y rechaza lo que no lo es', () => {
  assert.equal(luminancia('#fff'), luminancia('#ffffff'));
  assert.equal(luminancia('rojo'), null);
});

test('el parámetro `texto` de la URL pisa lo guardado, y la basura no', () => {
  assert.equal(resolverApariencia({ texto: 'oscuro' }, params('texto=claro')).texto, 'claro');
  assert.equal(resolverApariencia({ texto: 'oscuro' }, params('texto=azul')).texto, 'oscuro');
});

// ── Fase 1 rediseño del widget: extensión aditiva de tokens ────────────────

test('sin tocar los campos nuevos, todo queda en null (aspecto de siempre)', () => {
  assert.equal(APARIENCIA_POR_DEFECTO.fuenteDisplay, null);
  assert.equal(APARIENCIA_POR_DEFECTO.radioBoton, null);
  assert.equal(APARIENCIA_POR_DEFECTO.radioInput, null);
  assert.equal(APARIENCIA_POR_DEFECTO.superficie, null);
  assert.equal(urlFuenteDisplay(APARIENCIA_POR_DEFECTO), null);
  assert.equal(familiaDisplayCss(APARIENCIA_POR_DEFECTO), null);
});

test('los nuevos parámetros de URL pisan lo guardado, igual que los de siempre', () => {
  const r = resolverApariencia(null, params('fuente-display=Marcellus&radio-boton=8&radio-input=6&superficie=%23FFFFFF&tinta=%23111111&texto-secundario=%23888888&linea=%23DDDDDD&relleno=%23F3F3F3'));
  assert.equal(r.fuenteDisplay, 'Marcellus');
  assert.equal(r.radioBoton, 8);
  assert.equal(r.radioInput, 6);
  assert.equal(r.superficie, '#FFFFFF');
  assert.equal(r.tinta, '#111111');
  assert.equal(r.textoSecundario, '#888888');
  assert.equal(r.linea, '#DDDDDD');
  assert.equal(r.relleno, '#F3F3F3');
});

test('⚠️ un color inválido en la URL no apaga lo guardado', () => {
  const r = resolverApariencia({ superficie: '#123456' }, params('superficie=noesuncolor'));
  assert.equal(r.superficie, '#123456');
});

test('radiosDe: sin nada puesto, cae al valor por defecto de cada pieza', () => {
  const d = { tarjeta: 26, boton: 999, input: 12 };
  assert.deepEqual(radiosDe(APARIENCIA_POR_DEFECTO, d), { tarjeta: 26, boton: 999, input: 12 });
});

test('radiosDe: `radioBoton`/`radioInput` heredan de `radio` si no se tocan', () => {
  const d = { tarjeta: 26, boton: 999, input: 12 };
  const a = resolverApariencia({ radio: 10 });
  assert.deepEqual(radiosDe(a, d), { tarjeta: 10, boton: 10, input: 10 });
});

test('radiosDe: cada campo explícito gana sobre la herencia de `radio`', () => {
  const d = { tarjeta: 26, boton: 999, input: 12 };
  const a = resolverApariencia({ radio: 10, radioBoton: 20 });
  assert.deepEqual(radiosDe(a, d), { tarjeta: 10, boton: 20, input: 10 });
});

test('coloresDe: sin nada puesto, es exactamente el default (misma referencia de valores)', () => {
  const d = { superficie: '#FFFFFF', tinta: '#221C19', textoSecundario: '#82766E', linea: '#E9E1D9', relleno: '#F3EDE7' };
  assert.deepEqual(coloresDe(APARIENCIA_POR_DEFECTO, d), d);
});

test('coloresDe: solo se pisa lo que se toca', () => {
  const d = { superficie: '#FFFFFF', tinta: '#221C19', textoSecundario: '#82766E', linea: '#E9E1D9', relleno: '#F3EDE7' };
  const a = resolverApariencia({ tinta: '#000000' });
  assert.deepEqual(coloresDe(a, d), { ...d, tinta: '#000000' });
});
