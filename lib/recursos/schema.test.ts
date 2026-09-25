import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL } from '../legal-info.ts';
import { GUIAS, TARJETAS_SIN_GUIA } from './guias.ts';
import { ARTICULOS } from './articulos/index.ts';
import { ID_BLOG, blogLd, blogPostingLd, imagenesSitemap, openGraphGuia } from './schema.ts';

// JSON-LD de /recursos: lo que Google necesita para leer cada guía como un post
// de blog con imagen, y el listado como el Blog que las agrupa.

const RAIZ = join(import.meta.dirname, '..', '..');
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;
const absoluta = (url: unknown) => typeof url === 'string' && url.startsWith(`${LEGAL.url}/`);

const ld = (slug: string) => blogPostingLd({ slug, titulo: 'Titular', descripcion: 'Descripción' });

test('cada guía es un BlogPosting con imagen absoluta y medidas', () => {
  for (const g of GUIAS) {
    const post = ld(g.slug);
    assert.equal(post['@type'], 'BlogPosting');
    assert.ok(Array.isArray(post.image) && post.image.length > 0, `${g.slug}: sin image`);
    for (const img of post.image) {
      assert.equal(img['@type'], 'ImageObject');
      assert.ok(absoluta(img.url), `${g.slug}: image no absoluta (${img.url})`);
      assert.ok(Number.isInteger(img.width) && img.width > 0 && Number.isInteger(img.height) && img.height > 0, `${g.slug}: image sin medidas`);
    }
    // Una de 1200 px (la OG), que es lo que Google pide para mostrarla grande.
    assert.ok(post.image.some((i) => i.width >= 1200), `${g.slug}: ninguna imagen de 1200 px`);
    // Y la portada, que tiene que existir de verdad en public/.
    const portada = post.image.find((i) => i.url.includes('/recursos/portadas/'));
    assert.ok(portada, `${g.slug}: la portada no está en image`);
    assert.ok(existsSync(join(RAIZ, 'public', portada.url.slice(LEGAL.url.length))), `${g.slug}: la portada del JSON-LD no existe`);
  }
});

test('fechas ISO, idioma, sección y pertenencia al Blog', () => {
  for (const g of GUIAS) {
    const post = ld(g.slug);
    assert.match(post.datePublished, ISO, `${g.slug}: datePublished`);
    assert.match(post.dateModified, ISO, `${g.slug}: dateModified`);
    assert.equal(post.datePublished, g.publicado, `${g.slug}: la fecha no sale del registro`);
    assert.ok(post.dateModified >= post.datePublished, `${g.slug}: modificada antes de publicada`);
    assert.equal(post.inLanguage, 'es-ES');
    assert.equal(post.articleSection, g.seccion);
    assert.deepEqual(post.isPartOf, { '@type': 'Blog', '@id': ID_BLOG });
    assert.deepEqual(post.mainEntityOfPage, { '@type': 'WebPage', '@id': `${LEGAL.url}/recursos/${g.slug}` });
  }
});

test('autor Person y editor Organization con logo ImageObject absoluto', () => {
  const post = ld(GUIAS[0].slug);
  assert.equal(post.author['@type'], 'Person');
  assert.equal(post.author.name, 'Marcos Roca');
  assert.equal(post.publisher['@type'], 'Organization');
  assert.equal(post.publisher.logo['@type'], 'ImageObject');
  assert.ok(absoluta(post.publisher.logo.url));
  assert.ok(existsSync(join(RAIZ, 'public', post.publisher.logo.url.slice(LEGAL.url.length))), 'el logo del editor no existe en public/');
});

test('el Blog lista las guías y los artículos publicados, con el mismo @id que usan los posts', () => {
  const blog = blogLd();
  assert.equal(blog['@type'], 'Blog');
  assert.equal(blog['@id'], ID_BLOG);
  assert.equal(blog.url, `${LEGAL.url}/recursos`);
  assert.ok(blog.publisher.logo);
  const urls = blog.blogPost.map((p) => p.url);
  assert.deepEqual(urls.sort(), [...GUIAS, ...ARTICULOS].map((g) => `${LEGAL.url}/recursos/${g.slug}`).sort());
  // Ni la «en preparación» (sin página) ni la comparativa (no es una guía).
  for (const t of TARJETAS_SIN_GUIA) {
    assert.ok(!blog.blogPost.some((p) => p.headline === t.titulo), `«${t.titulo}» no debe estar en el Blog`);
  }
  for (const p of blog.blogPost) {
    assert.ok(p.headline && absoluta(p.url) && absoluta(p.image.url));
    assert.match(p.datePublished, ISO);
    // Cada una tiene su página de verdad: la guía, su carpeta; el artículo
    // escrito como datos, la ruta dinámica app/recursos/[slug].
    const ruta = p.url.slice(LEGAL.url.length);
    const esArticulo = ARTICULOS.some((a) => `/recursos/${a.slug}` === ruta);
    const pagina = esArticulo ? join(RAIZ, 'app', 'recursos', '[slug]', 'page.tsx') : join(RAIZ, 'app', ruta, 'page.tsx');
    assert.ok(existsSync(pagina), `${p.url} no tiene página`);
  }
});

test('Open Graph de artículo y sitemap de imágenes', () => {
  for (const g of GUIAS) {
    const og = openGraphGuia(g.slug);
    assert.equal(og.publishedTime, g.publicado);
    assert.match(og.modifiedTime, ISO);
    assert.deepEqual(og.authors, ['Marcos Roca']);
    assert.equal(og.section, g.seccion);
    const imgs = imagenesSitemap(`/recursos/${g.slug}`);
    assert.equal(imgs.length, 1);
    assert.ok(absoluta(imgs[0]));
  }
  assert.deepEqual(imagenesSitemap('/recursos'), []);
  assert.deepEqual(imagenesSitemap('/precios'), []);
});

test('el JSON-LD no se escapa del <script>: sin «</» sin escapar', () => {
  // El componente reemplaza «<» por <; aquí se comprueba que no hay nada raro
  // que dependa de ello (un titular con HTML, por ejemplo).
  for (const g of GUIAS) assert.doesNotMatch(JSON.stringify(ld(g.slug)), /<\/script/i);
});
