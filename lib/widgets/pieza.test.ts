import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, esDisponible, widgetPorId, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor } from './config.ts';
import { firmaContenidoDe, paresNativa, urlPagina, type EntradaIntegracion } from './integracion.ts';
import { urlPopupPermitida } from './popup-url.ts';
import { firmaDeUrl } from './firma-contenido.ts';
import { fuenteDeDataset } from '../reservar/config-widget.ts';
import { ID_PIEZA, datasetConPares, esIdPieza, leerParesPieza } from './pieza.ts';
import { destinoDePieza, entradaDePieza, paresDePiezaNativa } from './pieza-destino.ts';

// El código del widget por ID (30-sep-2026): lo que se ve en la web del estudio
// con un código `w=<id>` tiene que ser EXACTAMENTE lo que habría llevado el
// código congelado de lo publicado. Si no, «Visto en» diría «versión distinta»
// de algo que sí es la de ahora, y el panel mentiría sobre lo publicado.

const ORIGEN = 'https://www.tentare.app';
const SLUG = 'pilates-centro';
const ID = 'Ab3dE5gH9k';

function w(id: string): WidgetDisponible {
  const x = widgetPorId(id);
  assert.ok(esDisponible(x), `${id} debería estar disponible`);
  return x;
}

const CONFIGS: Record<string, Partial<ConfigConstructor>> = {
  'por defecto': {},
  tipos: { tipos: ['tc-r', 'tc-m'] },
  'todo el contenido': {
    vista: 'hoy', tipos: ['tc-b', 'tc-a'], instructoras: ['ins-1'], salas: ['sala-1'],
    mostrarPrecio: false, mostrarNivel: false, mostrarSustituta: false, diseno: 'ligero', tiposPlan: ['BONO'],
  },
  'diseño propio': { identidad: 'propia', marca: '#112233', fondo: 'transparente', tema: 'oscuro', fuente: 'Playfair Display' },
  'semana y sin pie': { presentacion: 'semana', mostrarPie: false },
  'etiqueta propia': { etiqueta: 'insta-bio' },
  'cuentaInicio=bonos': { cuentaInicio: 'bonos' },
};

/** Lo que se guarda en `widget_piezas.config`: la config, pasada por JSON como la guarda la BD. */
function guardada(parcial: Partial<ConfigConstructor>): unknown {
  // `sesion` siempre: «Reserva una clase» sin clase no da código.
  return JSON.parse(JSON.stringify({ ...CONFIG_POR_DEFECTO, sesion: 'ses-1', ...parcial }));
}

/** La entrada del panel, con su origen: para comparar con `firmaContenidoDe`. */
function entradaPanel(x: WidgetDisponible, parcial: Partial<ConfigConstructor>): EntradaIntegracion {
  return { widget: x, config: { ...CONFIG_POR_DEFECTO, sesion: 'ses-1', ...parcial }, origen: ORIGEN, slug: SLUG };
}

/** Sigue el 307 de un código por ID: lo que devuelve la ruta, resuelto contra Tentare. */
function sigue(url: string, x: WidgetDisponible, parcial: Partial<ConfigConstructor>): URL {
  const u = new URL(url);
  const e = entradaDePieza({ widget: x.id, config: guardada(parcial) }, SLUG);
  const destino = destinoDePieza(e, SLUG, u.searchParams);
  assert.ok(destino.startsWith(`/reservar/${SLUG}`), `destino relativo y a /reservar: ${destino}`);
  return new URL(destino, ORIGEN);
}

test('⚠️ dentro de una página: lo que llega a /reservar firma igual que el código congelado de lo publicado', () => {
  let n = 0;
  for (const x of WIDGETS.filter(esDisponible)) {
    if (!x.metodos.includes('iframe')) continue;
    for (const [nombre, parcial] of Object.entries(CONFIGS)) {
      const llega = sigue(`${ORIGEN}/reservar/${SLUG}?embed=1&w=${ID}`, x, parcial);
      assert.equal(firmaDeUrl(llega.searchParams), firmaContenidoDe(entradaPanel(x, parcial), 'iframe'), `${x.id}/${nombre}`);
      assert.equal(llega.searchParams.get('embed'), '1', `${x.id}/${nombre}`);
      assert.equal(llega.searchParams.get('w'), null, `${x.id}/${nombre}: el destino no vuelve a entrar en el rewrite`);
      n++;
    }
  }
  assert.ok(n > 0);
});

test('⚠️ encima (popup): pasa por el runtime del popup y firma igual que su código congelado', () => {
  let n = 0;
  for (const x of WIDGETS.filter(esDisponible)) {
    if (!x.metodos.includes('popup')) continue;
    for (const [nombre, parcial] of Object.entries(CONFIGS)) {
      const abierta = urlPopupPermitida(`${ORIGEN}/reservar/${SLUG}?w=${ID}`, ORIGEN);
      assert.ok(abierta, 'el runtime del popup acepta un código por ID');
      const llega = sigue(abierta, x, parcial);
      assert.equal(firmaDeUrl(llega.searchParams), firmaContenidoDe(entradaPanel(x, parcial), 'popup'), `${x.id}/${nombre}`);
      assert.equal(llega.searchParams.get('ventana'), '1', `${x.id}/${nombre}: la marca de ventana se conserva`);
      n++;
    }
  }
  assert.ok(n > 0);
});

test('botón y enlace: la página completa de lo publicado, con su ancla', () => {
  for (const x of WIDGETS.filter(esDisponible)) {
    for (const [nombre, parcial] of Object.entries(CONFIGS)) {
      const llega = sigue(`${ORIGEN}/reservar/${SLUG}?w=${ID}`, x, parcial);
      const esperada = new URL(urlPagina(entradaPanel(x, parcial)));
      assert.equal(llega.pathname + llega.search + llega.hash, esperada.pathname + esperada.search + esperada.hash, `${x.id}/${nombre}`);
    }
  }
});

test('de la URL que llega se queda lo que la página no lee como código; lo que sí lee lo pone lo publicado', () => {
  const x = w('horario');
  const llega = sigue(
    `${ORIGEN}/reservar/${SLUG}?embed=1&w=${ID}&utm_source=insta&vista-previa=1&tipos=tc-otra&ocultar-precio=1&ref=a-mano`,
    x, { tipos: ['tc-r'] },
  );
  assert.equal(llega.searchParams.get('utm_source'), 'insta');
  assert.equal(llega.searchParams.get('vista-previa'), '1');
  assert.equal(llega.searchParams.get('tipos'), 'tc-r', 'un filtro retocado a mano no se mezcla con lo publicado');
  assert.equal(llega.searchParams.get('ocultar-precio'), null);
  assert.notEqual(llega.searchParams.get('ref'), 'a-mano');
  assert.equal(llega.searchParams.getAll('embed').length, 1, 'sin parámetros repetidos');
});

test('sin pieza (id que no existe, de otro estudio o widget retirado): la misma dirección sin `w`, que es el widget por defecto', () => {
  const entrante = new URLSearchParams(`embed=1&w=${ID}&utm_source=insta`);
  const destino = destinoDePieza(null, SLUG, entrante);
  assert.equal(destino, `/reservar/${SLUG}?embed=1&utm_source=insta`);
  assert.equal(destinoDePieza(null, SLUG, new URLSearchParams(`w=${ID}`)), `/reservar/${SLUG}`);
  assert.equal(entradaDePieza({ widget: 'no-existe', config: {} }, SLUG), null);
});

test('una config guardada con basura cae a los valores por defecto, campo a campo (leerConfig)', () => {
  const e = entradaDePieza({ widget: 'horario', config: { tipos: ['tc-r', '<script>'], salas: ['s 1'], sesion: '"x', marca: 'javascript:1', mostrarPrecio: 'no' } }, SLUG);
  assert.ok(e);
  assert.deepEqual(e.config.tipos, ['tc-r'], 'las listas, con la misma regla que la página');
  assert.deepEqual(e.config.salas, []);
  assert.equal(e.config.sesion, null);
  assert.equal(e.config.marca, null);
  assert.equal(e.config.mostrarPrecio, true);
  assert.equal(e.origen, '', 'los destinos son relativos: nunca una dirección de fuera');
});

// ── Sin marco (nativa) ───────────────────────────────────────────────────────

test('⚠️ sin marco: su `<div>` con lo publicado encima firma igual que el código congelado', () => {
  const x = w('horario');
  for (const [nombre, parcial] of Object.entries(CONFIGS)) {
    const e = entradaDePieza({ widget: x.id, config: guardada(parcial) }, SLUG);
    assert.ok(e);
    // Lo que da `dataset` de `<div data-tentare-booking data-studio="…" data-widget="…">`.
    const dataset = { tentareBooking: '', studio: SLUG, widget: ID };
    const efectivo = datasetConPares(dataset, leerParesPieza(JSON.parse(JSON.stringify({ pares: paresDePiezaNativa(e) })))!);
    assert.equal(firmaDeUrl(fuenteDeDataset(efectivo)), firmaContenidoDe(entradaPanel(x, parcial), 'nativa'), nombre);
    assert.equal(efectivo.studio, SLUG);
    assert.equal(efectivo.widget, undefined, 'el id no se queda como atributo');
  }
});

test('sin marco: lo publicado manda sobre lo que traiga el `<div>`; lo que la página no lee se queda', () => {
  const efectivo = datasetConPares(
    { studio: SLUG, widget: ID, tipos: 'tc-otra', ocultarPrecio: '', color: 'tomato' },
    [['tipos', 'tc-r'], ['identidad', 'estudio']],
  );
  assert.deepEqual(efectivo, { studio: SLUG, color: 'tomato', tipos: 'tc-r', identidad: 'estudio' });
});

test('sin marco: los pares de la nativa son los de `paresNativa`, sin nada más', () => {
  const e = entradaDePieza({ widget: 'horario', config: guardada({ tipos: ['tc-r'], mostrarPrecio: false }) }, SLUG);
  assert.ok(e);
  assert.deepEqual(paresDePiezaNativa(e), paresNativa(e));
});

test('la respuesta del servidor se lee con desconfianza', () => {
  assert.deepEqual(leerParesPieza({ pares: [['tipos', 'tc-r'], ['inventado', 'x']] }), [['tipos', 'tc-r']]);
  assert.equal(leerParesPieza(null), null);
  assert.equal(leerParesPieza({ pares: 'tipos=tc-r' }), null);
  assert.equal(leerParesPieza({ pares: [['tipos']] }), null);
  assert.equal(leerParesPieza({ pares: [['tipos', 1]] }), null);
  assert.equal(leerParesPieza({ pares: [['ref', 'x'.repeat(2001)]] }), null);
  assert.equal(leerParesPieza({ pares: Array.from({ length: 65 }, () => ['ref', 'x']) }), null);
});

test('el id: 10 caracteres base62, como exige la tabla', () => {
  assert.ok(esIdPieza(ID));
  for (const malo of ['', 'corto', 'Ab3dE5gH9kX', 'Ab3dE5gH9-', '../../etc/', null, undefined, 12345678901]) {
    assert.equal(esIdPieza(malo), false, String(malo));
  }
  // El mismo patrón que el CHECK de la migración (supabase/migrations/*_widget_piezas.sql).
  assert.equal(ID_PIEZA.source, '^[A-Za-z0-9]{10}$');
});
