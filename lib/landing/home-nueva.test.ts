import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// La home nueva (fase 2.2, 19-oct-2026): lo que se puede comprobar sin navegador.
//
//  · Las pestañas por resultado (forma de Momence) son cinco, con sus nombres, y
//    cada una lleva a SU página de función, que existe (Momence no enlaza ninguna).
//  · Ninguna frase de la home promete lo que el producto no hace hoy (§5 de la
//    auditoría de la fase 1): ni SMS, ni plataformas externas, ni app en tiendas,
//    ni envío a Hacienda, ni lo congelado… ni la prueba de 7 días que ya no existe.
//  · Sin emojis ni degradados: el lenguaje de las referencias, no su ruido.
//
// Cada comprobación lleva su CONTROL (lo que cambia al otro lado).
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = process.cwd();
const DIR = join(RAIZ, 'components', 'web', 'home');
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8');
const FICHEROS = readdirSync(DIR).filter((f) => /\.(tsx|css)$/.test(f));

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

/** Lo que §5 de la auditoría marca como «NO prometer», más lo ya retirado. */
export const PROMESA_PROHIBIDA = /\bSMS\b|ClassPass|Wellhub|Urban Sports|App Store|Google Play|Android|Apple Wallet|Hacienda|\bAEAT\b|QR de cotejo|dat[áa]fono|tarjeta regalo|kiosko|v[íi]deo bajo demanda|desde una foto|€ por plaza|7 d[íi]as|prueba gratuita|cubre las bajas sol[ao]|campañas de marketing|newsletter/i;

/** Texto visible de un .tsx: lo que va entre etiquetas y en cadenas de comillas simples (los datos). */
function textos(fuente: string): string {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const entreEtiquetas = [...sinComentarios.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  const cadenas = [...sinComentarios.matchAll(/'([^'\n]{12,})'/g)].map((m) => m[1]);
  return [...entreEtiquetas, ...cadenas].join('\n');
}

test('las pestañas: cinco, con sus nombres, cada una a su página de función que existe', () => {
  const fuente = leer('PestanasProducto.tsx');
  const etiquetas = [...fuente.matchAll(/etiqueta: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(etiquetas, ['Reservas', 'Cobros', 'Alumnas', 'Equipo', 'Informes']);
  const destinos = [...fuente.matchAll(/enlace: \{ href: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(destinos.length, 5);
  assert.equal(new Set(destinos).size, 5, 'dos pestañas llevan al mismo sitio');
  for (const d of destinos) {
    assert.match(d, /^\/funcionalidades\/[a-z-]+$/);
    assert.ok(EXISTENTES.has(d), `${d} no existe en app/`);
  }
  // Tres puntos por pestaña, ni más ni menos (lo fija también el tipo).
  assert.equal([...fuente.matchAll(/puntos: \[/g)].length, 5);
});

test('las pestañas son accesibles: tablist, tab y tabpanel, con teclado', () => {
  const cliente = leer('PestanasCliente.tsx');
  for (const x of ['role="tablist"', 'role="tab"', 'role="tabpanel"', 'aria-selected', 'aria-controls', 'aria-labelledby', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.ok(cliente.includes(x), `falta ${x}`);
  }
});

test('ninguna frase de la home promete lo que el producto no hace hoy', () => {
  const problemas: string[] = [];
  for (const f of FICHEROS.filter((x) => x.endsWith('.tsx'))) {
    const t = textos(leer(f));
    const m = t.match(PROMESA_PROHIBIDA);
    if (m) problemas.push(`${f}: «${m[0]}»`);
  }
  assert.deepEqual(problemas, []);
});

test('sin emojis en la home, y ningún degradado entre colores (el azul-magenta, solo en el logo)', () => {
  // Emoji = lo que se pinta como emoji por defecto (Emoji_Presentation): ni «→» ni «★» lo son.
  const EMOJI = /\p{Emoji_Presentation}/u;
  assert.match('Hola 👋', EMOJI); // CONTROL
  assert.doesNotMatch('Ver más → ★', EMOJI);
  for (const f of FICHEROS) {
    const fuente = leer(f);
    assert.doesNotMatch(fuente, EMOJI, `${f} lleva un emoji`);
    // La única transición permitida es la capa de legibilidad del héroe: UN solo color
    // (la tinta) que cambia de opacidad. Nada de degradados entre colores.
    for (const g of fuente.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(linear|radial|conic)-gradient\(([^;]*)\)/g)) {
      const colores = new Set([...g[2].matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map((c) => `${c[1]},${c[2]},${c[3]}`));
      assert.ok(!/#[0-9a-f]{3,8}\b|var\(/i.test(g[2]), `${f}: un degradado solo con rgba() de un color`);
      assert.equal(colores.size, 1, `${f} lleva un degradado entre colores: ${g[0].slice(0, 80)}`);
    }
  }
});

test('el h1 del héroe empieza por texto y dice la categoría con Pilates y yoga', () => {
  const heroe = leer('Heroe.tsx');
  assert.match(heroe, /<h1 className="[^"]+">Software de gestión para estudios de Pilates y yoga/);
});

test('CONTROL: el detector de promesas caza lo que debe y deja pasar lo verdadero', () => {
  assert.match('Recordatorios por SMS', PROMESA_PROHIBIDA);
  assert.match('Integración con ClassPass', PROMESA_PROHIBIDA);
  assert.match('Tu app en Google Play', PROMESA_PROHIBIDA);
  assert.match('Prueba de 7 días', PROMESA_PROHIBIDA);
  assert.doesNotMatch('Cuotas y bonos con la tarjeta guardada o por SEPA.', PROMESA_PROHIBIDA);
  assert.match(textos("<p>Avisos por SMS</p>"), PROMESA_PROHIBIDA);
  assert.doesNotMatch(textos("// SMS no existe\n<p>Avisos</p>"), PROMESA_PROHIBIDA);
});
