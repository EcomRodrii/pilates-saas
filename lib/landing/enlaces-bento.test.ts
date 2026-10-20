import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { paginaDe, PAGINAS } from '../seo/paginas.ts';
import { ARTICULOS, urlArticulo } from '../recursos/articulos/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Los enlaces de la landing (Ronda 1, 19-oct-2026).
//
// El fallo que esto evita viene de la revisión de Momence: seis tarjetas que
// llevan todas al mismo sitio (la demo) y enlaces que no llevan a ninguna parte.
// Aquí cada tarjeta del bento tiene que llevar a SU página de función o de
// solución, y todo enlace interno escrito a mano en las secciones de la landing
// tiene que apuntar a una ruta que existe en `app/`.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = process.cwd();
const RAIZ_APP = join(RAIZ, 'app');
const DIR_LANDING = join(RAIZ, 'components', 'landing');
// Home nueva (fase 2.2, 19-oct-2026): las secciones viven aquí.
const DIR_HOME = join(RAIZ, 'components', 'web', 'home');

/** Rutas estáticas de `app/` (una por `page.tsx`), con los route-groups colapsados. */
function rutasEstaticas(dir = RAIZ_APP, prefijo = ''): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (entrada === 'page.tsx') {
      rutas.push(prefijo === '' ? '/' : prefijo);
      continue;
    }
    if (!statSync(completo).isDirectory()) continue;
    if (entrada.startsWith('[') || entrada.startsWith('_') || entrada.startsWith('@')) continue;
    const segmento = entrada.startsWith('(') && entrada.endsWith(')') ? '' : `/${entrada}`;
    rutas.push(...rutasEstaticas(completo, prefijo + segmento));
  }
  return rutas;
}

const EXISTENTES = new Set<string>([
  ...rutasEstaticas(),
  // Los artículos escritos como datos los sirve app/recursos/[slug].
  ...ARTICULOS.map((a) => urlArticulo(a.slug)),
]);

/** ¿Existe la ruta? Quita ancla y query: `/precios#planes` es `/precios`. */
export function rutaExiste(href: string, existentes: ReadonlySet<string> = EXISTENTES): boolean {
  const limpia = href.split('#')[0].split('?')[0];
  if (limpia === '') return true; // ancla de la propia página
  return existentes.has(limpia);
}

/** Enlaces internos escritos a mano: `href="/x"`, `href: '/x'`. Ignora externos, anclas puras y plantillas. */
export function enlacesInternos(fuente: string): string[] {
  const hrefs = [
    ...[...fuente.matchAll(/href=(?:"([^"]+)"|'([^']+)')/g)].map((m) => m[1] ?? m[2]),
    ...[...fuente.matchAll(/href:\s*(?:"([^"]+)"|'([^']+)')/g)].map((m) => m[1] ?? m[2]),
  ];
  return hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//') && !h.includes('${'));
}

/** Las seis tarjetas del bento (BentoProducto.tsx): `id: 'wh-bn-…',\n href: '…'`. */
export function tarjetasDelBento(fuente: string): string[] {
  return [...fuente.matchAll(/id: 'wh-bn-[a-z]+',\s*href: '([^']+)'/g)].map((m) => m[1]);
}

const DESTINOS_PROHIBIDOS = [/^\/crear-estudio/, /^\/empieza/, /^\/login/, /demo/i, /^#/];

/** Problemas de una tarjeta del bento; vacío = bien. */
export function problemasDeTarjeta(href: string, existentes: ReadonlySet<string> = EXISTENTES): string[] {
  const fallos: string[] = [];
  if (!(href.startsWith('/funcionalidades/') || href.startsWith('/soluciones/'))) fallos.push('no lleva a una página de función ni de solución');
  for (const p of DESTINOS_PROHIBIDOS) if (p.test(href)) fallos.push(`lleva a ${href}, que es la demo/el alta, no su función`);
  if (!rutaExiste(href, existentes)) fallos.push('la ruta no existe en app/');
  return fallos;
}

const BENTO = readFileSync(join(DIR_HOME, 'BentoProducto.tsx'), 'utf8');

test('el bento tiene sus seis tarjetas, cada una con su propio destino', () => {
  const tarjetas = tarjetasDelBento(BENTO);
  assert.equal(tarjetas.length, 6, `se esperaban 6 tarjetas con enlace y hay ${tarjetas.length}`);
  assert.equal(new Set(tarjetas).size, 6, `dos tarjetas llevan al mismo sitio: ${tarjetas.join(', ')}`);
});

test('cada tarjeta del bento lleva a su página de función o solución, y esa página existe', () => {
  for (const href of tarjetasDelBento(BENTO)) {
    assert.deepEqual(problemasDeTarjeta(href), [], href);
    assert.ok(paginaDe(href), `${href} no está en el registro SEO (lib/seo/paginas.ts)`);
  }
});

test('los chips del bento llevan cada uno a una ruta que existe', () => {
  const chips = [...BENTO.matchAll(/\['[^']+',\s*'(\/[^']+)'\]/g)].map((m) => m[1]);
  assert.ok(chips.length >= 15, `solo se leyeron ${chips.length} chips`);
  assert.deepEqual(chips.filter((h) => !rutaExiste(h)), []);
});

test('ningún enlace interno de la home ni de su armazón apunta a una ruta que no existe', () => {
  const deLaHome = readdirSync(DIR_HOME).filter((f) => f.endsWith('.tsx')).map((f) => join(DIR_HOME, f));
  const delArmazon = readdirSync(DIR_LANDING)
    .filter((f) => /^Seccion.*\.tsx$/.test(f) || ['enlaces.ts', 'data.ts', 'PopupEmpezar.tsx', 'BandaPrueba.tsx', 'LandingCliente.tsx'].includes(f))
    .map((f) => join(DIR_LANDING, f));
  const ficheros = [...deLaHome, ...delArmazon];
  assert.ok(deLaHome.length >= 12, `solo se leyeron ${deLaHome.length} ficheros de la home`);
  const rotos: string[] = [];
  for (const f of ficheros) {
    for (const h of enlacesInternos(readFileSync(f, 'utf8'))) {
      if (!rutaExiste(h)) rotos.push(`${f.replace(RAIZ + '/', '')}: ${h}`);
    }
  }
  assert.deepEqual(rotos, []);
});

test('las comparativas que enlaza la etapa «quiero cambiar» existen', () => {
  const fuente = readFileSync(join(DIR_HOME, 'Etapas.tsx'), 'utf8');
  const slugs = [...fuente.matchAll(/\['([a-z]+)', '[^']+'\]/g)].map((m) => m[1]);
  assert.ok(slugs.length >= 6, `solo se encontraron ${slugs.length} comparativas`);
  const sinPagina = slugs.filter((s) => !PAGINAS.some((p) => p.path === `/comparativa/tentare-vs-${s}`));
  assert.deepEqual(sinPagina, []);
});

test('CONTROL: el detector caza una tarjeta a la demo, una ruta rota y una fila mal enlazada', () => {
  // Una tarjeta que lleva al alta o a una demo no es "su función".
  assert.ok(problemasDeTarjeta('/crear-estudio').length > 0);
  assert.ok(problemasDeTarjeta('/demo').length > 0);
  assert.ok(problemasDeTarjeta('/funcionalidades/reservas-online?demo=1').some((f) => f.includes('demo')));
  // Una función que no existe.
  assert.ok(problemasDeTarjeta('/funcionalidades/no-existe').some((f) => f.includes('no existe')));
  // Una buena pasa.
  assert.deepEqual(problemasDeTarjeta('/funcionalidades/reservas-online'), []);
  assert.deepEqual(problemasDeTarjeta('/soluciones/cambiar-de-software'), []);
  // El extractor lee lo que debe, y el comprobador de rutas no se deja engañar por un ancla.
  assert.deepEqual(tarjetasDelBento("id: 'wh-bn-x',\n    href: '/funcionalidades/x',"), ['/funcionalidades/x']);
  assert.deepEqual(enlacesInternos(`<Link href="/precios">a</Link><a href="https://x.es">b</a><a href="#top">c</a><Link href={\`/c/\${s}\`}>`), ['/precios']);
  assert.equal(rutaExiste('/precios#planes'), true);
  assert.equal(rutaExiste('/precios-que-no-existen'), false);
  // Con un conjunto de rutas vacío, todo enlace es roto: el test de arriba no es hueco.
  assert.equal(rutaExiste('/precios', new Set()), false);
});
