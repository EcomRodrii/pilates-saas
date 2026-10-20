import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NO_SE_LLEVA, RUTAS_MIGRACION, SE_LLEVA } from './migracion.ts';
import { CTA_ALTA } from './founding-gratis.ts';
import { botonesAlAlta, botonesFueraDeRegla } from './cta-un-verbo.test.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 3 de la landing (19-oct-2026): migración en dos rutas y un botón por bloque.
// Con la home v2 (20-oct) salieron las seis tarjetas, el comparador, el bento y las
// guías (repetían lo que cuentan las pestañas); entra «Un día cualquiera».
//
// Cada test lleva su CONTROL: una comprobación que no puede fallar no prueba
// nada. Los controles son lo que cambia al otro lado (una ruta inventada, una
// cifra colada, un botón con otro verbo).
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), 'utf8');

/** Rutas estáticas de `app/` (una por `page.tsx`), con los route-groups colapsados. */
function rutasEstaticas(dir = join(RAIZ, 'app'), prefijo = ''): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (entrada === 'page.tsx') { rutas.push(prefijo === '' ? '/' : prefijo); continue; }
    if (!statSync(completo).isDirectory()) continue;
    if (entrada.startsWith('[') || entrada.startsWith('_') || entrada.startsWith('@')) continue;
    const segmento = entrada.startsWith('(') && entrada.endsWith(')') ? '' : `/${entrada}`;
    rutas.push(...rutasEstaticas(completo, prefijo + segmento));
  }
  return rutas;
}
const EXISTENTES = new Set(rutasEstaticas());
const rutaExiste = (href: string, existentes: ReadonlySet<string> = EXISTENTES) => existentes.has(href.split('#')[0].split('?')[0]);

/** Una cifra, un porcentaje o un importe en un texto: lo que esta ronda no puede llevar. */
export const CIFRA = /[0-9]|%|€|\b(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil)\b.*\b(?:horas?|minutos?|días?|veces)\b/i;

const frasesQueFaltan = (fichero: string, frases: readonly string[]) => {
  const fuente = leer(fichero);
  return frases.filter((f) => !fuente.includes(f));
};

// ── «Un día cualquiera» (home v2) ───────────────────────────────────────────

test('los cuatro momentos: un verbo cada uno, sin cifras y sin nombrar nada congelado o apagado', () => {
  const fuente = leer('components/web/home/Momentos.tsx');
  const verbos = [...fuente.matchAll(/verbo: '([^']+)'/g)].map((m) => m[1]);
  const textos = [...fuente.matchAll(/texto: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(verbos, ['Reserva.', 'Repite.', 'Cubre.', 'Cobra.']);
  assert.equal(textos.length, 4);
  for (const t of textos) {
    assert.doesNotMatch(t, CIFRA, t);
    assert.doesNotMatch(t, /ClassPass|Wellhub|Urban|Gmail|Kiosko|Network|Core|Veri\*?Factu/i, t);
  }
  // La sustitución espera el sí de la propietaria: es el modo por defecto (asistido).
  assert.match(textos[2], /espera tu sí/);
});

// ── Migración ───────────────────────────────────────────────────────────────

test('la migración cuenta las dos rutas que /soluciones/cambiar-de-software ya cuenta, y nada más', () => {
  assert.equal(RUTAS_MIGRACION.length, 2);
  const pagina = 'app/soluciones/cambiar-de-software/page.tsx';
  for (const r of RUTAS_MIGRACION) {
    assert.deepEqual(frasesQueFaltan(pagina, r.frases), [], `${r.titulo}: la página ya no dice lo que la ruta afirma`);
  }
  assert.match(leer(pagina), /1\. Tú misma, en el panel/);
  assert.match(leer(pagina), /2\. Te la hacemos nosotros/);
});

test('la lista de «qué se trae» es la MISMA que la de la página, y lo que no se trae son las tarjetas guardadas', () => {
  assert.match(leer('app/soluciones/cambiar-de-software/page.tsx'), /from '@\/lib\/landing\/migracion'/, 'la página debe importar SE_LLEVA, no copiarla');
  assert.equal(SE_LLEVA.length, 6);
  const faq = leer('app/soluciones/cambiar-de-software/page.tsx');
  assert.match(faq, /las tarjetas guardadas no se migran/i);
  assert.match(NO_SE_LLEVA.titulo, /tarjetas guardadas/i);
});

test('el ancla de la segunda ruta existe en la página de migración', () => {
  assert.match(leer('app/soluciones/cambiar-de-software/page.tsx'), /id=\{ANCLA_AYUDA\}/);
});

// ── Botón por bloque ────────────────────────────────────────────────────────

test('el botón de cierre de bloque dice «Empezar gratis» y lleva al alta', () => {
  const fuente = leer('components/landing/BotonBloque.tsx');
  assert.deepEqual(botonesAlAlta(fuente), ['{CTA_ALTA}']);
  assert.deepEqual(botonesFueraDeRegla(fuente), []);
  assert.equal(CTA_ALTA, 'Empezar gratis');
});

// Home v2: el bloque de beneficio que cierra con su botón (el bento y el comparador salieron).
const BLOQUES_CON_BOTON = ['SeOcupaDelResto'];
for (const b of BLOQUES_CON_BOTON) {
  test(`${b}: cierra con el botón de bloque y no escribe otro botón al alta con otro texto`, () => {
    const fuente = leer(`components/web/home/${b}.tsx`);
    assert.match(fuente, /<BotonBloque\b/);
    assert.deepEqual(botonesFueraDeRegla(fuente), []);
  });
}

test('el orden de la home v2: logos dentro del héroe, el beneficio, el producto por áreas, el día, las etapas, el precio, las preguntas y el cierre', () => {
  const l = leer('app/page.tsx');
  const pos = (x: string) => l.indexOf(x);
  const orden = ['<Heroe logos={<FranjaLogos', '<SeOcupaDelResto />', '<PestanasProducto />', '<Momentos />',
    '<Etapas />', '<PrecioHome />', '<PreguntasHome />', '<CierreHome />'];
  for (const x of orden) assert.ok(pos(x) > 0, `falta ${x}`);
  for (let i = 1; i < orden.length; i++) assert.ok(pos(orden[i - 1]) < pos(orden[i]), `${orden[i - 1]} debe ir antes que ${orden[i]}`);
  // Lo que salió no vuelve de rebote.
  for (const x of ['<SeisVerbos', '<BentoProducto', '<FilasEditoriales', '<BandaComparador', '<GuiasHome']) assert.equal(pos(x), -1, `${x} volvió a la home`);
});

// ── Controles ───────────────────────────────────────────────────────────────

test('CONTROL: el detector de cifras caza lo que debe y deja pasar lo que no lo es', () => {
  assert.match('ahorra 10 horas a la semana', CIFRA);
  assert.match('un 30 % menos de impagos', CIFRA);
  assert.match('desde 59 € al mes', CIFRA);
  assert.match('en tres días', CIFRA);
  assert.doesNotMatch('Reservan desde tu app, con tu nombre y tu logo.', CIFRA);
  assert.doesNotMatch('Si una tarjeta falla, se reintenta solo.', CIFRA);
});

test('CONTROL: una ruta inventada no existe, una verdadera sí', () => {
  assert.equal(rutaExiste('/funcionalidades/no-existe'), false);
  assert.equal(rutaExiste('/funcionalidades/sustituciones#escalado'), true);
  assert.equal(rutaExiste('/funcionalidades/sustituciones', new Set()), false);
});

test('CONTROL: una frase que no está en la fuente se detecta', () => {
  assert.deepEqual(frasesQueFaltan('app/funcionalidades/sustituciones/page.tsx', ['La baja se cubre sola']), []);
  assert.deepEqual(frasesQueFaltan('app/funcionalidades/sustituciones/page.tsx', ['Garantizamos cobertura al cien por cien']), ['Garantizamos cobertura al cien por cien']);
});

test('CONTROL: un botón al alta con otro verbo se caza', () => {
  assert.deepEqual(botonesFueraDeRegla('<Link href={ALTA} className="x">Crear mi estudio</Link>'), ['Crear mi estudio']);
});
