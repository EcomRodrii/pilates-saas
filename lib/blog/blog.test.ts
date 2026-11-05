import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARTICULOS_BLOG, ARTICULOS_BLOG_TODOS, BORRADORES_BLOG, articuloBlogPorSlug, relacionadosBlog } from './articulos/index.ts';
import { ARTICULOS_BLOG_META } from './meta.ts';
import { AUTOR_BLOG, ID_AUTOR, ID_BLOG_PERSONAL, LINKEDIN_PERSONAL, RUTA_AUTOR } from './autor.ts';
import { CATEGORIAS_BLOG, categoriaBlog } from './categorias.ts';
import { articuloBlogLd, blogLd, fechaRfc822, ID_ORGANIZACION_BLOG, migasBlogLd, perfilLd, personaLd, rssBlog } from './schema.ts';
import { fechaLargaBlog, metaBlogDe, minutosLecturaBlog, textoDeSecciones, textoPlanoBlog, urlArticuloBlog } from './util.ts';
import { PAGINAS, paginaDe } from '../seo/paginas.ts';
import { AUTOR, PUBLISHER } from '../recursos/schema.ts';

// El blog personal del fundador (nov-2026). Lo que se fija aquí: que no se publique nada que no conste, que los
// borradores no se filtren a ningún sitio público y que la persona sea UNA sola entidad en todo el sitio.

const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const ISO = /^\d{4}-\d{2}-\d{2}$/;

test('meta.ts está al día con los artículos publicados (regenerar: node --experimental-strip-types scripts/generar-meta-blog.mjs)', () => {
  assert.deepEqual(ARTICULOS_BLOG_META, ARTICULOS_BLOG.map(metaBlogDe));
});

test('los slugs son únicos y en kebab-case; cada categoría existe', () => {
  const slugs = ARTICULOS_BLOG_TODOS.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const a of ARTICULOS_BLOG_TODOS) {
    assert.match(a.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, a.slug);
    assert.ok(categoriaBlog(a.categoria), `${a.slug}: categoría ${a.categoria}`);
  }
  assert.equal(new Set(CATEGORIAS_BLOG.map((c) => c.slug)).size, 6);
});

test('un artículo publicado lleva lo que Google y quien lee necesitan', () => {
  for (const a of ARTICULOS_BLOG) {
    assert.match(a.publicado, ISO);
    if (a.actualizado) { assert.match(a.actualizado, ISO); assert.ok(a.actualizado >= a.publicado, `${a.slug}: actualizado < publicado`); }
    assert.ok(a.descripcion.length >= 110 && a.descripcion.length <= 170, `${a.slug}: description de ${a.descripcion.length}`);
    assert.ok(a.tituloSeo.length <= 62, `${a.slug}: title SEO de ${a.tituloSeo.length}`);
    assert.ok(a.secciones.length >= 1);
    for (const s of a.secciones) assert.match(s.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(new Set(a.secciones.map((s) => s.id)).size, a.secciones.length, `${a.slug}: ids de sección repetidos`);
    // Ninguna fecha en el futuro: en el despliegue de hoy no puede salir nada «programado».
    assert.ok(a.publicado <= new Date().toISOString().slice(0, 10), `${a.slug}: publicado en el futuro`);
  }
});

test('⚠️ no se publica nada inventado: ni logros, ni dinero, ni cifras de negocio, ni sustituciones', () => {
  const PROHIBIDO = /sustitu|baja cubierta|premi[oa]|galard|financiaci|inversor|ronda|facturaci|millones|\bARR\b|\bMRR\b|cientos de|miles de|ganador|becad/i;
  for (const a of ARTICULOS_BLOG) {
    const texto = [a.titulo, a.descripcion, a.resumen, a.entradilla, textoDeSecciones(a.secciones), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join(' ');
    assert.doesNotMatch(texto, PROHIBIDO, a.slug);
  }
});

test('los borradores no se filtran: ni meta, ni registro SEO, ni ruta, y llevan sus preguntas', () => {
  assert.ok(BORRADORES_BLOG.length >= 5);
  for (const b of BORRADORES_BLOG) {
    assert.ok(b.guion.length >= 3 && b.preguntas.length >= 3, `${b.slug}: guion y preguntas`);
    assert.equal(articuloBlogPorSlug(b.slug), undefined, `${b.slug}: no debe poder renderizarse`);
    assert.ok(!ARTICULOS_BLOG_META.some((m) => m.slug === b.slug));
    assert.equal(paginaDe(urlArticuloBlog(b.slug)), undefined, `${b.slug}: no debe estar en el sitemap`);
    assert.ok(!rssBlog(ARTICULOS_BLOG_META).includes(b.slug));
  }
  // Los seis temas pedidos por el fundador están preparados (uno publicado y el resto en borrador).
  assert.equal(ARTICULOS_BLOG_TODOS.length, 6);
});

test('todo enlace interno de un artículo lleva a una página que existe', () => {
  const existentes = new Set([...PAGINAS.map((p) => p.path), '/legal', '/blog/feed.xml', '/crear-estudio']);
  for (const a of ARTICULOS_BLOG) {
    const textos = [a.entradilla, ...a.secciones.flatMap((s) => s.bloques.flatMap((b) => (b.t === 'lista' ? b.items : [(b as { texto: string }).texto])))];
    const rutas = textos.flatMap((t) => [...t.matchAll(/\]\((\/[^)#]*)/g)].map((m) => m[1]));
    for (const r of [...rutas, ...(a.enlaces ?? [])]) assert.ok(existentes.has(r), `${a.slug}: enlaza a ${r}, que no existe`);
  }
});

test('el autor: un solo Person, con @id estable y sin nada que no conste', () => {
  const p = personaLd() as Record<string, unknown>;
  assert.equal(p['@id'], ID_AUTOR);
  assert.equal(p.name, 'Marcos Roca Rodríguez');
  assert.equal(p.jobTitle, 'Fundador de Tentare');
  assert.deepEqual(p.worksFor, { '@id': ID_ORGANIZACION_BLOG });
  for (const prohibido of ['award', 'birthDate', 'taxID', 'vatID', 'telephone', 'email', 'alumniOf', 'hasCredential']) {
    assert.ok(!(prohibido in p), `Person no debe llevar ${prohibido}`);
  }
  // `sameAs` solo con un perfil PERSONAL de LinkedIn verificado: hoy no hay (se pedirá al fundador), y nunca la página de la empresa.
  if (LINKEDIN_PERSONAL === null) assert.ok(!('sameAs' in p), 'sin perfil verificado no hay sameAs');
  else assert.match(LINKEDIN_PERSONAL, /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/]+\/?$/);
  assert.ok(!JSON.stringify(p).includes('company/tentare'), 'la página de la empresa no es un perfil de la persona');
});

test('la persona es UNA sola entidad en todo el sitio: guías, Organization y blog apuntan al mismo @id y a la misma página', () => {
  assert.equal(AUTOR['@id'], ID_AUTOR);
  assert.equal(AUTOR.name, AUTOR_BLOG.nombre);
  assert.ok(AUTOR.url.endsWith(RUTA_AUTOR));
  assert.equal(PUBLISHER['@id'], ID_ORGANIZACION_BLOG, 'el editor del blog es la misma Organization que pinta cada página');
  const org = leer('components/OrganizationStructuredData.tsx');
  assert.match(org, /export const ID_FUNDADOR = ID_AUTOR;/);
  const sobre = leer('app/sobre-tentare/page.tsx');
  assert.ok(!/'@type': 'Person'/.test(sobre), '/sobre-tentare no vuelve a definir una segunda persona');
});

test('el JSON-LD de la página de autor, del listado y de cada artículo', () => {
  const g = (perfilLd('2026-11-05') as { '@graph': Record<string, unknown>[] })['@graph'];
  assert.deepEqual(g.map((n) => n['@type']), ['ProfilePage', 'Person']);
  assert.deepEqual(g[0].mainEntity, { '@id': ID_AUTOR });
  const blog = blogLd(ARTICULOS_BLOG_META) as { blogPost: unknown[]; '@id': string };
  assert.equal(blog['@id'], ID_BLOG_PERSONAL);
  assert.equal(blog.blogPost.length, ARTICULOS_BLOG_META.length);
  for (const m of ARTICULOS_BLOG_META) {
    const ld = articuloBlogLd(m, 300) as Record<string, any>;
    assert.equal(ld['@type'], 'BlogPosting');
    assert.deepEqual(ld.author, { '@id': ID_AUTOR });
    assert.deepEqual(ld.publisher, { '@id': ID_ORGANIZACION_BLOG });
    assert.deepEqual(ld.isPartOf, { '@id': ID_BLOG_PERSONAL });
    assert.ok(String(ld.url).endsWith(urlArticuloBlog(m.slug)));
    assert.match(ld.datePublished, ISO);
    assert.match(ld.dateModified, ISO);
  }
  const migas = migasBlogLd([{ nombre: 'Blog', ruta: '/blog' }]) as { itemListElement: { position: number }[] };
  assert.deepEqual(migas.itemListElement.map((i) => i.position), [1, 2]);
});

test('el RSS solo lleva lo publicado, está bien formado y escapa lo que debe', () => {
  const xml = rssBlog(ARTICULOS_BLOG_META);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, ARTICULOS_BLOG_META.length);
  assert.equal((xml.match(/<\/item>/g) ?? []).length, ARTICULOS_BLOG_META.length);
  assert.doesNotMatch(xml, /<title>[^<]*&(?!amp;|lt;|gt;|quot;)/);
  assert.equal(fechaRfc822('2026-11-05'), 'Thu, 05 Nov 2026 12:00:00 GMT');
});

test('el listado y la página de autor están en el registro SEO, con su fecha real y sin colisión de títulos', () => {
  for (const ruta of ['/blog', RUTA_AUTOR]) {
    const p = paginaDe(ruta);
    assert.ok(p, ruta);
    assert.equal(p!.grupo, 'blog');
    assert.match(p!.actualizado ?? '', ISO);
  }
  for (const a of ARTICULOS_BLOG) assert.ok(paginaDe(urlArticuloBlog(a.slug)), `${a.slug} en el registro`);
});

test('ayudantes: fechas, texto plano y minutos de lectura', () => {
  assert.equal(fechaLargaBlog('2026-11-05'), '5 de noviembre de 2026');
  assert.equal(textoPlanoBlog('Un **dato** y [un enlace](/legal).'), 'Un dato y un enlace.');
  for (const a of ARTICULOS_BLOG) assert.ok(minutosLecturaBlog(a) >= 1);
  const rel = relacionadosBlog(ARTICULOS_BLOG[0].slug, 3);
  assert.ok(!rel.some((r) => r.slug === ARTICULOS_BLOG[0].slug), 'nunca se relaciona consigo mismo');
});

test('la foto del autor existe en sus dos formatos y la imagen para redes mide 1200×630', () => {
  for (const a of AUTOR_BLOG.foto.anchos) for (const ext of ['avif', 'webp']) {
    assert.ok(readFileSync(new URL(`../../public${AUTOR_BLOG.foto.base}-${a}.${ext}`, import.meta.url)).length > 1000, `${a}.${ext}`);
  }
  assert.ok(readFileSync(new URL(`../../public${AUTOR_BLOG.og.ruta}`, import.meta.url)).length > 1000);
  assert.equal(AUTOR_BLOG.og.ancho, 1200);
  assert.equal(AUTOR_BLOG.og.alto, 630);
});
