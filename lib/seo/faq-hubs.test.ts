import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAQ_FUNCIONALIDADES, FAQ_MAX, FAQ_MIN, FAQ_SOLUCIONES } from './faq-hubs.ts';
import { faqPageLd, type PreguntaFaq } from './faq-jsonld.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Preguntas frecuentes de /funcionalidades y de /soluciones (Ronda 1, 19-oct-2026).
//
// Fija tres cosas:
//  1. que el contenido cumple la regla de la casa (4–6 preguntas, respuesta que
//     empieza directa, nada de superlativos, testimonios ni funciones apagadas),
//  2. que el JSON-LD `FAQPage` dice EXACTAMENTE lo que ve la visitante (mismas
//     preguntas, mismas respuestas, mismo orden), y que la página usa un único
//     array para las dos cosas,
//  3. que los dos índices y las 22 páginas de detalle llevan el marcado, para que
//     un índice nuevo o una página nueva sin FAQ no pase sin que alguien lo vea.
// ─────────────────────────────────────────────────────────────────────────────

// Lo que NO puede aparecer en una pregunta o respuesta: promesas que el producto
// no respalda, superlativos sin dato, reseñas, y lo apagado/retirado/congelado.
const PROHIBIDAS: { patron: RegExp; motivo: string }[] = [
  { patron: /\bm[aá]s (elegid|popular|usad|recomendad|vendid|valorad)/i, motivo: 'superlativo sin dato' },
  { patron: /\bel [uú]nic[oa]\b/i, motivo: '«el único…» es una afirmación comparativa' },
  { patron: /\bn[º°]\.? ?1\b|\bn[uú]mero (1|uno)\b|\bl[ií]der\b/i, motivo: 'ranking no demostrable' },
  { patron: /testimonio|rese[ñn]a|opiniones de|casos? de [eé]xito|estrellas/i, motivo: 'testimonios y reseñas: no hay permiso todavía' },
  { patron: /classpass|wellhub|urban sports|\busc\b/i, motivo: 'plataformas externas apagadas o sin contrato' },
  { patron: /gmail/i, motivo: 'Gmail está retirado' },
  { patron: /tentare core/i, motivo: 'Tentare Core está retirado' },
  { patron: /kiosko|\bvod\b|chat de equipo/i, motivo: 'funciones congeladas (lib/frozen-features.ts)' },
  { patron: /\b7 d[ií]as\b|prueba de siete/i, motivo: 'ya no hay prueba de 7 días: se empieza gratis' },
  { patron: /garantiz|100 ?%|sin ning[uú]n (riesgo|problema)/i, motivo: 'promesa absoluta' },
];

/** Devuelve los problemas de un conjunto de preguntas; vacío = bien. */
export function problemasDeFaq(items: readonly PreguntaFaq[]): string[] {
  const fallos: string[] = [];
  if (items.length < FAQ_MIN || items.length > FAQ_MAX) fallos.push(`${items.length} preguntas (deben ser ${FAQ_MIN}–${FAQ_MAX})`);
  const vistas = new Set<string>();
  for (const { q, a } of items) {
    if (!q.startsWith('¿') || !q.endsWith('?')) fallos.push(`pregunta sin signos: «${q}»`);
    if (vistas.has(q)) fallos.push(`pregunta repetida: «${q}»`);
    vistas.add(q);
    if (a.trim().length < 80) fallos.push(`respuesta demasiado corta en «${q}»`);
    if (a.length > 700) fallos.push(`respuesta demasiado larga en «${q}» (${a.length})`);
    // Respuesta directa en las dos primeras frases: no puede abrir con un rodeo.
    if (/^(depende|es complicado|en general|como sabes)/i.test(a.trim())) fallos.push(`la respuesta de «${q}» no es directa`);
    if (a !== a.trim() || q !== q.trim()) fallos.push(`espacios sobrantes en «${q}»`);
    for (const { patron, motivo } of PROHIBIDAS) {
      if (patron.test(q) || patron.test(a)) fallos.push(`«${q}» contiene algo prohibido (${motivo})`);
    }
  }
  return fallos;
}

const HUBS = [
  { nombre: '/funcionalidades', items: FAQ_FUNCIONALIDADES, fuente: join('app', 'funcionalidades', 'page.tsx'), constante: 'FAQ_FUNCIONALIDADES' },
  { nombre: '/soluciones', items: FAQ_SOLUCIONES, fuente: join('app', 'soluciones', 'page.tsx'), constante: 'FAQ_SOLUCIONES' },
];

for (const hub of HUBS) {
  test(`${hub.nombre}: las preguntas cumplen la regla de la casa`, () => {
    assert.deepEqual(problemasDeFaq(hub.items), []);
  });

  test(`${hub.nombre}: el JSON-LD FAQPage dice lo mismo que ve la visitante`, () => {
    const ld = faqPageLd(hub.items);
    assert.equal(ld['@context'], 'https://schema.org');
    assert.equal(ld['@type'], 'FAQPage');
    assert.equal(ld.mainEntity.length, hub.items.length);
    ld.mainEntity.forEach((e, i) => {
      assert.equal(e['@type'], 'Question');
      assert.equal(e.name, hub.items[i].q);
      assert.equal(e.acceptedAnswer['@type'], 'Answer');
      assert.equal(e.acceptedAnswer.text, hub.items[i].a);
    });
    // Es JSON válido y sobrevive al escape que aplica el componente (`<` → <).
    const serializado = JSON.stringify(ld).replace(/</g, '\\u003c');
    assert.deepEqual(JSON.parse(serializado), ld);
  });
}

// ─── La página usa UN array para el marcado y para el texto ──────────────────

/** ¿Pasa la página el MISMO array al JSON-LD y a la lista que se ve? */
export function usaUnSoloArray(fuente: string, constante: string): boolean {
  const marcado = [...fuente.matchAll(/<FaqStructuredData items=\{(\w+)\}/g)].map((m) => m[1]);
  const visible = [...fuente.matchAll(/<ArticleFaq items=\{(\w+)\}/g)].map((m) => m[1]);
  return marcado.length === 1 && visible.length === 1 && marcado[0] === constante && visible[0] === constante;
}

for (const hub of HUBS) {
  test(`${hub.nombre}: la página pinta el marcado y el texto desde el mismo array`, () => {
    const fuente = readFileSync(join(process.cwd(), hub.fuente), 'utf8');
    assert.ok(usaUnSoloArray(fuente, hub.constante), `${hub.fuente} debe usar ${hub.constante} en <FaqStructuredData> y en <ArticleFaq>, una vez cada uno`);
    assert.match(fuente, new RegExp(`import \\{ ${hub.constante} \\} from '@/lib/seo/faq-hubs'`));
  });
}

// ─── Todas las páginas de los dos árboles llevan FAQPage ─────────────────────

function paginasDeDetalle(arbol: 'funcionalidades' | 'soluciones'): string[] {
  const base = join(process.cwd(), 'app', arbol);
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(base, d.name, 'page.tsx'));
}

/** ¿El fichero monta el marcado FAQPage (directamente o por los componentes que lo llevan)? */
export function llevaFaqPage(fuente: string): boolean {
  return /<FeatureFaq items=\{/.test(fuente) || /<FaqSolucion /.test(fuente) || /<FaqStructuredData items=\{/.test(fuente);
}

test('los dos índices y las 22 páginas de detalle llevan marcado FAQPage', () => {
  const detalle = [...paginasDeDetalle('funcionalidades'), ...paginasDeDetalle('soluciones')];
  // 17 funcionalidades y 5 soluciones (la quinta, «Abrir un estudio», desde la fase 2.3).
  assert.equal(detalle.length, 22);
  const sin = [...detalle, join(process.cwd(), 'app', 'funcionalidades', 'page.tsx'), join(process.cwd(), 'app', 'soluciones', 'page.tsx')]
    .filter((f) => !llevaFaqPage(readFileSync(f, 'utf8')));
  assert.deepEqual(sin, [], `Sin FAQPage: ${sin.join(', ')}`);
});

test('CONTROL: el validador y los detectores cazan lo que deben', () => {
  const buena: PreguntaFaq[] = Array.from({ length: 4 }, (_, i) => ({ q: `¿Pregunta de ejemplo ${'ABCD'[i]}?`, a: 'Sí. Es una respuesta directa y lo bastante larga para que cuente como una respuesta de verdad en la página.' }));
  assert.deepEqual(problemasDeFaq(buena), []);
  // Número de preguntas.
  assert.ok(problemasDeFaq(buena.slice(0, 3)).some((f) => f.includes('3 preguntas')));
  assert.ok(problemasDeFaq([...buena, ...buena.map((x) => ({ ...x, q: x.q + 'x?' })), ...buena].slice(0, 7)).some((f) => f.includes('7 preguntas')));
  // Pregunta repetida y sin signos.
  assert.ok(problemasDeFaq([...buena.slice(0, 3), buena[0]]).some((f) => f.includes('repetida')));
  assert.ok(problemasDeFaq([...buena.slice(0, 3), { q: 'Pregunta sin signos', a: buena[0].a }]).some((f) => f.includes('sin signos')));
  // Cada prohibida, una por una: si alguien relaja un patrón, esto falla.
  const trampas = [
    'Es el software más elegido por los estudios.',
    'Es el único programa que hace esto.',
    'Somos la opción Nº1 en Pilates.',
    'Como dice un testimonio de una alumna, funciona.',
    'Se integra con ClassPass y Wellhub.',
    'Importa tus contactos desde Gmail.',
    'Lo incluye Tentare Core para instructoras.',
    'Hay una pantalla de kiosko para fichar.',
    'Pruébalo 7 días sin compromiso.',
    'Garantizamos que no perderás ninguna reserva.',
  ];
  for (const trampa of trampas) {
    const mala = [...buena.slice(0, 3), { q: '¿Pregunta con trampa?', a: `Sí. ${trampa} Y aquí va más texto para que la longitud no sea el motivo del fallo.` }];
    assert.ok(problemasDeFaq(mala).some((f) => f.includes('prohibido')), `no se detectó: ${trampa}`);
  }
  // El marcado y el texto desde arrays distintos se detecta; desde el mismo, no.
  assert.equal(usaUnSoloArray('<FaqStructuredData items={A} /><ArticleFaq items={B} />', 'A'), false);
  assert.equal(usaUnSoloArray('<FaqStructuredData items={A} />', 'A'), false);
  assert.equal(usaUnSoloArray('<FaqStructuredData items={A} /><ArticleFaq items={A} />', 'A'), true);
  // Una página sin FAQ se detecta.
  assert.equal(llevaFaqPage('export default function P() { return <main /> }'), false);
  assert.equal(llevaFaqPage('<FeatureFaq items={FAQ} />'), true);
});
