import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RADIO_BOTON, RUTA_BOTON_VIVO, SLUG_POPUP, VAR_FONDO, VAR_RADIO, VAR_TEXTO,
  cssBotonVivo, leerBotonVivo, slugDePopup, usaBotonVivo, type BotonVivo,
} from './boton-vivo.ts';
import { APARIENCIA_POR_DEFECTO, radiosDe } from '../reservar/apariencia-widget.ts';
import { FORMAS_WEB } from '../reservar/estilo-web-tipos.ts';

const O = 'https://www.tentare.app';
const BOTON: BotonVivo = { fondo: '#1B2418', texto: '#F2F6EE', esquinas: 'recto' };

/** El `style` del popup por defecto de la Fase D (diseño §2), con la doble declaración. */
const STYLE_DOBLE = 'display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 22px;font:inherit;font-weight:600;font-size:15px;line-height:1.2;text-decoration:none;cursor:pointer;background:#343825;background:var(--tentare-boton,#343825);color:#FFFFFF;color:var(--tentare-boton-texto,#FFFFFF);border:1.5px solid #343825;border:1.5px solid var(--tentare-boton,#343825);border-radius:999px;border-radius:var(--tentare-boton-radio,999px);';

// ── leerBotonVivo ────────────────────────────────────────────────────────────

test('leerBotonVivo: hex de 3 o 6 cifras y las esquinas del enum; devuelve solo esas tres claves', () => {
  assert.deepEqual(leerBotonVivo({ fondo: '#abc', texto: '#AABBCC', esquinas: 'pill' }), { fondo: '#abc', texto: '#AABBCC', esquinas: 'pill' });
  for (const esquinas of FORMAS_WEB) assert.deepEqual(leerBotonVivo({ ...BOTON, esquinas })?.esquinas, esquinas);
  // Una clave de más no viaja: lo que sale es un objeto nuevo.
  assert.deepEqual(leerBotonVivo({ ...BOTON, studio_id: 'x', css: '}' }), BOTON);
});

test('⚠️ leerBotonVivo: cualquier cosa que no sea hex o del enum → null (se queda el respaldo)', () => {
  const malos: unknown[] = [
    { ...BOTON, fondo: 'red' },
    { ...BOTON, fondo: '#fff;}' },
    { ...BOTON, fondo: '#12345' },
    { ...BOTON, texto: 'url(x)' },
    { ...BOTON, texto: 'var(--x)' },
    { ...BOTON, fondo: '#1B241880' },
    { ...BOTON, fondo: ' #1B2418' },
    { ...BOTON, esquinas: 'cuadradas' },
    { ...BOTON, esquinas: 'toString' },
    { ...BOTON, esquinas: 999 },
    { fondo: BOTON.fondo, texto: BOTON.texto },
    null, undefined, 'x', 7, [BOTON.fondo, BOTON.texto, 'recto'],
  ];
  for (const m of malos) assert.equal(leerBotonVivo(m), null, JSON.stringify(m));
});

// ── cssBotonVivo ─────────────────────────────────────────────────────────────

const REGLA = /^\[data-tentare-popup\*="\/reservar\/[A-Za-z0-9-]+\?"\]\{--tentare-boton:#[0-9a-fA-F]{3,6};--tentare-boton-texto:#[0-9a-fA-F]{3,6};--tentare-boton-radio:(999|13|6)px\}$/;

test('cssBotonVivo: una regla por estudio, con las tres variables y nada más', () => {
  assert.equal(
    cssBotonVivo('alba', BOTON),
    '[data-tentare-popup*="/reservar/alba?"]{--tentare-boton:#1B2418;--tentare-boton-texto:#F2F6EE;--tentare-boton-radio:6px}',
  );
  for (const esquinas of FORMAS_WEB) for (const slug of ['alba', 'pilates-centro-2', 'A'.repeat(100)]) {
    assert.match(cssBotonVivo(slug, { fondo: '#abc', texto: '#FFFFFF', esquinas })!, REGLA, `${slug}/${esquinas}`);
  }
});

test('⚠️ cssBotonVivo es anti-inyección: un slug o un color raro no escriben CSS', () => {
  for (const slug of ['a"b', 'a]b', 'a{b', 'a b', '', 'a/b', 'a?b', 'á', 'A'.repeat(101), 'x"]{}body{display:none}[x="']) {
    assert.equal(cssBotonVivo(slug, BOTON), null, slug);
  }
  for (const b of [
    { ...BOTON, fondo: '#fff;}body{display:none' },
    { ...BOTON, texto: 'red' },
    { ...BOTON, fondo: 'var(--x)' },
    { ...BOTON, esquinas: 'x' as BotonVivo['esquinas'] },
  ]) assert.equal(cssBotonVivo('alba', b), null, JSON.stringify(b));
  // Y lo que sí sale nunca lleva nada con lo que salir del bloque.
  const css = cssBotonVivo('alba', BOTON)!;
  assert.equal((css.match(/[{}]/g) ?? []).length, 2);
  assert.ok(!/<|\/\*|@|url\(|expression/i.test(css));
});

// ── slugDePopup ──────────────────────────────────────────────────────────────

test('slugDePopup: el slug de lo que el runtime abriría, en cualquier origen de Tentare y con el apex como www', () => {
  assert.equal(slugDePopup(`${O}/reservar/pilates-centro?embed=1&tab=clases&ref=web-horario`, O), 'pilates-centro');
  // Otra instalación de Tentare (la de las pruebas e2e, en http).
  const T = 'http://tentare.example.com';
  assert.equal(slugDePopup(`${T}/reservar/alba?embed=1&tab=clases`, T), 'alba');
  // El apex redirige a www: el runtime lo abre, y el botón también sigue el estilo.
  assert.equal(slugDePopup('https://tentare.app/reservar/alba?embed=1', O), 'alba');
});

test('slugDePopup: null si el runtime no lo abriría, o si es la vista previa del panel', () => {
  for (const mala of [
    'https://evil.example.com/reservar/alba?embed=1',
    `${O}/reservar/a/b?embed=1`,
    `${O}/configuracion`,
    `${O}/reservar/${'a'.repeat(101)}?embed=1`,
    null,
    '',
  ]) assert.equal(slugDePopup(mala, O), null, String(mala));
  // La vista previa se pinta con el borrador: nada que pedir.
  assert.equal(slugDePopup(`${O}/reservar/alba?embed=1&vista-previa=1`, O), null);
});

// ── usaBotonVivo ─────────────────────────────────────────────────────────────

test('usaBotonVivo: sí con la doble declaración; no si un filtro se comió los var() (queda el literal)', () => {
  assert.equal(usaBotonVivo(STYLE_DOBLE), true);
  // Lo que dejaría un filtro de HTML que no acepta `var()`: las declaraciones
  // con variable, fuera; los literales, en su sitio.
  const filtrado = STYLE_DOBLE.split(';').filter(d => !d.includes('var(')).join(';');
  assert.ok(filtrado.includes('background:#343825') && filtrado.includes('border-radius:999px'));
  assert.equal(usaBotonVivo(filtrado), false);
  // Un código de antes (literal) y un botón sin `style`.
  assert.equal(usaBotonVivo('background:#343825;color:#FFFFFF;border:1.5px solid #343825;border-radius:999px;'), false);
  assert.equal(usaBotonVivo(null), false);
  assert.equal(usaBotonVivo(''), false);
  // Contorno: el fondo no lleva variable, pero el color y el borde sí.
  assert.equal(usaBotonVivo('background:transparent;color:#343825;color:var(--tentare-boton,#343825);'), true);
});

// ── Guardianes ───────────────────────────────────────────────────────────────

test('⚠️ guardián: RADIO_BOTON es el radio de botón que pinta la ventana por dentro con cada «Esquinas»', () => {
  const x = { tarjeta: 1, boton: 1, input: 1 };
  for (const f of FORMAS_WEB) {
    assert.equal(RADIO_BOTON[f], `${radiosDe({ ...APARIENCIA_POR_DEFECTO, forma: f }, x).boton}px`, f);
  }
});

test('⚠️ guardián: las claves de RADIO_BOTON son exactamente FORMAS_WEB', () => {
  assert.deepEqual(Object.keys(RADIO_BOTON).sort(), [...FORMAS_WEB].sort());
});

test('las constantes que comparten el código, el script y el endpoint', () => {
  assert.equal(RUTA_BOTON_VIVO, '/api/public/widget-boton');
  assert.deepEqual([VAR_FONDO, VAR_TEXTO, VAR_RADIO], ['--tentare-boton', '--tentare-boton-texto', '--tentare-boton-radio']);
  // El mismo juego de caracteres que la puerta del runtime (./popup-url.ts), con tope.
  assert.ok(SLUG_POPUP.test('pilates-centro-2'));
  assert.ok(!SLUG_POPUP.test('pilates_centro'));
});
