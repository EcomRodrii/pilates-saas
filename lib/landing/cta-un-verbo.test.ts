import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CTA_ALTA } from './founding-gratis.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Un solo verbo para «empezar» en el CUERPO de la web comercial (Ronda 1,
// 19-oct-2026). El botón que lleva al alta (`/crear-estudio`) dice `CTA_ALTA` en
// la banda de arriba, el héroe, el popup, los planes, la banda final y las
// páginas de función y de solución; no «Crear mi estudio» en unas y «Empezar» a
// secas en otras.
//
// Fuera de este test, A PROPÓSITO:
//  · /comparativa (`CtaBlock` y `CompetitorPage`), vetada salvo metadatos.
//
// La cabecera de las páginas internas (`SiteNav`, «Probar gratis») estaba fuera
// hasta la fase 2.1 (19-oct-2026): ahora toda la web lleva la isla
// (components/web/IslaWeb.tsx), que entra en la regla. El pie nuevo
// (components/web/PieWeb.tsx) no lleva botón al alta.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = process.cwd();

/** Cuerpos de página donde el botón al alta debe decir CTA_ALTA. */
const CUERPOS = [
  'components/landing/BandaPrueba.tsx',
  'components/landing/PopupEmpezar.tsx',
  'components/landing/SeccionCtaFinal.tsx',
  'components/landing/BotonBloque.tsx',
  'components/landing/SeccionPrecio.tsx',
  'components/funcionalidades/FeatureShell.tsx',
  'components/funcionalidades/bloques.tsx',
  'components/soluciones/LandingSolucion.tsx',
  'app/funcionalidades/page.tsx',
  // La isla y su menú móvil, en toda la web pública desde la fase 2.1.
  'components/web/IslaWeb.tsx',
];

/** El botón del héroe. La isla, que antes vivía aquí, está en components/web/IslaWeb.tsx (en CUERPOS). */
const HEROE = 'components/landing/SeccionHero.tsx';
const ISLA = 'components/web/IslaWeb.tsx';

// Lo que se acepta como contenido de un botón al alta: la constante, con o sin
// flecha, o el texto del plan que viene de data.ts (cuyos `cta` son la constante).
const CONTENIDO_VALIDO = [/^\{CTA_ALTA\}$/, /^\{CTA_ALTA\} <span aria-hidden>→<\/span>$/, /^\{CTA_ALTA\}\s*<ArrowRight[^>]*\/>$/, /^\{plan\.cta\}$/];

/** Botones (`<Link|a href={ALTA}|"/crear-estudio"…>contenido</…>`) y su contenido. */
export function botonesAlAlta(fuente: string): string[] {
  const salida: string[] = [];
  // Los atributos pueden llevar `=>` (un onClick): `(?:=>|[^>])` los atraviesa (la flecha va primero, para no tomar su `>` por el cierre de la etiqueta).
  const re = /<(Link|a)\b((?:=>|[^>])*?)href=(\{ALTA\}|"\/crear-estudio"|'\/crear-estudio')((?:=>|[^>])*)>([\s\S]*?)<\/\1>/g;
  for (const m of fuente.matchAll(re)) salida.push(m[5].trim().replace(/\s+/g, ' '));
  return salida;
}

export function botonesFueraDeRegla(fuente: string): string[] {
  return botonesAlAlta(fuente).filter((c) => !CONTENIDO_VALIDO.some((v) => v.test(c)));
}

test('el verbo de empezar es uno, y es el de la constante', () => {
  assert.match(CTA_ALTA, /^Empezar gratis$/);
});

for (const f of CUERPOS) {
  test(`${f}: todo botón al alta dice CTA_ALTA`, () => {
    const fuente = readFileSync(join(RAIZ, f), 'utf8');
    const botones = botonesAlAlta(fuente);
    assert.ok(botones.length > 0, `no se encontró ningún botón al alta en ${f}: ¿cambió la forma del enlace?`);
    assert.deepEqual(botonesFueraDeRegla(fuente), [], `botón al alta con otro texto en ${f}`);
  });
}

test('el botón del héroe, la isla y su menú móvil dicen CTA_ALTA', () => {
  const fuente = readFileSync(join(RAIZ, HEROE), 'utf8');
  const botones = botonesAlAlta(fuente);
  // Ronda 2: la isla y su menú móvil dejan «Probar Tentare» (de la prueba de 7 días, que ya no existe) por CTA_ALTA.
  assert.deepEqual(botonesFueraDeRegla(fuente), [], 'ningún botón al alta del héroe puede llevar otro texto');
  assert.ok(botones.includes('{CTA_ALTA}'), 'el botón del héroe debe decir {CTA_ALTA}');
  // La isla: el botón de la píldora y el del menú a pantalla completa, los dos.
  const isla = botonesAlAlta(readFileSync(join(RAIZ, ISLA), 'utf8'));
  assert.deepEqual(isla, ['{CTA_ALTA}', '{CTA_ALTA}'], 'la isla lleva dos botones al alta (píldora y menú móvil) y los dos dicen {CTA_ALTA}');
});

test('los planes de la home usan la constante', () => {
  const data = readFileSync(join(RAIZ, 'components/landing/data.ts'), 'utf8');
  const ctas = [...data.matchAll(/^\s*cta:\s*(.+),$/gm)].map((m) => m[1].trim());
  assert.deepEqual(ctas.filter((c) => c !== 'CTA_ALTA'), ["'Hablar con nosotros'"], 'solo Cadena (que va a WhatsApp, no al alta) lleva otro texto');
});

test('CONTROL: el detector caza «Crear mi estudio», «Empezar» a secas y no confunde lo que está bien', () => {
  assert.deepEqual(botonesFueraDeRegla('<Link href="/crear-estudio" className="x">Crear mi estudio</Link>'), ['Crear mi estudio']);
  assert.deepEqual(botonesFueraDeRegla('<Link href={ALTA} className="x">Empezar <span aria-hidden>→</span></Link>'), ['Empezar <span aria-hidden>→</span>']);
  assert.deepEqual(botonesFueraDeRegla('<a href="/crear-estudio" style={{ color: 1 }}>Crear mi estudio</a>'), ['Crear mi estudio']);
  assert.deepEqual(botonesFueraDeRegla('<Link href="/crear-estudio" className="x">{CTA_ALTA}</Link>'), []);
  assert.deepEqual(botonesFueraDeRegla('<Link href={ALTA} className="x">{CTA_ALTA} <span aria-hidden>→</span></Link>'), []);
  assert.deepEqual(botonesFueraDeRegla('<Link\n  href="/crear-estudio"\n  onClick={() => f(true)}\n>\n  {CTA_ALTA}\n  <ArrowRight size={17} aria-hidden="true" />\n</Link>'), []);
  // Un enlace que no es al alta no cuenta.
  assert.deepEqual(botonesAlAlta('<Link href="/precios">Ver precios</Link>'), []);
});
