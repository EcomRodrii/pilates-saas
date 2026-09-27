import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, CATEGORIAS, widgetPorId, esDisponible, widgetsVisibles, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, leerConfig, leerConfigs, etiquetaEfectiva, type ConfigConstructor } from './config.ts';
import {
  urlEmbebido, urlPagina, atributosNativa, generarCodigo, faltaParaGenerar, plataformasDe,
  estiloBoton, type EntradaIntegracion,
} from './integracion.ts';
import { resolverConfigWidget, fuenteDeDataset } from '../reservar/config-widget.ts';
import { resolverApariencia } from '../reservar/apariencia-widget.ts';

const ORIGEN = 'https://www.tentare.app';
const SLUG = 'pilates-centro';

function w(id: string): WidgetDisponible {
  const x = widgetPorId(id);
  assert.ok(esDisponible(x), `${id} debería estar disponible`);
  return x;
}
function entrada(id: string, parcial: Partial<ConfigConstructor> = {}): EntradaIntegracion {
  return { widget: w(id), config: { ...CONFIG_POR_DEFECTO, ...parcial }, origen: ORIGEN, slug: SLUG, colorEstudio: '#7A2E4F' };
}
const params = (url: string) => new URL(url).searchParams;

// ── Catálogo ─────────────────────────────────────────────────────────────────

test('catálogo: ids únicos, categoría conocida y los disponibles con al menos un método', () => {
  const ids = new Set<string>();
  const categorias = new Set(CATEGORIAS.map(c => c.id));
  for (const x of WIDGETS) {
    assert.ok(!ids.has(x.id), `id repetido: ${x.id}`);
    ids.add(x.id);
    assert.ok(categorias.has(x.categoria), `${x.id}: categoría desconocida`);
    if (x.estado === 'disponible') assert.ok(x.metodos.length > 0, `${x.id}: sin métodos`);
    else assert.ok(x.falta.length > 0, `${x.id}: en preparación sin decir qué falta`);
  }
});

test('⚠️ «Calendario embebido» ya no es un widget: es la integración nativa del horario', () => {
  assert.equal(widgetPorId('embed-script'), undefined);
  assert.ok(w('horario').metodos.includes('nativa'));
  // Y es el ÚNICO con integración nativa: el bundle solo monta el horario.
  assert.deepEqual(WIDGETS.filter(x => x.estado === 'disponible' && x.metodos.includes('nativa')).map(x => x.id), ['horario']);
});

test('⚠️ la videoteca (módulo congelado) no se enseña en la biblioteca', () => {
  assert.ok(widgetPorId('videoteca'));
  assert.ok(!widgetsVisibles().some(x => x.id === 'videoteca'));
});

// ── Lectura de lo guardado (migración sin pérdidas) ──────────────────────────

test('lo guardado con los ids de antes se hereda en el widget nuevo', () => {
  const c = leerConfigs({
    clases: { tipos: ['tc-r'], ocultarPrecio: true, negro: '#112233', anchoCompleto: true },
    'clase-concreta': { vista: 'hoy' },
    misreservas: { marca: '#abcdef' },
  });
  assert.deepEqual(c.horario.tipos, ['tc-r']);
  assert.equal(c.horario.mostrarPrecio, false);
  assert.equal(c.horario.tinta, '#112233');
  assert.equal(c.horario.ancho, 'completo');
  // Tocó un color: su identidad era propia — no se le apaga en silencio.
  assert.equal(c.horario.identidad, 'propia');
  assert.equal(c.clase.vista, 'hoy');
  assert.equal(c.cuenta.marca, '#abcdef');
});

test('el «Calendario embebido» guardado se abre como horario con integración nativa', () => {
  const c = leerConfigs({ 'embed-script': { diseno: 'completo' } });
  assert.equal(c.horario.metodo, 'nativa');
  assert.equal(c.horario.diseno, 'completo');
});

test('el id nuevo gana al viejo si están los dos', () => {
  const c = leerConfigs({ clases: { vista: 'hoy' }, horario: { vista: 'todo', tipos: ['x'] } });
  assert.equal(c.horario.vista, 'todo');
  assert.deepEqual(c.horario.tipos, ['x']);
});

test('basura en lo guardado cae al default, nunca rompe', () => {
  const c = leerConfig({ marca: 'rojo', fuente: 'x"}', tiposPlan: ['BONO', 'GRATIS'], etiqueta: 'con espacios', forma: 'triángulo' });
  assert.equal(c.marca, null);
  assert.equal(c.fuente, null);
  assert.deepEqual(c.tiposPlan, ['BONO']);
  assert.equal(c.etiqueta, null);
  assert.equal(c.forma, null);
  assert.deepEqual(leerConfig(null), CONFIG_POR_DEFECTO);
});

// ── URL del iframe/popup: lo que el motor lee de verdad ──────────────────────

test('⚠️ sin tocar nada, el horario incrustado solo lleva su pestaña y su etiqueta', () => {
  const url = urlEmbebido(entrada('horario'));
  assert.equal(url, `${ORIGEN}/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario`);
});

test('los ajustes de contenido llegan al parser real del motor (resolverConfigWidget)', () => {
  const url = urlEmbebido(entrada('horario', {
    vista: 'hoy', tipos: ['tc-r', 'tc-m'], instructoras: ['ins-1'], salas: ['sala-1'],
    mostrarPrecio: false, mostrarNivel: false, mostrarSustituta: false, diseno: 'ligero',
  }));
  const c = resolverConfigWidget(params(url));
  assert.equal(c.vistaInicial, 'hoy');
  assert.deepEqual(c.tipos, ['tc-r', 'tc-m']);
  assert.deepEqual(c.instructoras, ['ins-1']);
  assert.deepEqual(c.salas, ['sala-1']);
  assert.equal(c.ocultarPrecio, true);
  assert.equal(c.ocultarNivel, true);
  assert.equal(c.ocultarSustituta, true);
  assert.equal(c.diseno, 'ligero');
});

test('⚠️ con la identidad del estudio no viaja NINGÚN ajuste de diseño aunque haya colores guardados', () => {
  const url = urlEmbebido(entrada('horario', { identidad: 'estudio', marca: '#112233', fondo: 'transparente', forma: 'recto' }));
  for (const k of ['marca', 'fondo', 'forma', 'tinta', 'texto', 'fuente']) assert.equal(params(url).get(k), null, k);
});

test('con identidad propia, el diseño llega al parser de apariencia del motor', () => {
  const url = urlEmbebido(entrada('horario', {
    identidad: 'propia', marca: '#112233', fondo: 'transparente', tinta: '#f0f0f0', superficie: '#1a1a1a',
    linea: '#333333', tema: 'oscuro', forma: 'recto', densidad: 'compacta', fuente: 'Playfair Display',
  }));
  const a = resolverApariencia(null, params(url));
  assert.equal(a.fondo, 'transparente');
  assert.equal(a.tinta, '#f0f0f0');
  assert.equal(a.superficie, '#1a1a1a');
  assert.equal(a.linea, '#333333');
  // «Tema oscuro» = letra clara.
  assert.equal(a.texto, 'claro');
  assert.equal(a.forma, 'recto');
  assert.equal(a.densidad, 'compacta');
  assert.equal(a.fuente, 'Playfair Display');
  assert.equal(resolverConfigWidget(params(url)).colorPrimario, '#112233');
  // El espacio de la fuente se codifica como %20, nunca como %2B.
  assert.ok(url.includes('fuente=Playfair%20Display'));
});

test('ocultar el pie y quitar la etiqueta', () => {
  const url = urlEmbebido(entrada('estudio', { mostrarPie: false, etiqueta: '' }));
  assert.equal(params(url).get('pie'), '0');
  assert.equal(params(url).get('ref'), null);
  assert.equal(resolverApariencia(null, params(url)).ocultarPie, true);
});

test('Mi cuenta abre las dos pestañas y empieza donde se elija', () => {
  assert.equal(params(urlEmbebido(entrada('cuenta'))).get('tab'), 'misreservas');
  assert.equal(params(urlEmbebido(entrada('cuenta'))).get('cuenta'), 'completa');
  assert.equal(params(urlEmbebido(entrada('cuenta', { cuentaInicio: 'bonos' }))).get('tab'), 'cuenta');
});

test('Planes filtra por tipo; Bonos lleva el filtro fijo aunque la config diga otra cosa', () => {
  assert.equal(params(urlEmbebido(entrada('planes'))).get('planes'), null);
  assert.equal(params(urlEmbebido(entrada('planes', { tiposPlan: ['MENSUAL', 'BONO'] }))).get('planes'), 'MENSUAL,BONO');
  assert.equal(params(urlEmbebido(entrada('bonos', { tiposPlan: ['MENSUAL'] }))).get('planes'), 'BONO');
  assert.equal(params(urlEmbebido(entrada('planes'))).get('tab'), 'planes');
});

test('los ajustes del horario no se cuelan en widgets que no los honran', () => {
  const url = urlEmbebido(entrada('citas', { tipos: ['tc-r'], mostrarPrecio: false, vista: 'hoy' }));
  for (const k of ['tipos', 'ocultar-precio', 'vista']) assert.equal(params(url).get(k), null, k);
});

// ── Enlace y botón: la página completa ───────────────────────────────────────

test('el enlace lleva a la página completa, con la clase y la etiqueta, sin filtros', () => {
  assert.equal(urlPagina(entrada('clase', { sesion: 'ses-1', tipos: ['tc-r'] })), `${ORIGEN}/reservar/${SLUG}?sesion=ses-1&ref=web-clase`);
  assert.equal(urlPagina(entrada('horario')), `${ORIGEN}/reservar/${SLUG}?ref=web-horario`);
  assert.equal(urlPagina(entrada('planes', { etiqueta: '' })), `${ORIGEN}/reservar/${SLUG}#bonos-membresias`);
  assert.equal(urlPagina(entrada('equipo')), `${ORIGEN}/reservar/${SLUG}?tab=estudio&ref=web-equipo`);
});

test('etiqueta: la de por defecto, una propia, o ninguna', () => {
  assert.equal(etiquetaEfectiva({ ...CONFIG_POR_DEFECTO }, w('horario')), 'web-horario');
  assert.equal(etiquetaEfectiva({ ...CONFIG_POR_DEFECTO, etiqueta: 'insta-bio' }, w('horario')), 'insta-bio');
  assert.equal(etiquetaEfectiva({ ...CONFIG_POR_DEFECTO, etiqueta: '' }, w('horario')), null);
});

// ── Integración nativa ───────────────────────────────────────────────────────

test('nativa: los data-* los entiende el parser del bundle (fuenteDeDataset)', () => {
  const attrs = atributosNativa(entrada('horario', {
    identidad: 'propia', tipos: ['tc-r'], mostrarPrecio: false, diseno: 'completo', marca: '#112233', tinta: '#eeeeee',
  }));
  const dataset: Record<string, string> = {};
  for (const a of attrs) {
    const m = /^data-([a-z-]+)(?:="([^"]*)")?$/.exec(a);
    assert.ok(m, a);
    dataset[m[1].replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())] = m[2] ?? '';
  }
  const c = resolverConfigWidget(fuenteDeDataset(dataset));
  assert.deepEqual(c.tipos, ['tc-r']);
  assert.equal(c.ocultarPrecio, true);
  assert.equal(c.diseno, 'completo');
  assert.equal(c.colorPrimario, '#112233');
  assert.equal(c.colorNegro, '#eeeeee');
  assert.equal(c.ref, 'web-horario');
  assert.equal(c.identidadEstudio, false);
});

test('nativa con la identidad del estudio: lo dice, y no congela colores', () => {
  const attrs = atributosNativa(entrada('horario', { marca: '#112233' }));
  assert.ok(attrs.includes('data-identidad="estudio"'));
  assert.ok(!attrs.some(a => a.startsWith('data-marca')));
  // El default de la nativa es la rejilla ligera: no se emite.
  assert.ok(!attrs.some(a => a.startsWith('data-diseno')));
});

// ── Código generado ──────────────────────────────────────────────────────────

test('iframe HTML: el src es la URL del motor, con auto-alto y carga diferida', () => {
  const { codigo, lenguaje } = generarCodigo(entrada('horario'), 'iframe', 'html');
  assert.equal(lenguaje, 'html');
  assert.ok(codigo.includes(`src="${ORIGEN}/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario"`));
  assert.ok(codigo.includes('loading="lazy"'));
  assert.ok(codigo.includes('allow="payment"'));
  assert.ok(codigo.includes('max-width:480px'));
  assert.ok(codigo.includes('tentareEmbedAltura'));
  assert.ok(!generarCodigo(entrada('horario', { cargaDiferida: false }), 'iframe').codigo.includes('loading='));
  // Planes, a lo ancho por defecto: se comparan en fila.
  assert.ok(!generarCodigo(entrada('planes'), 'iframe').codigo.includes('max-width'));
});

test('WordPress y Webflow pegan el MISMO código que HTML (lo que cambia son los pasos)', () => {
  const html = generarCodigo(entrada('horario'), 'iframe', 'html').codigo;
  assert.equal(generarCodigo(entrada('horario'), 'iframe', 'wordpress').codigo, html);
  assert.equal(generarCodigo(entrada('horario'), 'iframe', 'webflow').codigo, html);
});

test('React: un componente con el mismo src y el mismo protocolo de mensajes', () => {
  const { codigo, lenguaje } = generarCodigo(entrada('horario'), 'iframe', 'react');
  assert.equal(lenguaje, 'jsx');
  assert.ok(codigo.includes('export function TentareHorarioYReservas()'));
  assert.ok(codigo.includes(`src={'${ORIGEN}/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario'}`) || codigo.includes(`src='${ORIGEN}/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario'`));
  assert.ok(codigo.includes('tentareEmbedAltura'));
  assert.ok(codigo.includes('tentareHostViewport'));
  assert.ok(codigo.includes(`e.origin !== ORIGEN`));
});

test('popup: botón con la URL incrustada y el runtime de Tentare', () => {
  const { codigo } = generarCodigo(entrada('planes', { textoBoton: 'Precios <y> "bonos"' }), 'popup', 'html');
  assert.ok(codigo.includes(`data-tentare-popup="${ORIGEN}/reservar/${SLUG}?embed=1&tab=planes&ref=web-planes"`));
  assert.ok(codigo.includes(`<script src="${ORIGEN}/widget-popup.js" async></script>`));
  assert.ok(codigo.includes('data-tentare-ancho="960"'));
  // El texto del botón se escapa: nunca HTML inyectado en la web del estudio.
  assert.ok(codigo.includes('Precios &lt;y&gt; "bonos"'));
});

test('botón: sin JavaScript, a la página completa, con el color del estudio', () => {
  const { codigo } = generarCodigo(entrada('horario'), 'boton', 'html');
  assert.ok(codigo.startsWith(`<a href="${ORIGEN}/reservar/${SLUG}?ref=web-horario" target="_blank" rel="noopener"`));
  assert.ok(!codigo.includes('<script'));
  assert.ok(codigo.includes('background:#7A2E4F'));
  // Sobre un color oscuro, letra blanca.
  assert.equal(estiloBoton(entrada('horario')).color, '#FFFFFF');
  assert.equal(estiloBoton(entrada('horario', { estiloBoton: 'contorno' })).background, 'transparent');
  assert.ok(!generarCodigo(entrada('horario', { abrirEn: 'misma' }), 'boton').codigo.includes('target='));
});

test('enlace: solo la dirección, y ninguna plataforma que elegir', () => {
  const { codigo, lenguaje } = generarCodigo(entrada('clase', { sesion: 'ses-1' }), 'enlace');
  assert.equal(lenguaje, 'url');
  assert.equal(codigo, `${ORIGEN}/reservar/${SLUG}?sesion=ses-1&ref=web-clase`);
  assert.deepEqual(plataformasDe('enlace'), []);
});

test('no se da un código que no vaya a funcionar', () => {
  const sinDominios = { dominiosAutorizados: [] as string[] };
  assert.match(faltaParaGenerar(entrada('clase'), 'enlace', sinDominios) ?? '', /Elige la clase/);
  assert.equal(faltaParaGenerar(entrada('clase', { sesion: 's' }), 'enlace', sinDominios), null);
  assert.match(faltaParaGenerar(entrada('horario'), 'nativa', sinDominios) ?? '', /dominio/);
  assert.equal(faltaParaGenerar(entrada('horario'), 'nativa', { dominiosAutorizados: ['https://a.com'] }), null);
});

// ── Clase de prueba ──────────────────────────────────────────────────────────

test('clase de prueba: `prueba=1` en el iframe/popup Y en el enlace/botón (la página completa también la honra)', () => {
  assert.equal(params(urlEmbebido(entrada('prueba'))).get('prueba'), '1');
  assert.equal(params(urlEmbebido(entrada('prueba'), 'popup')).get('prueba'), '1');
  assert.equal(urlPagina(entrada('prueba')), `${ORIGEN}/reservar/${SLUG}?prueba=1&ref=web-prueba`);
  assert.ok(generarCodigo(entrada('prueba'), 'boton').codigo.includes('prueba=1'));
});

test('clase de prueba: sin integración nativa (el bundle tendría otro dueño del flujo)', () => {
  assert.ok(!w('prueba').metodos.includes('nativa'));
  assert.equal(w('prueba').metodos[0], 'popup');
});

test('clase de prueba: los filtros del horario se aplican encima de la oferta', () => {
  const url = urlEmbebido(entrada('prueba', { tipos: ['tc-r'] }));
  assert.equal(params(url).get('tipos'), 'tc-r');
  assert.equal(params(url).get('prueba'), '1');
});
