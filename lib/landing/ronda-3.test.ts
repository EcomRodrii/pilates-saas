import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SEIS_VERBOS } from './seis-verbos.ts';
import { COMPARADOR } from './comparador.ts';
import { NO_SE_LLEVA, RUTAS_MIGRACION, SE_LLEVA } from './migracion.ts';
import { CTA_ALTA } from './founding-gratis.ts';
import { botonesAlAlta, botonesFueraDeRegla } from './cta-un-verbo.test.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 3 de la landing (19-oct-2026): seis tarjetas «verbo + punto», comparador
// «hoy → con Tentare», migración en dos rutas, chips del bento y guías con foto.
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

// ── Seis tarjetas ───────────────────────────────────────────────────────────

test('hay seis tarjetas y cada una lleva a una página de función DISTINTA que existe', () => {
  assert.equal(SEIS_VERBOS.length, 6);
  assert.equal(new Set(SEIS_VERBOS.map((v) => v.href)).size, 6, 'dos tarjetas llevan al mismo sitio');
  assert.equal(new Set(SEIS_VERBOS.map((v) => v.verbo)).size, 6);
  for (const v of SEIS_VERBOS) {
    assert.match(v.href, /^\/funcionalidades\/[a-z-]+$/, `${v.verbo}: no lleva a una función`);
    assert.ok(rutaExiste(v.href), `${v.verbo}: ${v.href} no existe en app/`);
    assert.doesNotMatch(v.href, /crear-estudio|demo|login/);
  }
});

test('cada frase de las seis tarjetas consta en la página de función que enlaza', () => {
  for (const v of SEIS_VERBOS) {
    assert.ok(v.fuente.fichero.includes(v.href.replace('/funcionalidades/', '')), `${v.verbo}: la fuente no es la página que enlaza`);
    assert.deepEqual(frasesQueFaltan(v.fuente.fichero, v.fuente.frases), [], `${v.verbo}: la página ya no dice lo que la tarjeta afirma`);
  }
});

test('las seis tarjetas no llevan cifras ni nombran nada congelado o apagado', () => {
  for (const v of SEIS_VERBOS) {
    assert.doesNotMatch(`${v.verbo} ${v.texto} ${v.funcion}`, CIFRA, v.verbo);
    assert.doesNotMatch(v.texto, /ClassPass|Wellhub|Urban|Gmail|Kiosko|Network|Core|Veri\*?Factu/i, v.verbo);
  }
});

// ── Comparador ──────────────────────────────────────────────────────────────

test('el comparador tiene seis filas, sin una sola cifra, porcentaje ni importe', () => {
  assert.equal(COMPARADOR.length, 6);
  for (const f of COMPARADOR) {
    assert.doesNotMatch(`${f.tema} ${f.hoy} ${f.conTentare}`, CIFRA, f.tema);
    assert.doesNotMatch(`${f.hoy} ${f.conTentare}`, /ClassPass|Wellhub|Urban|Gmail|Kiosko|Network|Core|Veri\*?Factu|ahorra|horas/i, f.tema);
  }
});

test('cada fila del comparador tiene su fuente en el repo y las frases que la prueban', () => {
  for (const f of COMPARADOR) {
    assert.ok(existsSync(join(RAIZ, f.fuente.fichero)), `${f.tema}: ${f.fuente.fichero} no existe`);
    assert.ok(f.fuente.frases.length >= 2, `${f.tema}: una sola frase no prueba nada`);
    assert.deepEqual(frasesQueFaltan(f.fuente.fichero, f.fuente.frases), [], `${f.tema}: la fuente ya no dice lo que la fila afirma`);
  }
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
  assert.match(leer('components/landing/SeccionCambiarte.tsx'), /SE_LLEVA/);
  assert.equal(SE_LLEVA.length, 6);
  const faq = leer('app/soluciones/cambiar-de-software/page.tsx');
  assert.match(faq, /las tarjetas guardadas no se migran/i);
  assert.match(NO_SE_LLEVA.titulo, /tarjetas guardadas/i);
});

test('el ancla de la segunda ruta existe en la página de migración', () => {
  assert.match(leer('app/soluciones/cambiar-de-software/page.tsx'), /id=\{ANCLA_AYUDA\}/);
});

// ── Bento: chips con enlace ─────────────────────────────────────────────────

test('los chips del bento que enlazan llevan a una ruta que existe', () => {
  const bento = leer('components/landing/SeccionBento.tsx');
  const chips = [...bento.matchAll(/\['([^']+)',\s*'(\/[^']+)'\]/g)].map((m) => ({ texto: m[1], href: m[2] }));
  assert.ok(chips.length >= 10, `solo se leyeron ${chips.length} chips con enlace`);
  for (const c of chips) {
    assert.ok(rutaExiste(c.href), `${c.texto}: ${c.href} no existe`);
    assert.match(c.href, /^\/(funcionalidades|soluciones)\//, c.texto);
  }
});

// ── Botón por bloque ────────────────────────────────────────────────────────

test('el botón de cierre de bloque dice «Empezar gratis» y lleva al alta', () => {
  const fuente = leer('components/landing/BotonBloque.tsx');
  assert.deepEqual(botonesAlAlta(fuente), ['{CTA_ALTA}']);
  assert.deepEqual(botonesFueraDeRegla(fuente), []);
  assert.equal(CTA_ALTA, 'Empezar gratis');
});

const BLOQUES_CON_BOTON = [
  'SeccionSeisVerbos', 'SeccionReservas', 'SeccionCalendarioReservas', 'SeccionComparador',
  'SeccionBento', 'SeccionSustituciones', 'SeccionCambiarte',
];
for (const b of BLOQUES_CON_BOTON) {
  test(`${b}: cierra con el botón de bloque y no escribe otro botón al alta con otro texto`, () => {
    const fuente = leer(`components/landing/${b}.tsx`);
    assert.match(fuente, /<BotonBloque\b/);
    assert.deepEqual(botonesFueraDeRegla(fuente), []);
  });
}

test('el orden de la home: tarjetas tras «¿Te suena?», comparador antes del bento', () => {
  const l = leer('components/landing/LandingCliente.tsx');
  const pos = (s: string) => l.indexOf(s);
  assert.ok(pos('<SeccionTeSuena />') < pos('{verbos}') && pos('{verbos}') < pos('{frase}'));
  assert.ok(pos('<SeccionCalendarioReservas />') < pos('{comparador}') && pos('{comparador}') < pos('{bento}'));
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
