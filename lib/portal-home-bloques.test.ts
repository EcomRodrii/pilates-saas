import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BLOQUES_POR_PANTALLA, resolveBloquesPantalla, bloquesVisibles, getBlockCatalogEntry, BLOCK_CATALOG,
  resolverHrefBloque, resolverVideoEmbed, bloqueEstaCompleto,
  type BloqueHome,
} from './portal-home-bloques.ts';

test('DEFAULT_BLOQUES_POR_PANTALLA.home: los 4 módulos de siempre, en orden, sin ocultar', () => {
  assert.deepEqual(
    DEFAULT_BLOQUES_POR_PANTALLA.home.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)),
    ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio'],
  );
  assert.ok(DEFAULT_BLOQUES_POR_PANTALLA.home.every((b) => !b.oculto));
});

test('DEFAULT_BLOQUES_POR_PANTALLA: Clases y Bonos tienen un único bloque sistema', () => {
  assert.deepEqual(DEFAULT_BLOQUES_POR_PANTALLA.clases.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoClases']);
  assert.deepEqual(DEFAULT_BLOQUES_POR_PANTALLA.bonos.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoBonos']);
});

test('resolveBloquesPantalla: Home sin nada guardado y sin legacy → default de siempre', () => {
  const r = resolveBloquesPantalla(null, 'home', { orden: [], ocultos: [] });
  assert.deepEqual(r.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio']);
  assert.deepEqual(r.draft, r.publicado);
});

test('resolveBloquesPantalla: Home sintetiza desde portalHome legacy (Fase 2) — mismo orden/ocultos, sin migrar datos', () => {
  const r = resolveBloquesPantalla(null, 'home', { orden: ['contenidoEstudio', 'estaSemana'], ocultos: ['invitarAmiga'] });
  const ids = r.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(ids, ['contenidoEstudio', 'estaSemana', 'accesosRapidos', 'invitarAmiga']);
  const invitar = r.publicado.find((b) => b.kind === 'sistema' && b.sistemaId === 'invitarAmiga');
  assert.equal(invitar?.oculto, true);
});

test('resolveBloquesPantalla: Home, una vez hay bloques guardado, YA NO mira portalHome (es la fuente de verdad)', () => {
  const guardado = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Hola', texto: 'x' } }] };
  const r = resolveBloquesPantalla(guardado, 'home', { orden: ['contenidoEstudio'], ocultos: ['estaSemana'] });
  assert.deepEqual(r.publicado, guardado.publicado);
});

test('resolveBloquesPantalla: Home, raw inválido/basura no lanza, cae al default', () => {
  assert.doesNotThrow(() => resolveBloquesPantalla('nope', 'home', { orden: [], ocultos: [] }));
  assert.doesNotThrow(() => resolveBloquesPantalla(42, 'home', { orden: [], ocultos: [] }));
});

test('resolveBloquesPantalla: Clases/Bonos sin nada guardado → su único bloque sistema, sin legado que migrar', () => {
  const rClases = resolveBloquesPantalla(null, 'clases');
  assert.deepEqual(rClases.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoClases']);
  const rBonos = resolveBloquesPantalla(null, 'bonos');
  assert.deepEqual(rBonos.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['listadoBonos']);
});

test('resolveBloquesPantalla: Clases respeta lo guardado (banner añadido antes del calendario)', () => {
  const guardado = {
    draft: [],
    publicado: [
      { id: 'b1', kind: 'banner', config: { imagenUrl: '', titulo: 'Promo', texto: '', href: '' } },
      { id: 'sistema-listadoClases', kind: 'sistema', sistemaId: 'listadoClases' },
    ] satisfies BloqueHome[],
  };
  const r = resolveBloquesPantalla(guardado, 'clases');
  assert.deepEqual(r.publicado.map((b) => b.kind), ['banner', 'sistema']);
});

test('bloquesVisibles: filtra los ocultos', () => {
  const bloques = [
    { id: 'a', kind: 'texto' as const, config: { titulo: '', texto: '' }, oculto: true },
    { id: 'b', kind: 'texto' as const, config: { titulo: '', texto: '' } },
  ];
  assert.deepEqual(bloquesVisibles(bloques).map((b) => b.id), ['b']);
});

test('BLOCK_CATALOG: no incluye bloques sistema (esos no se "añaden")', () => {
  assert.equal(BLOCK_CATALOG.some((b) => (b.kind as string) === 'sistema'), false);
  assert.deepEqual(BLOCK_CATALOG.map((b) => b.kind).sort(), ['banner', 'cta', 'faq', 'galeria', 'testimonios', 'texto', 'video']);
});

test('getBlockCatalogEntry: id desconocido → undefined', () => {
  assert.equal(getBlockCatalogEntry('no-existe'), undefined);
  assert.ok(getBlockCatalogEntry('banner'));
});

test('resolverHrefBloque: ruta interna se acepta tal cual', () => {
  assert.deepEqual(resolverHrefBloque('/reservar'), { interno: true, valor: '/reservar' });
});

test('resolverHrefBloque: externo http(s) se acepta, javascript:/data: se rechaza', () => {
  assert.deepEqual(resolverHrefBloque('https://x.com'), { interno: false, valor: 'https://x.com' });
  assert.equal(resolverHrefBloque('javascript:alert(1)'), null);
  assert.equal(resolverHrefBloque('data:text/html,<script>alert(1)</script>'), null);
});

test('resolverHrefBloque: vacío → null (bloque sin enlace)', () => {
  assert.equal(resolverHrefBloque(''), null);
  assert.equal(resolverHrefBloque('   '), null);
});

test('resolverVideoEmbed: YouTube (watch/youtu.be/embed) se resuelve a la URL de embed', () => {
  assert.equal(resolverVideoEmbed('https://www.youtube.com/watch?v=abc123'), 'https://www.youtube.com/embed/abc123');
  assert.equal(resolverVideoEmbed('https://youtube.com/watch?v=abc123&t=10s'), 'https://www.youtube.com/embed/abc123');
  assert.equal(resolverVideoEmbed('https://youtu.be/abc123'), 'https://www.youtube.com/embed/abc123');
  assert.equal(resolverVideoEmbed('https://www.youtube.com/embed/abc123'), 'https://www.youtube.com/embed/abc123');
});

test('resolverVideoEmbed: Vimeo se resuelve a player.vimeo.com', () => {
  assert.equal(resolverVideoEmbed('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.equal(resolverVideoEmbed('https://player.vimeo.com/video/123456789'), 'https://player.vimeo.com/video/123456789');
});

test('resolverVideoEmbed: dominio no permitido, URL rota o vacía → null', () => {
  assert.equal(resolverVideoEmbed('https://malicioso.com/video.mp4'), null);
  assert.equal(resolverVideoEmbed('javascript:alert(1)'), null);
  assert.equal(resolverVideoEmbed('no-es-una-url'), null);
  assert.equal(resolverVideoEmbed(''), null);
  assert.equal(resolverVideoEmbed('https://youtube.com/watch?v='), null);
  assert.equal(resolverVideoEmbed('https://vimeo.com/no-numerico'), null);
});

test('bloqueEstaCompleto: banner nunca está incompleto', () => {
  assert.equal(bloqueEstaCompleto({ id: 'b', kind: 'banner', config: { imagenUrl: '', titulo: '', texto: '', href: '' } }), true);
});

test('bloqueEstaCompleto: texto necesita título o cuerpo', () => {
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: '', texto: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: 'Hola', texto: '' } }), true);
  assert.equal(bloqueEstaCompleto({ id: 't', kind: 'texto', config: { titulo: '', texto: 'x' } }), true);
});

test('bloqueEstaCompleto: cta necesita enlace resoluble y texto de botón', () => {
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: '', href: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: '', href: '/reservar' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: '/reservar' } }), true);
  assert.equal(bloqueEstaCompleto({ id: 'c', kind: 'cta', config: { titulo: '', textoBoton: 'Ir', href: 'javascript:alert(1)' } }), false);
});

test('bloqueEstaCompleto: faq/galería/testimonios necesitan al menos un elemento', () => {
  assert.equal(bloqueEstaCompleto({ id: 'f', kind: 'faq', config: { titulo: '', preguntas: [] } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'f', kind: 'faq', config: { titulo: '', preguntas: [{ pregunta: '¿?', respuesta: '.' }] } }), true);
  assert.equal(bloqueEstaCompleto({ id: 'g', kind: 'galeria', config: { imagenes: [] } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'g', kind: 'galeria', config: { imagenes: [{ url: 'https://x.com/i.png', alt: '' }] } }), true);
  assert.equal(bloqueEstaCompleto({ id: 'te', kind: 'testimonios', config: { titulo: '', testimonios: [] } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'te', kind: 'testimonios', config: { titulo: '', testimonios: [{ cita: 'x', autor: 'Ana', rol: '' }] } }), true);
});

test('bloqueEstaCompleto: vídeo necesita una URL que resuelva a embed', () => {
  assert.equal(bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url: '' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url: 'https://malicioso.com/x.mp4' } }), false);
  assert.equal(bloqueEstaCompleto({ id: 'v', kind: 'video', config: { titulo: '', url: 'https://youtu.be/abc123' } }), true);
});
