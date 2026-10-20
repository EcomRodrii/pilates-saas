import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGINAS } from '../../seo/paginas.ts';
import { ARTICULOS } from './index.ts';
import { ARTICULOS_META } from './meta.ts';
import { urlArticulo, type ArticuloMeta } from './util.ts';
import { NUM_RELACIONADOS, elegirRelacionados, relacionadasDeProducto } from './relacionados.ts';
import { RECURSOS_INTERMEDIOS, RECURSO_POR_ARTICULO, recursoIntermedio, seccionDeLaLlamada } from './recursos-intermedios.ts';

// La plantilla del artículo de /recursos (ronda 2B, 19-oct-2026): «Sigue
// leyendo» con tres artículos, fecha de actualización real y una llamada a mitad
// de texto solo donde hay un recurso. Lo que NO puede volver (#2458): colores por
// categoría, cajas de colores, letra de máquina de escribir, degradados.

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const leer = (f: string) => readFileSync(join(RAIZ, f), 'utf8');
const RUTAS = new Set(PAGINAS.map((p) => p.path));

test('cada artículo tiene exactamente tres relacionados, distintos de sí mismo y entre sí', () => {
  for (const a of ARTICULOS) {
    const rel = elegirRelacionados(a.slug, ARTICULOS_META);
    assert.equal(rel.length, NUM_RELACIONADOS, a.slug);
    const slugs = rel.map((m) => m.slug);
    assert.ok(!slugs.includes(a.slug), `${a.slug} se recomienda a sí mismo`);
    assert.equal(new Set(slugs).size, slugs.length, `${a.slug}: relacionados repetidos`);
  }
});

test('los relacionados son deterministas: la misma entrada da lo mismo, venga en el orden que venga', () => {
  for (const a of ARTICULOS) {
    const base = elegirRelacionados(a.slug, ARTICULOS_META).map((m) => m.slug);
    assert.deepEqual(elegirRelacionados(a.slug, ARTICULOS_META).map((m) => m.slug), base, `${a.slug}: dos llamadas`);
    const alReves = [...ARTICULOS_META].reverse();
    assert.deepEqual(elegirRelacionados(a.slug, alReves).map((m) => m.slug), base, `${a.slug}: otro orden de entrada`);
  }
});

test('primero van los que el artículo declara en `relacionadas`; el resto sale de su categoría', () => {
  for (const a of ARTICULOS) {
    const rel = elegirRelacionados(a.slug, ARTICULOS_META);
    const declarados = a.relacionadas
      .map((r) => ARTICULOS_META.find((m) => urlArticulo(m.slug) === r))
      .filter((m): m is ArticuloMeta => Boolean(m))
      .slice(0, NUM_RELACIONADOS);
    assert.deepEqual(rel.slice(0, declarados.length).map((m) => m.slug), declarados.map((m) => m.slug), `${a.slug}: no respeta sus relacionadas`);
    // Lo que se añade por hueco, de su misma categoría mientras la categoría dé de sí.
    const huecos = rel.slice(declarados.length);
    const mismaCategoria = ARTICULOS_META.filter((m) => m.slug !== a.slug && m.categoria === a.categoria && !declarados.includes(m));
    if (mismaCategoria.length >= huecos.length) {
      for (const h of huecos) assert.equal(h.categoria, a.categoria, `${a.slug}: ${h.slug} no es de su categoría`);
    }
  }
});

test('si a un artículo no le quedan relacionadas, el más reciente de su categoría rellena el hueco', () => {
  const metas: ArticuloMeta[] = (['a', 'b', 'c', 'd', 'e'] as const).map((s, i) => ({
    slug: s, titulo: s, tituloSeo: s, descripcion: s, resumen: s, seccion: 'x',
    categoria: s === 'e' ? 'software' : 'abrir', publicado: `2026-09-0${i + 1}`, relacionadas: [], palabras: 1100,
  }));
  assert.deepEqual(elegirRelacionados('a', metas).map((m) => m.slug), ['d', 'c', 'b']);
  // Con una categoría de dos, completa con el más reciente de las demás.
  assert.deepEqual(elegirRelacionados('e', metas).map((m) => m.slug), ['d', 'c', 'b']);
  assert.deepEqual(elegirRelacionados('no-existe', metas), []);
});

test('las rutas de `relacionadas` que no son artículos se siguen enseñando (producto, soluciones…)', () => {
  const a = ARTICULOS.find((x) => x.relacionadas.some((r) => !r.startsWith('/recursos/')));
  assert.ok(a, 'ya no queda ningún artículo con relacionadas de producto: sobra relacionadasDeProducto');
  const producto = relacionadasDeProducto(a, ARTICULOS_META);
  assert.ok(producto.length > 0 && producto.every((r) => !r.startsWith('/recursos/')));
});

test('ningún artículo sin fecha de actualización real, ni anterior a su publicación ni del futuro', () => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  for (const a of ARTICULOS) {
    assert.ok(a.actualizado, `${a.slug}: sin \`actualizado\` (usa la fecha de su última modificación en git)`);
    assert.ok(a.actualizado >= a.publicado, `${a.slug}: actualizado antes de publicarse`);
    assert.ok(a.actualizado <= hoy, `${a.slug}: actualizado en el futuro`);
  }
});

test('la cabecera enseña la fecha de actualización del artículo en una etiqueta <time>', () => {
  const shell = leer('components/recursos/ArticleShell.tsx');
  assert.match(shell, /Actualizado \{actualizado \? <time dateTime=\{actualizado\}>/);
  assert.match(leer('components/recursos/ArticuloDatos.tsx'), /actualizado=\{fechaArticulo\(a\)\}/);
});

test('la llamada a mitad de texto solo existe donde hay un recurso, y lleva a una página que existe', () => {
  const slugs = new Set(ARTICULOS.map((a) => a.slug));
  for (const [slug, clave] of Object.entries(RECURSO_POR_ARTICULO)) {
    assert.ok(slugs.has(slug), `${slug} del mapa no es ningún artículo`);
    const r = recursoIntermedio(slug);
    assert.ok(r && r === RECURSOS_INTERMEDIOS[clave]);
    const [base, ancla] = r.href.split('#');
    assert.ok(RUTAS.has(base), `${slug} → ${base} no existe en el registro`);
    assert.notEqual(base, urlArticulo(slug), `${slug} se enlaza a sí mismo`);
    const destino = ARTICULOS.find((a) => urlArticulo(a.slug) === base);
    if (ancla) {
      assert.ok(destino, `${slug}: ancla #${ancla} en una página que no es un artículo`);
      assert.ok(destino.secciones.some((s) => s.id === ancla), `${slug}: ${base} no tiene la sección #${ancla}`);
    }
    if ('vive' in r && r.vive) {
      const { articulo, bloque, id } = r.vive;
      assert.equal(destino?.slug, articulo, `${clave}: vive en ${articulo}`);
      const campo = bloque === 'descarga' ? 'recurso' : 'id';
      assert.ok(
        destino.secciones.some((s) => s.bloques.some((b) => b.t === bloque && (b as unknown as Record<string, string>)[campo] === id)),
        `${clave}: ${articulo} ya no lleva el bloque ${bloque} «${id}»`,
      );
    }
    assert.ok(r.texto.length > 20 && !/[[\]()]/.test(r.texto), `${clave}: el texto va sin enlaces ni marcado`);
  }
});

test('no se repite el recurso que el artículo ya lleva dentro, ni se pinta junto a otra llamada', () => {
  for (const a of ARTICULOS) {
    const clave = RECURSO_POR_ARTICULO[a.slug];
    if (!clave) continue;
    const r = RECURSOS_INTERMEDIOS[clave];
    if ('vive' in r && r.vive) assert.notEqual(r.vive.articulo, a.slug, `${a.slug} ya lleva ${clave}`);
    const i = seccionDeLaLlamada(a);
    assert.ok(i >= 0, `${a.slug}: sin sección donde poner la llamada`);
    assert.ok(a.secciones[i].bloques.every((b) => !['llamada', 'producto', 'descarga', 'herramienta'].includes(b.t)), `${a.slug}: la llamada cae junto a otra`);
    // A mitad: ni al principio ni en las dos últimas secciones.
    assert.ok(i >= 1 && i <= a.secciones.length - 3, `${a.slug}: la llamada no queda a mitad de texto (sección ${i + 1} de ${a.secciones.length})`);
  }
  // Dos artículos distintos pueden compartir recurso, pero cada uno lleva a lo suyo: no hay claves huérfanas.
  const usadas = new Set(Object.values(RECURSO_POR_ARTICULO));
  for (const k of Object.keys(RECURSOS_INTERMEDIOS)) assert.ok(usadas.has(k as keyof typeof RECURSOS_INTERMEDIOS), `recurso sin ningún artículo: ${k}`);
});

test('el artículo pinta UNA llamada final y la llamada intermedia no es una segunda', () => {
  const src = leer('components/recursos/ArticuloDatos.tsx');
  assert.equal(src.match(/<CtaBlock/g)?.length, 3, 'CtaBlock: la del bloque `producto` y las dos ramas de la final (una u otra)');
  assert.equal(src.match(/a\.cta\.enlace/g)?.length, 3, 'la llamada final se decide en un solo ternario');
  assert.equal(src.match(/className="art-recurso"/g)?.length, 1);
});

test('nada de colores por categoría, cajas de colores, letra de máquina de escribir ni degradados en lo nuevo (#2458)', () => {
  const tarjetas = leer('components/recursos/ArticulosRelacionados.tsx');
  assert.ok(!/lp-mono|categoryColor|gradient|style=\{|background|boxShadow/i.test(tarjetas), 'ArticulosRelacionados: estilos de más');
  const datos = leer('components/recursos/ArticuloDatos.tsx');
  assert.ok(!/RelatedLinks|categoryColor|lp-mono|gradient/i.test(datos), 'ArticuloDatos vuelve a los relacionados con color por categoría');
  const shell = leer('components/recursos/ArticleShell.tsx');
  const bloque = shell.slice(shell.indexOf('.art-recurso'), shell.indexOf('Tablas de más de tres columnas'));
  assert.ok(bloque.includes('.art-rel-tarjeta'), 'no se encuentra el CSS de los relacionados');
  assert.ok(!/gradient|box-shadow|monospace|text-transform|letter-spacing: \.1|@keyframes/i.test(bloque), 'el CSS nuevo lleva sombra, degradado o mayúsculas');
  // Los únicos colores son los neutros que ya usa la página (nada de un color por categoría).
  const colores = [...bloque.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
  const permitidos = new Set(['#E1E1D9', '#FFF', '#1A1A1A', '#6B6B63', '#4A4A44']);
  for (const c of colores) assert.ok(permitidos.has(c), `color nuevo en el CSS de los relacionados: ${c}`);
});
