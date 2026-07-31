import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_BLOQUES, resolveHomeBloques, bloquesVisibles, getBlockCatalogEntry, BLOCK_CATALOG, resolverHrefBloque,
} from './portal-home-bloques.ts';

test('DEFAULT_HOME_BLOQUES: los 4 módulos de siempre, en orden, sin ocultar', () => {
  assert.deepEqual(
    DEFAULT_HOME_BLOQUES.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)),
    ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio'],
  );
  assert.ok(DEFAULT_HOME_BLOQUES.every((b) => !b.oculto));
});

test('resolveHomeBloques: sin nada guardado y sin legacy → default de siempre', () => {
  const r = resolveHomeBloques(null, { orden: [], ocultos: [] });
  assert.deepEqual(r.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind)), ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio']);
  assert.deepEqual(r.draft, r.publicado);
});

test('resolveHomeBloques: sintetiza desde portalHome legacy (Fase 2) — mismo orden/ocultos, sin migrar datos', () => {
  const r = resolveHomeBloques(null, { orden: ['contenidoEstudio', 'estaSemana'], ocultos: ['invitarAmiga'] });
  const ids = r.publicado.map((b) => (b.kind === 'sistema' ? b.sistemaId : b.kind));
  assert.deepEqual(ids, ['contenidoEstudio', 'estaSemana', 'accesosRapidos', 'invitarAmiga']);
  const invitar = r.publicado.find((b) => b.kind === 'sistema' && b.sistemaId === 'invitarAmiga');
  assert.equal(invitar?.oculto, true);
});

test('resolveHomeBloques: una vez hay homeBloques guardado, YA NO mira portalHome (es la fuente de verdad)', () => {
  const guardado = { draft: [], publicado: [{ id: 'b1', kind: 'texto', config: { titulo: 'Hola', texto: 'x' } }] };
  const r = resolveHomeBloques(guardado, { orden: ['contenidoEstudio'], ocultos: ['estaSemana'] });
  assert.deepEqual(r.publicado, guardado.publicado);
});

test('resolveHomeBloques: raw inválido/basura no lanza, cae al default', () => {
  assert.doesNotThrow(() => resolveHomeBloques('nope', { orden: [], ocultos: [] }));
  assert.doesNotThrow(() => resolveHomeBloques(42, { orden: [], ocultos: [] }));
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
