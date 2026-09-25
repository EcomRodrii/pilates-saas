// Valida un artículo de /recursos mientras se escribe, sin build ni servidor:
//   node --experimental-strip-types scripts/validar-articulo.mjs <slug> [<slug-planeado> …]
// Los slugs extra cuentan como rutas válidas (artículos del mismo lote aún sin registrar).
import { PAGINAS } from '../lib/seo/paginas.ts';
import { ARTICULOS as AYUDA, CATEGORIAS, urlArticulo } from '../lib/ayuda/registro.ts';
import { validarArticulo, contarPalabras } from '../lib/recursos/articulos/validar.ts';

const [slug, ...extra] = process.argv.slice(2);
if (!slug) { console.error('uso: validar-articulo.mjs <slug> [slugs planeados…]'); process.exit(2); }
const mod = await import(`../lib/recursos/articulos/${slug}.ts`);
const articulo = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'slug' in v);
const rutas = new Set([
  ...PAGINAS.map((p) => p.path),
  ...CATEGORIAS.map((c) => `/ayuda/${c.slug}`),
  ...AYUDA.filter((a) => a.estado === 'publicado').map((a) => urlArticulo(a)),
  '/ayuda', '/crear-estudio',
  ...extra.map((s) => `/recursos/${s}`),
]);
const problemas = validarArticulo(articulo, rutas);
console.log(`${articulo.slug}: ${contarPalabras(articulo)} palabras`);
if (problemas.length) { console.log(problemas.map((x) => ` ✖ ${x}`).join('\n')); process.exit(1); }
console.log(' ✔ sin problemas');
