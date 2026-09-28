import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, CATEGORIAS, widgetPorId, esDisponible, widgetsVisibles, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, leerConfig, leerConfigs, etiquetaEfectiva, anchoPorDefecto, anchoPopupDe, type ConfigConstructor } from './config.ts';
import {
  urlEmbebido, urlPagina, atributosNativa, generarCodigo, faltaParaGenerar, plataformasDe,
  estiloBoton, firmaCodigo, conVistaPrevia, botonSigueElEstilo, colorBoton, idIframe, type EntradaIntegracion,
} from './integracion.ts';
import { usaBotonVivo, type BotonVivo } from './boton-vivo.ts';
import { PARAM_BORRADOR, WIDGET_WEB_NEUTRO, leerWidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { baseEstiloWeb, botonDeLaVentana, leerBorradorWeb } from '../reservar/estilo-web.ts';
import { scriptSnippetIframe } from '../reservar/snippet-embed.ts';
import { resolverConfigWidget, fuenteDeDataset, leerPresentacion } from '../reservar/config-widget.ts';
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

// ── Formulario de contacto ───────────────────────────────────────────────────

test('formulario de contacto: `tab=contacto` en el iframe/popup y en el enlace/botón, sin integración nativa', () => {
  const x = w('contacto');
  assert.ok(!x.metodos.includes('nativa'));
  assert.deepEqual(x.contenido, [], 'no pinta ajustes del horario que el formulario ignoraría');
  const url = params(urlEmbebido(entrada('contacto')));
  assert.equal(url.get('embed'), '1');
  assert.equal(url.get('tab'), 'contacto');
  assert.equal(url.get('ref'), 'web-contacto');
  assert.equal(urlPagina(entrada('contacto')), `${ORIGEN}/reservar/${SLUG}?tab=contacto&ref=web-contacto`);
  assert.ok(generarCodigo(entrada('contacto'), 'boton').codigo.includes('tab=contacto'));
});

// ── Calendario semanal (`presentacion`) ──────────────────────────────────────

test('calendario semanal: lo guardado se lee, y la basura cae a la lista de siempre', () => {
  assert.equal(CONFIG_POR_DEFECTO.presentacion, 'lista');
  assert.equal(leerConfig({ presentacion: 'semana' }).presentacion, 'semana');
  assert.equal(leerConfig({ presentacion: 'mes' }).presentacion, 'lista');
  assert.equal(leerConfig({}).presentacion, 'lista');
});

test('⚠️ calendario semanal: la lista (el default) no se emite — ningún snippet cambia sin tocarlo', () => {
  for (const metodo of ['iframe', 'popup'] as const) {
    assert.equal(params(urlEmbebido(entrada('horario'), metodo)).get('presentacion'), null, metodo);
  }
  assert.equal(urlPagina(entrada('horario')), `${ORIGEN}/reservar/${SLUG}?ref=web-horario`);
  assert.ok(!generarCodigo(entrada('horario'), 'iframe').codigo.includes('presentacion'));
});

test('calendario semanal: iframe y popup lo llevan, y el parser real del motor lo entiende', () => {
  for (const metodo of ['iframe', 'popup'] as const) {
    const url = urlEmbebido(entrada('horario', { presentacion: 'semana', tipos: ['tc-r'] }), metodo);
    const c = resolverConfigWidget(params(url));
    assert.equal(c.presentacion, 'semana', metodo);
    // Los filtros siguen aplicándose: el calendario pinta las mismas clases que la lista.
    assert.deepEqual(c.tipos, ['tc-r'], metodo);
  }
});

test('calendario semanal: con él no viajan la vista inicial ni el diseño de la lista (no pintarían nada)', () => {
  const url = urlEmbebido(entrada('horario', { presentacion: 'semana', vista: 'hoy', diseno: 'ligero', mostrarPrecio: false }));
  assert.equal(params(url).get('vista'), null);
  assert.equal(params(url).get('diseno'), null);
  // Lo que sí se ve en la ficha de la clase se sigue respetando.
  assert.equal(params(url).get('ocultar-precio'), '1');
  // Y al volver a la lista, lo que había elegido sigue ahí.
  const lista = urlEmbebido(entrada('horario', { presentacion: 'lista', vista: 'hoy', diseno: 'ligero' }));
  assert.equal(params(lista).get('vista'), 'hoy');
  assert.equal(params(lista).get('diseno'), 'ligero');
});

test('calendario semanal: el enlace y el botón lo llevan a la página completa (la página lo honra fuera del iframe)', () => {
  const e = entrada('horario', { presentacion: 'semana', tipos: ['tc-r'] });
  assert.equal(urlPagina(e), `${ORIGEN}/reservar/${SLUG}?presentacion=semana&ref=web-horario`);
  assert.equal(leerPresentacion(params(urlPagina(e))), 'semana');
  assert.ok(generarCodigo(e, 'boton').codigo.includes('presentacion=semana'));
  assert.equal(generarCodigo(e, 'enlace').codigo, `${ORIGEN}/reservar/${SLUG}?presentacion=semana&ref=web-horario`);
  // La clase de prueba también es un horario: lo lleva detrás de su `prueba=1`.
  assert.equal(urlPagina(entrada('prueba', { presentacion: 'semana' })), `${ORIGEN}/reservar/${SLUG}?prueba=1&presentacion=semana&ref=web-prueba`);
});

test('⚠️ calendario semanal: la integración nativa lo ignora y sigue con su lista (el bundle no cambia)', () => {
  const attrs = atributosNativa(entrada('horario', { presentacion: 'semana', diseno: 'completo', vista: 'hoy' }));
  assert.ok(!attrs.some(a => a.startsWith('data-presentacion')));
  assert.ok(attrs.includes('data-diseno="completo"'));
  assert.ok(attrs.includes('data-vista="hoy"'));
});

test('calendario semanal: no se cuela en widgets que no son un horario', () => {
  for (const id of ['citas', 'planes', 'contacto', 'clase']) {
    const e = entrada(id, { presentacion: 'semana', sesion: 'ses-1' });
    assert.equal(params(urlEmbebido(e)).get('presentacion'), null, id);
    assert.equal(params(urlPagina(e)).get('presentacion'), null, id);
  }
});

test('calendario semanal: a todo el ancho por defecto (siete columnas no caben en 480 px), salvo que se elija otro', () => {
  assert.equal(anchoPorDefecto(w('horario')), 'compacto');
  assert.equal(anchoPorDefecto(w('horario'), { presentacion: 'semana' }), 'completo');
  assert.ok(!generarCodigo(entrada('horario', { presentacion: 'semana' }), 'iframe').codigo.includes('max-width'));
  assert.ok(generarCodigo(entrada('horario', { presentacion: 'semana', ancho: 'compacto' }), 'iframe').codigo.includes('max-width:480px'));
  // La lista sigue como siempre.
  assert.ok(generarCodigo(entrada('horario'), 'iframe').codigo.includes('max-width:480px'));
});

test('calendario semanal: el popup se abre a 960 para que la rejilla no se deslice; la lista sigue en 720', () => {
  // La rejilla mide 670 px de mínimo: en 720, menos el margen y la barra de scroll, no cabía.
  for (const plataforma of ['html', 'react'] as const) {
    const semana = generarCodigo(entrada('horario', { presentacion: 'semana' }), 'popup', plataforma).codigo;
    assert.ok(semana.includes('data-tentare-ancho="960"'), plataforma);
    const lista = generarCodigo(entrada('horario'), 'popup', plataforma).codigo;
    assert.ok(lista.includes('data-tentare-ancho="720"'), plataforma);
  }
  assert.equal(anchoPopupDe(w('horario'), { presentacion: 'lista' }), 720);
  assert.equal(anchoPopupDe(w('prueba'), { presentacion: 'semana' }), 960);
  // En un widget que no es un horario, `presentacion` no mueve su ancho.
  assert.equal(anchoPopupDe(w('citas'), { presentacion: 'semana' }), w('citas').anchoPopup);
});

// ── Huella de lo copiado ─────────────────────────────────────────────────────

test('firma: estable, corta y la misma copiada desde cualquier dirección de Tentare', () => {
  const f = firmaCodigo(entrada('horario'), 'iframe');
  assert.match(f, /^[0-9a-z]{1,32}$/);
  assert.equal(firmaCodigo(entrada('horario'), 'iframe'), f);
  assert.equal(firmaCodigo({ ...entrada('horario'), origen: 'http://localhost:3000' }, 'iframe'), f);
});

test('firma: cambia con lo que va en el código', () => {
  const base = firmaCodigo(entrada('horario'), 'iframe');
  assert.notEqual(firmaCodigo(entrada('horario', { tipos: ['tc-r'] }), 'iframe'), base);
  assert.notEqual(firmaCodigo(entrada('horario', { mostrarPrecio: false }), 'iframe'), base);
  assert.notEqual(firmaCodigo(entrada('horario'), 'popup'), base);
  assert.notEqual(firmaCodigo(entrada('horario', { etiqueta: 'insta-bio' }), 'iframe'), base);
  // El «Ancho» solo toca el `style` del iframe: también cuenta.
  assert.notEqual(firmaCodigo(entrada('horario', { ancho: 'completo' }), 'iframe'), base);
  const popup = firmaCodigo(entrada('horario'), 'popup');
  assert.notEqual(firmaCodigo(entrada('horario', { textoBoton: 'Ven a probar' }), 'popup'), popup);
  assert.notEqual(firmaCodigo(entrada('horario', { estiloBoton: 'contorno' }), 'popup'), popup);
});

test('⚠️ firma: el color de marca del estudio (Apariencia) no cuenta como «has cambiado algo»', () => {
  const popup = firmaCodigo(entrada('horario'), 'popup');
  assert.equal(firmaCodigo({ ...entrada('horario'), colorEstudio: '#123456' }, 'popup'), popup);
  // Ni un ajuste de botón que el iframe no lleva.
  assert.equal(firmaCodigo(entrada('horario', { estiloBoton: 'contorno' }), 'iframe'), firmaCodigo(entrada('horario'), 'iframe'));
  // Su propio color, en cambio, sí.
  assert.notEqual(firmaCodigo(entrada('horario', { identidad: 'propia', marca: '#123456' }), 'boton'), firmaCodigo(entrada('horario'), 'boton'));
});

test('lo que falta para el código ya no manda a otra pestaña', () => {
  const sinDominios = { dominiosAutorizados: [] as string[] };
  for (const m of [faltaParaGenerar(entrada('clase'), 'enlace', sinDominios), faltaParaGenerar(entrada('horario'), 'nativa', sinDominios)]) {
    assert.ok(m);
    assert.doesNotMatch(m, /«Contenido»|«Avanzado»/);
  }
});

// ── El estilo de su web no entra en el código que se copia (Fase B) ─────────

test('⚠️ nada de lo que se copia lleva el borrador, la marca de ventana ni la de vista previa', () => {
  // El estilo de su web llega solo, sin volver a pegar: si algo de esto se
  // colara en el código, un widget pegado se quedaría con el borrador de un
  // día (o contando como vista previa) para siempre.
  const configs: Partial<ConfigConstructor>[] = [
    {}, { identidad: 'propia', marca: '#123456', forma: 'recto', fuente: 'Poppins' }, { mostrarPie: false, presentacion: 'semana' },
  ];
  for (const x of WIDGETS.filter(esDisponible)) for (const parcial of configs) for (const metodo of x.metodos) {
    const e = entrada(x.id, { sesion: 'ses-1', ...parcial });
    for (const plataforma of ['html', 'wordpress', 'webflow', 'react'] as const) {
      const { codigo } = generarCodigo(e, metodo, plataforma);
      for (const nunca of [PARAM_BORRADOR, 'ventana=', 'vista-previa']) assert.ok(!codigo.includes(nunca), `${x.id}/${metodo}/${plataforma}: ${nunca}`);
    }
    for (const url of [urlEmbebido(e, 'iframe'), urlEmbebido(e, 'popup'), urlPagina(e), atributosNativa(e).join(' ')]) {
      for (const nunca of [PARAM_BORRADOR, 'ventana=', 'vista-previa']) assert.ok(!url.includes(nunca), `${x.id}: ${nunca}`);
    }
  }
});

test('conVistaPrevia: el borrador va detrás de `vista-previa=1`, y la página lo lee tal cual', () => {
  const url = urlEmbebido(entrada('horario'));
  assert.equal(conVistaPrevia(url), `${url}&vista-previa=1`);
  const arena = { ...WIDGET_WEB_NEUTRO, estilo: 'arena' as const, web: 'otro' as const, colorWeb: '#E8E1D3', fundido: true };
  const conBorrador = conVistaPrevia(url, { borradorWeb: arena });
  assert.ok(conBorrador.startsWith(`${url}&vista-previa=1&${PARAM_BORRADOR}=`), conBorrador);
  assert.deepEqual(leerBorradorWeb(new URL(conBorrador).searchParams), arena);
  // «Nada elegido» también viaja: en la previa, sustituye a lo publicado.
  assert.deepEqual(leerBorradorWeb(new URL(conVistaPrevia(url, { borradorWeb: { ...WIDGET_WEB_NEUTRO } })).searchParams), WIDGET_WEB_NEUTRO);
  // El ancla se queda al final.
  const conAncla = conVistaPrevia(`${ORIGEN}/reservar/${SLUG}?tab=clases#horario`, { borradorWeb: arena });
  assert.match(conAncla, /&borrador-web=[^#]+#horario$/);
  assert.deepEqual(leerWidgetWeb(JSON.parse(new URL(conAncla).searchParams.get(PARAM_BORRADOR)!)), arena);
});

// ── El botón que abre la ventana sigue el estilo (Fase D) ───────────────────

const VIVO: BotonVivo = { fondo: '#1B2418', texto: '#F2F6EE', esquinas: 'recto' };
const conVivo = (e: EntradaIntegracion, botonVivo: BotonVivo | null = VIVO): EntradaIntegracion => ({ ...e, botonVivo });
/** El `style="…"` del botón en el código HTML. */
const styleDe = (codigo: string) => /style="([^"]*)"/.exec(codigo)?.[1] ?? '';
/** Las declaraciones de color y esquinas del `style` (las fijas de siempre, fuera). */
const decl = (style: string) => style.split(';').filter(d => /^(background|color|border|border-radius):/.test(d));

test('⚠️ popup por defecto (tema #343825, nada elegido): la cadena EXACTA, cada propiedad con su literal y después su var()', () => {
  const botonVivo = botonDeLaVentana(null, baseEstiloWeb('#343825', null));
  const e: EntradaIntegracion = { ...entrada('horario'), colorEstudio: '#343825', botonVivo };
  const esperado = 'display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 22px;font:inherit;font-weight:600;font-size:15px;line-height:1.2;text-decoration:none;cursor:pointer;background:#343825;background:var(--tentare-boton,#343825);color:#FFFFFF;color:var(--tentare-boton-texto,#FFFFFF);border:1.5px solid #343825;border:1.5px solid var(--tentare-boton,#343825);border-radius:999px;border-radius:var(--tentare-boton-radio,999px);';
  const codigo = generarCodigo(e, 'popup', 'html').codigo;
  assert.equal(styleDe(codigo), esperado);
  for (const par of [
    'background:#343825;background:var(--tentare-boton,#343825);',
    'color:#FFFFFF;color:var(--tentare-boton-texto,#FFFFFF);',
    'border:1.5px solid #343825;border:1.5px solid var(--tentare-boton,#343825);',
    'border-radius:999px;border-radius:var(--tentare-boton-radio,999px);',
  ]) assert.ok(codigo.includes(par), par);
  // Y el script de la página lo reconoce como un botón que sigue el estilo.
  assert.equal(usaBotonVivo(styleDe(codigo)), true);
});

test('⚠️ guardián de la doble declaración: todo `var(--tentare-…,X)` va justo detrás de la misma propiedad con X', () => {
  let conVariable = 0;
  const vivos: (BotonVivo | null)[] = [null, VIVO, { fondo: '#abc', texto: '#000', esquinas: 'pill' }, { ...VIVO, esquinas: 'redondeado' }];
  const configs: Partial<ConfigConstructor>[] = [
    {}, { estiloBoton: 'contorno' }, { forma: 'recto' }, { estiloBoton: 'contorno', identidad: 'propia' },
    { identidad: 'propia', marca: '#112233' }, { identidad: 'propia', marca: '#112233', estiloBoton: 'contorno' },
  ];
  for (const x of WIDGETS.filter(esDisponible)) for (const parcial of configs) for (const v of vivos) {
    if (!x.metodos.includes('popup')) continue;
    const e = conVivo(entrada(x.id, { sesion: 'ses-1', ...parcial }), v);
    const caso = `${x.id}/${JSON.stringify(parcial)}/${JSON.stringify(v)}`;
    const ds = styleDe(generarCodigo(e, 'popup', 'html').codigo).split(';');
    for (const [i, d] of ds.entries()) {
      if (!d.includes('var(')) continue;
      conVariable++;
      assert.match(d, /var\(--tentare-boton(-texto|-radio)?,(#[0-9a-fA-F]{3,6}|\d+px)\)/, caso);
      // El literal inmediatamente anterior: la misma declaración con el respaldo en lugar del var().
      assert.equal(ds[i - 1], d.replace(/var\(--tentare-[a-z-]+,([^)]+)\)/g, '$1'), `${caso}: ${d}`);
    }
    // Solo la sigue quien no lleva diseño propio en el código.
    assert.equal(ds.some(d => d.includes('var(')), botonSigueElEstilo(e.config, 'popup'), caso);
  }
  assert.ok(conVariable > 0);
});

test('popup en contorno: el fondo transparente una sola vez y sin variable; el color y el borde, dobles', () => {
  const style = styleDe(generarCodigo(conVivo(entrada('horario', { estiloBoton: 'contorno' })), 'popup').codigo);
  assert.equal(style.match(/background:/g)?.length, 1);
  assert.ok(style.includes('background:transparent;color:#1B2418;color:var(--tentare-boton,#1B2418);'));
  assert.ok(style.includes('border:1.5px solid #1B2418;border:1.5px solid var(--tentare-boton,#1B2418);'));
  assert.ok(style.includes('border-radius:6px;border-radius:var(--tentare-boton-radio,6px);'));
  assert.ok(!/background:[^;]*var\(/.test(style));
});

test('⚠️ popup con diseño propio: literal, sin var() y sin ninguna propiedad repetida (lo de siempre)', () => {
  for (const estiloBoton of ['relleno', 'contorno'] as const) {
    const e = conVivo(entrada('horario', { identidad: 'propia', marca: '#112233', estiloBoton }));
    assert.equal(botonSigueElEstilo(e.config, 'popup'), false);
    const style = styleDe(generarCodigo(e, 'popup').codigo);
    assert.ok(!style.includes('var('), style);
    const props = decl(style).map(d => d.slice(0, d.indexOf(':')));
    assert.deepEqual(props, ['background', 'color', 'border', 'border-radius'], estiloBoton);
    // Su color, no el del estilo de su web.
    assert.ok(style.includes('#112233'));
    assert.ok(!style.includes(VIVO.fondo));
  }
});

test('el botón a la página (`<a>`) no lleva variables: no carga ningún script que las rellene', () => {
  for (const plataforma of ['html', 'react'] as const) {
    const codigo = generarCodigo(conVivo(entrada('horario')), 'boton', plataforma).codigo;
    assert.ok(!codigo.includes('var('), plataforma);
    assert.ok(codigo.includes('#7A2E4F'), plataforma);
  }
  assert.equal(botonSigueElEstilo(CONFIG_POR_DEFECTO, 'boton'), false);
  assert.deepEqual(estiloBoton(conVivo(entrada('horario'))), estiloBoton(entrada('horario')));
});

test('React: solo el var() con su respaldo, y ninguna clave repetida (un objeto no puede repetirlas)', () => {
  const codigo = generarCodigo(conVivo(entrada('horario')), 'popup', 'react').codigo;
  const estilo = /style=\{(\{[^}]*\})\}/.exec(codigo)?.[1] ?? '';
  assert.ok(estilo.includes("background: 'var(--tentare-boton,#1B2418)'"), estilo);
  assert.ok(estilo.includes("color: 'var(--tentare-boton-texto,#F2F6EE)'"), estilo);
  assert.ok(estilo.includes("border: '1.5px solid var(--tentare-boton,#1B2418)'"), estilo);
  assert.ok(estilo.includes("borderRadius: 'var(--tentare-boton-radio,6px)'"), estilo);
  const claves = [...estilo.matchAll(/(\w+):/g)].map(m => m[1]);
  assert.equal(new Set(claves).size, claves.length, estilo);
  // Con diseño propio, literal como siempre.
  const propio = generarCodigo(conVivo(entrada('horario', { identidad: 'propia', marca: '#112233' })), 'popup', 'react').codigo;
  assert.ok(propio.includes("background: '#112233'") && !propio.includes('var('));
});

test('sin `botonVivo` (o con uno que no valida), el respaldo es el de siempre: el color del estudio', () => {
  for (const v of [null, undefined, { fondo: 'red', texto: '#FFFFFF', esquinas: 'pill' } as unknown as BotonVivo]) {
    const e: EntradaIntegracion = { ...entrada('horario'), botonVivo: v };
    const style = styleDe(generarCodigo(e, 'popup').codigo);
    assert.ok(style.includes(`background:${colorBoton(e)};background:var(--tentare-boton,${colorBoton(e)});`), style);
    assert.ok(style.includes('border-radius:999px;border-radius:var(--tentare-boton-radio,999px);'), style);
    assert.deepEqual(estiloBoton(e, 'popup'), estiloBoton(entrada('horario')));
  }
  // Con él, el literal (la vista previa del panel) es el botón de la ventana de hoy.
  assert.deepEqual(estiloBoton(conVivo(entrada('horario')), 'popup'), {
    background: '#1B2418', color: '#F2F6EE', border: '1.5px solid #1B2418', borderRadius: '6px',
  });
});

test('⚠️ firma: el botón vivo no cambia la huella de un popup (las copias de antes no saltan a ámbar)', () => {
  for (const parcial of [{}, { estiloBoton: 'contorno' as const }, { textoBoton: 'Ven' }]) {
    const e = entrada('horario', parcial);
    const f = firmaCodigo(e, 'popup');
    assert.equal(firmaCodigo(conVivo(e), 'popup'), f);
    assert.equal(firmaCodigo(conVivo(e, { fondo: '#FFFFFF', texto: '#000000', esquinas: 'pill' }), 'popup'), f);
    assert.equal(firmaCodigo(conVivo(e, null), 'popup'), f);
  }
});

test('⚠️ el código iframe por defecto no cambia ni un carácter (y ningún código fuera del popup nota `botonVivo`)', () => {
  const e = entrada('horario');
  const esperado = `<iframe id="${idIframe(e)}" src="${ORIGEN}/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario" style="width:100%;max-width:480px;height:${w('horario').alto}px;border:0;border-radius:12px;" title="Horario y reservas" loading="lazy" allow="payment"></iframe>
${scriptSnippetIframe({ origen: ORIGEN, slug: SLUG, iframeId: idIframe(e) })}`;
  assert.equal(generarCodigo(e, 'iframe', 'html').codigo, esperado);
  assert.equal(generarCodigo(conVivo(e), 'iframe', 'html').codigo, esperado);
  for (const x of WIDGETS.filter(esDisponible)) for (const metodo of x.metodos) {
    if (metodo === 'popup') continue;
    for (const plataforma of ['html', 'react'] as const) {
      const sin = entrada(x.id, { sesion: 'ses-1' });
      assert.equal(generarCodigo(conVivo(sin), metodo, plataforma).codigo, generarCodigo(sin, metodo, plataforma).codigo, `${x.id}/${metodo}/${plataforma}`);
    }
  }
});
