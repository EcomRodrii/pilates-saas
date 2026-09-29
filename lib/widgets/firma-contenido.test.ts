import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, esDisponible, widgetPorId, type MetodoIntegracion, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor } from './config.ts';
import { firmaContenidoDe, generarCodigo, paresNativa, urlEmbebido, type EntradaIntegracion } from './integracion.ts';
import { urlPopupPermitida } from './popup-url.ts';
import { CLAVES_FIRMA, VERSION_FIRMA, firmaDeUrl } from './firma-contenido.ts';
import { FIRMA_CONTENIDO_VALIDA } from './pegado.ts';
import { PARAMS_DISENO_PROPIO } from '../reservar/estilo-web.ts';
import { fuenteDeDataset } from '../reservar/config-widget.ts';

const ORIGEN = 'https://www.tentare.app';
const SLUG = 'pilates-centro';

function w(id: string): WidgetDisponible {
  const x = widgetPorId(id);
  assert.ok(esDisponible(x), `${id} debería estar disponible`);
  return x;
}
function entrada(x: WidgetDisponible | string, parcial: Partial<ConfigConstructor> = {}): EntradaIntegracion {
  const widget = typeof x === 'string' ? w(x) : x;
  // `sesion` siempre: «Reserva una clase» sin clase no da código.
  return { widget, config: { ...CONFIG_POR_DEFECTO, sesion: 'ses-1', ...parcial }, origen: ORIGEN, slug: SLUG, colorEstudio: '#7A2E4F' };
}

// Las del diseño (§3) y las que tocan TODO lo que emite el generador, para que
// el guardián de claves vea cada parámetro al menos una vez.
const CONFIGS: Record<string, Partial<ConfigConstructor>> = {
  'por defecto': {},
  tipos: { tipos: ['tc-r', 'tc-m'] },
  'ocultar precio': { mostrarPrecio: false },
  'diseño propio con fuente con espacio': { identidad: 'propia', marca: '#123456', fuente: 'Playfair Display', fuenteDisplay: 'DM Serif Display' },
  'presentacion=semana': { presentacion: 'semana' },
  'pie=0': { mostrarPie: false },
  'etiqueta propia': { etiqueta: 'insta-bio' },
  'sin etiqueta': { etiqueta: '' },
  'cuentaInicio=bonos': { cuentaInicio: 'bonos' },
  'todo el contenido': {
    vista: 'hoy', tipos: ['tc-b', 'tc-a'], instructoras: ['ins-1', 'ins-2'], salas: ['sala-1'],
    mostrarPrecio: false, mostrarNivel: false, mostrarSustituta: false, diseno: 'ligero', tiposPlan: ['BONO', 'MENSUAL'],
  },
  'todo el diseño': {
    identidad: 'propia', marca: '#112233', fondo: 'transparente', tinta: '#f0f0f0', superficie: '#1a1a1a',
    linea: '#333333', tema: 'oscuro', forma: 'recto', densidad: 'compacta', fuente: 'Playfair Display', fuenteDisplay: 'Poppins',
  },
  'lo que no llega a la página': { ancho: 'completo', cargaDiferida: false, textoBoton: 'Ven a probar', estiloBoton: 'contorno' },
};

const EMBEBIDOS = ['iframe', 'popup'] as const satisfies readonly MetodoIntegracion[];

function* matriz(): Generator<{ nombre: string; e: EntradaIntegracion; m: (typeof EMBEBIDOS)[number] }> {
  for (const x of WIDGETS.filter(esDisponible)) {
    for (const [c, parcial] of Object.entries(CONFIGS)) {
      for (const m of EMBEBIDOS) {
        if (x.metodos.includes(m)) yield { nombre: `${x.id}/${m}/${c}`, e: entrada(x, parcial), m };
      }
    }
  }
}

/** El valor de un atributo tal como sale en el código copiado (`attr="…"` en HTML, `attr='…'` en JSX). */
function atributo(codigo: string, nombre: string): string {
  const m = codigo.match(new RegExp(`\\s${nombre}=(?:"([^"]*)"|'([^']*)')`));
  assert.ok(m, `sin ${nombre} en el código`);
  return m[1] ?? m[2];
}

/**
 * Lo que la página recibe de verdad: el `src` del iframe pegado o, en el
 * popup, el `data-tentare-popup` pasado por el runtime (`urlPopupPermitida`,
 * que añade `ventana=1` y reserializa `,` → `%2C` y el espacio → `+`).
 */
function urlQueLlega(e: EntradaIntegracion, m: (typeof EMBEBIDOS)[number], plataforma: 'html' | 'react'): string {
  const { codigo } = generarCodigo(e, m, plataforma);
  if (m === 'iframe') return atributo(codigo, 'src');
  const abierta = urlPopupPermitida(atributo(codigo, 'data-tentare-popup'), ORIGEN);
  assert.ok(abierta, 'el runtime del popup la rechazó');
  return abierta;
}

// ── Ida y vuelta: la firma del panel es la que calcula la página ─────────────

test('⚠️ ida y vuelta: la firma del panel es la de la URL que llega a la página (iframe y popup, HTML y React)', () => {
  let n = 0;
  for (const { nombre, e, m } of matriz()) {
    const panel = firmaContenidoDe(e, m);
    assert.ok(panel, nombre);
    assert.equal(panel, firmaDeUrl(new URL(urlEmbebido(e, m)).searchParams), nombre);
    for (const plataforma of ['html', 'react'] as const) {
      assert.equal(firmaDeUrl(new URL(urlQueLlega(e, m, plataforma)).searchParams), panel, `${nombre}/${plataforma}`);
    }
    n++;
  }
  // Que la matriz no se quede corta en silencio (un filtro mal puesto la vaciaría).
  const esperados = WIDGETS.filter(esDisponible)
    .reduce((s, x) => s + EMBEBIDOS.filter(m => x.metodos.includes(m)).length, 0) * Object.keys(CONFIGS).length;
  assert.ok(esperados > 0);
  assert.equal(n, esperados);
});

test('el popup llega reescrito (ventana=1, %2C, +) y aun así da la misma firma', () => {
  const e = entrada('horario', { tipos: ['tc-r', 'tc-m'], identidad: 'propia', fuente: 'Playfair Display' });
  const llega = urlQueLlega(e, 'popup', 'html');
  // Que la prueba pruebe algo: la URL que llega NO es la copiada.
  assert.notEqual(llega, urlEmbebido(e, 'popup'));
  assert.ok(llega.includes('ventana=1') && llega.includes('tc-r%2Ctc-m') && llega.includes('Playfair+Display'), llega);
  assert.equal(firmaDeUrl(new URL(llega).searchParams), firmaContenidoDe(e, 'popup'));
});

test('la forma NO va en la firma: iframe y popup cargan la misma URL y dan la misma (la distingue `claveVista`)', () => {
  for (const { nombre, e, m } of matriz()) {
    if (m === 'popup' && e.widget.metodos.includes('iframe')) assert.equal(firmaContenidoDe(e, 'popup'), firmaContenidoDe(e, 'iframe'), nombre);
  }
});

test('ni el botón ni el enlace tienen firma de contenido; la nativa sí (Fase E), con el formato del CHECK', () => {
  for (const m of ['boton', 'enlace'] as const) assert.equal(firmaContenidoDe(entrada('horario'), m), null, m);
  const nativa = firmaContenidoDe(entrada('horario'), 'nativa');
  assert.ok(nativa?.startsWith(VERSION_FIRMA), String(nativa));
  assert.match(nativa!, FIRMA_CONTENIDO_VALIDA);
  // No es la del iframe: la nativa no lleva `embed` ni `tab`, y sí `identidad`.
  assert.notEqual(nativa, firmaContenidoDe(entrada('horario'), 'iframe'));
});

// ── Fase E: la nativa, desde su `dataset` ────────────────────────────────────
// El bundle calcula la firma con `firmaDeUrl(fuenteDeDataset(host.dataset))`
// al montarse en la web del estudio. Aquí se hace lo mismo con el `<div>` del
// código que se copia, leído como lo lee el navegador.

/**
 * El `dataset` del `<div data-tentare-booking>` de un código, como lo daría el
 * navegador: los `data-*` del primer `<div`, con las entidades deshechas (el
 * HTML y el JSX las deshacen igual), el nombre en camelCase y un atributo a
 * pelo o `=""` como `''`.
 */
function datasetDe(codigo: string): Record<string, string> {
  const div = /<div\b([^>]*?)\/?>/.exec(codigo);
  assert.ok(div, 'sin <div> en el código');
  const ds: Record<string, string> = {};
  for (const m of div[1].matchAll(/\s(data-[a-z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g)) {
    const valor = (m[2] ?? m[3] ?? '')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const camel = m[1].slice('data-'.length).replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    if (!(camel in ds)) ds[camel] = valor;
  }
  return ds;
}

const CONFIGS_NATIVA: Record<string, Partial<ConfigConstructor>> = {
  'por defecto': {},
  tipos: { tipos: ['tc-r', 'tc-m'] },
  'sin precio': { mostrarPrecio: false },
  'sin nivel': { mostrarNivel: false },
  'vista=hoy': { vista: 'hoy' },
  completo: { diseno: 'completo' },
  'propia con marca y una fuente con espacio': { identidad: 'propia', marca: '#123456', fuente: 'Playfair Display', fuenteDisplay: 'DM Serif Display' },
  'etiqueta propia': { etiqueta: 'insta-bio' },
  'sin etiqueta': { etiqueta: '' },
  'todo el contenido': {
    vista: 'hoy', tipos: ['tc-b', 'tc-a'], instructoras: ['ins-1', 'ins-2'], salas: ['sala-1'],
    mostrarPrecio: false, mostrarNivel: false, mostrarSustituta: false, diseno: 'completo',
  },
  'propia con todo lo que entiende': { identidad: 'propia', marca: '#112233', fondo: '#fafafa', tinta: '#111111', fuente: 'Poppins' },
  // Lo que no llega a la nativa (la semana, el pie, el ancho…) no cambia nada.
  'lo que la nativa no lleva': { presentacion: 'semana', mostrarPie: false, ancho: 'completo', cargaDiferida: false, superficie: '#1a1a1a' },
  'un id con lo que hay que escapar': { tipos: ['a"b<c>&d'] },
};

function* matrizNativa(): Generator<{ nombre: string; e: EntradaIntegracion }> {
  for (const x of WIDGETS.filter(esDisponible)) {
    if (!x.metodos.includes('nativa')) continue;
    for (const [c, parcial] of Object.entries(CONFIGS_NATIVA)) yield { nombre: `${x.id}/${c}`, e: entrada(x, parcial) };
  }
}

test('⚠️ ida y vuelta de la nativa: la firma del panel es la que el bundle calcula de su `dataset` (HTML y React)', () => {
  let n = 0;
  for (const { nombre, e } of matrizNativa()) {
    const panel = firmaContenidoDe(e, 'nativa');
    assert.ok(panel, nombre);
    for (const plataforma of ['html', 'wordpress', 'webflow', 'react'] as const) {
      const { codigo } = generarCodigo(e, 'nativa', plataforma);
      assert.equal(firmaDeUrl(fuenteDeDataset(datasetDe(codigo))), panel, `${nombre}/${plataforma}`);
    }
    n++;
  }
  // Que la matriz no se quede corta en silencio.
  assert.equal(n, WIDGETS.filter(x => esDisponible(x) && x.metodos.includes('nativa')).length * Object.keys(CONFIGS_NATIVA).length);
  assert.ok(n > 0);
});

test('ida y vuelta de la nativa: `data-studio` y `data-tentare-booking` no cuentan (otro estudio, misma versión)', () => {
  const e = entrada('horario', { tipos: ['tc-r'] });
  const ds = datasetDe(generarCodigo(e, 'nativa', 'html').codigo);
  assert.equal(ds.studio, 'pilates-centro');
  assert.equal(ds.tentareBooking, '');
  const sinEllos = { ...ds };
  delete sinEllos.studio;
  delete sinEllos.tentareBooking;
  const firma = firmaDeUrl(fuenteDeDataset(ds));
  assert.equal(firmaDeUrl(fuenteDeDataset(sinEllos)), firma);
  assert.equal(firmaDeUrl(fuenteDeDataset({ ...ds, studio: 'otro-estudio' })), firma);
});

test('⚠️ la nativa retocada a mano es otra versión, como en el iframe', () => {
  const e = entrada('horario', { mostrarPrecio: false });
  const ds = datasetDe(generarCodigo(e, 'nativa', 'html').codigo);
  const firma = firmaDeUrl(fuenteDeDataset(ds));
  assert.equal(firma, firmaContenidoDe(e, 'nativa'));
  // `data-ocultar-precio="1"` significa lo mismo que a pelo, pero no es lo que se copió.
  for (const otro of [{ ...ds, ocultarPrecio: '1' }, { ...ds, diseno: 'ligero' }, { ...ds, ref: 'otra' }, { ...ds, marca: '#E11D48' }]) {
    assert.notEqual(firmaDeUrl(fuenteDeDataset(otro)), firma, JSON.stringify(otro));
  }
  // ⚠️ Límite conocido: `data-color` (el primario de antes del constructor) no
  // está en CLAVES_FIRMA, que esta fase no toca. Un código antiguo escrito a
  // mano se firma sin él, aunque con él el estilo de sus widgets no le llegue.
  assert.equal(firmaDeUrl(fuenteDeDataset({ ...ds, color: '#E11D48' })), firma);
});

test('⚠️ guardián: toda clave que emite la nativa está en CLAVES_FIRMA', () => {
  // Un `data-*` nuevo sin entrar en la firma: el bundle lo pintaría distinto y
  // la firma diría que es la misma versión.
  const claves = new Set<string>(CLAVES_FIRMA);
  const vistas = new Set<string>();
  for (const { nombre, e } of matrizNativa()) {
    for (const [k] of paresNativa(e)) {
      vistas.add(k);
      assert.ok(claves.has(k), `${nombre}: «${k}» no está en CLAVES_FIRMA`);
    }
  }
  for (const k of ['tipos', 'instructoras', 'salas', 'vista', 'ocultar-precio', 'ocultar-nivel', 'ocultar-sustituta', 'diseno',
    'identidad', 'ref', 'marca', 'fondo', 'negro', 'fuente', 'fuente-display']) {
    assert.ok(vistas.has(k), `la matriz nunca emite «${k}»`);
  }
});

// ── Robustez: lo que no es el código no la mueve ─────────────────────────────

test('robustez: utm_*, fbclid, vista previa, borrador, ventana, embed, el orden, %2C y + no cambian la firma', () => {
  const e = entrada('horario', { tipos: ['tc-r', 'tc-m'], identidad: 'propia', marca: '#123456', fuente: 'Playfair Display' });
  const url = urlEmbebido(e);
  const [base, query] = url.split('?');
  assert.ok(query.includes('tc-r,tc-m') && query.includes('Playfair%20Display'), query);
  const firma = firmaDeUrl(new URL(url).searchParams);
  const variantes = [
    `${url}&utm_source=instagram&utm_medium=bio&utm_campaign=otono&fbclid=IwAR0abc`,
    `${url}&vista-previa=1&borrador-web=%7B%7D`,
    `${url}&ventana=1`,
    `${base}?${query.split('&').filter(p => p !== 'embed=1').join('&')}`,
    `${base}?${query.split('&').reverse().join('&')}`,
    url.replace('tc-r,tc-m', 'tc-r%2Ctc-m'),
    url.replace('tc-r,tc-m', 'tc-m,tc-r'),
    url.replace('tc-r,tc-m', 'tc-r,,tc-m,'),
    url.replace('tc-r,tc-m', '%20tc-r%20,tc-m%20'),
    url.replace('Playfair%20Display', 'Playfair+Display'),
    url.replace('marca=%23123456', 'marca=%23123456%20'),
    // Repetida: manda la primera, como en la página.
    `${url}&tipos=otra&ref=otra`,
  ];
  for (const v of variantes) {
    assert.notEqual(v, url);
    assert.equal(firmaDeUrl(new URL(v).searchParams), firma, v);
  }
});

// ── Sensibilidad: lo que la página ve distinto, sí ───────────────────────────

test('sensibilidad: cambiar `tipos`, `ocultar-precio` o `ref` la cambia', () => {
  const base = firmaContenidoDe(entrada('horario'), 'iframe');
  for (const parcial of [{ tipos: ['tc-r'] }, { tipos: ['tc-m'] }, { mostrarPrecio: false }, { etiqueta: 'insta-bio' }, { etiqueta: '' }]) {
    assert.notEqual(firmaContenidoDe(entrada('horario', parcial), 'iframe'), base, JSON.stringify(parcial));
  }
  const url = urlEmbebido(entrada('horario', { tipos: ['tc-r'] }));
  const firma = firmaDeUrl(new URL(url).searchParams);
  for (const v of [url.replace('tipos=tc-r', 'tipos=tc-r,tc-m'), `${url}&ocultar-precio=1`, url.replace('ref=web-horario', 'ref=web-horario-2')]) {
    assert.notEqual(firmaDeUrl(new URL(v).searchParams), firma, v);
  }
});

test('⚠️ lo que significa lo mismo para la página NO se iguala: un valor retocado a mano es otra versión', () => {
  const url = urlEmbebido(entrada('horario'));
  const firma = firmaDeUrl(new URL(url).searchParams);
  for (const v of [`${url}&ocultar-precio=0`, `${url}&vista=todo`, `${url}&tipos=`, `${url}&pie=1`]) {
    assert.notEqual(firmaDeUrl(new URL(v).searchParams), firma, v);
  }
});

test('lo que no llega a la página (ancho, carga diferida, texto y estilo del botón) no la cambia', () => {
  for (const m of EMBEBIDOS) {
    assert.equal(
      firmaContenidoDe(entrada('horario', CONFIGS['lo que no llega a la página']), m),
      firmaContenidoDe(entrada('horario'), m),
      m,
    );
  }
});

// ── Guardianes ───────────────────────────────────────────────────────────────

test('⚠️ guardián: toda clave que emite el generador en iframe y popup está en CLAVES_FIRMA (o es `embed`)', () => {
  // Un parámetro nuevo en el código sin entrar en la firma: la página lo
  // pintaría distinto y la firma diría que es la misma versión.
  const claves = new Set<string>(CLAVES_FIRMA);
  const vistas = new Set<string>();
  for (const { nombre, e, m } of matriz()) {
    for (const k of new URL(urlEmbebido(e, m)).searchParams.keys()) {
      vistas.add(k);
      assert.ok(k === 'embed' || claves.has(k), `${nombre}: «${k}» no está en CLAVES_FIRMA`);
    }
  }
  // Y la matriz toca de verdad los parámetros que importan.
  for (const k of ['tab', 'ref', 'tipos', 'instructoras', 'salas', 'planes', 'ocultar-precio', 'diseno', 'vista',
    'presentacion', 'pie', 'sesion', 'cuenta', 'prueba', 'marca', 'fondo', 'texto', 'fuente', 'fuente-display']) {
    assert.ok(vistas.has(k), `la matriz nunca emite «${k}»`);
  }
});

test('guardián: los parámetros de diseño propio que lee la página están todos en la firma', () => {
  for (const k of PARAMS_DISENO_PROPIO) assert.ok((CLAVES_FIRMA as readonly string[]).includes(k), k);
});

test('guardián: CLAVES_FIRMA está ordenada y sin repetidas, y fuera se quedan las de ejecución', () => {
  assert.deepEqual([...CLAVES_FIRMA], [...CLAVES_FIRMA].sort());
  assert.equal(new Set(CLAVES_FIRMA).size, CLAVES_FIRMA.length);
  for (const k of ['embed', 'ventana', 'vista-previa', 'borrador-web', 'directo', 'compra', 'tentare_pago', 'wsid', 'acceso', 'paso', 'clase']) {
    assert.ok(!(CLAVES_FIRMA as readonly string[]).includes(k), k);
  }
});

// ── Formato ──────────────────────────────────────────────────────────────────

test('formato: toda firma empieza por la versión y cumple FIRMA_CONTENIDO_VALIDA (el CHECK de la BD)', () => {
  for (const { nombre, e, m } of matriz()) {
    const f = firmaContenidoDe(e, m)!;
    assert.ok(f.startsWith(VERSION_FIRMA), nombre);
    assert.match(f, FIRMA_CONTENIDO_VALIDA, nombre);
  }
  // Los extremos del FNV-1a de 32 bits en base 36: de 1 a 7 caracteres.
  for (const f of [`${VERSION_FIRMA}0`, `${VERSION_FIRMA}${(0xffffffff).toString(36)}`, firmaDeUrl(new URLSearchParams())]) {
    assert.match(f, FIRMA_CONTENIDO_VALIDA, f);
  }
});

test('⚠️ literal fijo: la firma del código por defecto no se mueve sin subir VERSION_FIRMA', () => {
  // Si esto falla, lo que ya se ve en las webs saldría como «una versión
  // distinta». O el cambio no tocaba la canonización (y hay que deshacerlo), o
  // la tocaba y hay que subir VERSION_FIRMA y actualizar este literal.
  assert.equal(firmaDeUrl(new URLSearchParams('embed=1&tab=clases&ref=web-horario')), 'c1k65yv5');
  assert.equal(firmaContenidoDe(entrada('horario'), 'iframe'), 'c1k65yv5');
  assert.equal(VERSION_FIRMA, 'c1');
});
