import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BLOQUES_POR_PANTALLA, resolveBloquesPantalla, bloquesVisibles, getBlockCatalogEntry, BLOCK_CATALOG, resolverHrefBloque,
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
  assert.deepEqual(BLOCK_CATALOG.map((b) => b.kind).sort(), ['banner', 'cta', 'faq', 'texto']);
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
