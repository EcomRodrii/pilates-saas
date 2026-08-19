import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ratioContraste, hexARgb } from './wcag-contrast.ts';

// Guarda del color del PANEL, en dos mitades:
//   · la paleta CATEGÓRICA (--cat-1..9), que distingue cosas — /automatizaciones;
//   · el mapa SEMÁNTICO de actividad del dashboard, que agrupa a propósito.
// Cubre lo que un repaso visual no ve: contraste en los DOS modos, tonos que no
// se repiten donde no deben, y hex sueltos que vuelven.
//
// Lee el CSS de verdad en vez de duplicar los valores aquí: si alguien retoca
// un token, este test mide el token nuevo, no una copia que se quedó vieja.

const raiz = join(import.meta.dirname, '..');
const css = readFileSync(join(raiz, 'app/globals.css'), 'utf8');
const paginaAutomatizaciones = readFileSync(join(raiz, 'app/(dashboard)/automatizaciones/page.tsx'), 'utf8');
const paginaDashboard = readFileSync(join(raiz, 'app/(dashboard)/dashboard/page.tsx'), 'utf8');

const TONOS = 9;

/** Todos los tokens hex de un bloque. `.dark` solo redefine algunos: hereda el resto. */
function tokens(selector: ':root' | '.dark'): Record<string, string> {
  const i = css.indexOf(`\n${selector} {`);
  assert.notEqual(i, -1, `no se encuentra el bloque ${selector} en globals.css`);
  const cuerpo = css.slice(i, css.indexOf('\n}', i));
  const pares = [...cuerpo.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]] as const);
  return Object.fromEntries(pares);
}
const TOKENS = { ':root': tokens(':root'), '.dark': { ...tokens(':root'), ...tokens('.dark') } };

const mezclar = (a: string, b: string, p: number) => {
  const x = hexARgb(a)!, y = hexARgb(b)!;
  return '#' + (['r', 'g', 'b'] as const)
    .map(c => Math.round(x[c] * p + y[c] * (1 - p)).toString(16).padStart(2, '0')).join('');
};

/** Resuelve `#hex`, `var(--tok)` o `color-mix(in srgb, var(--a) N%, var(--b))`. */
function resolver(expr: string, T: Record<string, string>): string | null {
  const e = expr.trim().replace(/^'|'$/g, '');
  if (e.startsWith('#')) return e;
  const v = e.match(/^var\(--([\w-]+)\)$/);
  if (v) return T[v[1]] ?? null;
  const m = e.match(/^color-mix\(in srgb,\s*var\(--([\w-]+)\)\s*(\d+)%,\s*var\(--([\w-]+)\)\)$/);
  if (m && T[m[1]] && T[m[3]]) return mezclar(T[m[1]], T[m[3]], Number(m[2]) / 100);
  return null;
}

/** Extrae los `--cat-N` y el `--card` del bloque `:root` o `.dark`. */
function bloque(selector: ':root' | '.dark') {
  const leer = (nombre: string) => TOKENS[selector][nombre] ?? null;
  const card = leer('card');
  assert.ok(card, `${selector} no define --card`);
  const cats = Array.from({ length: TONOS }, (_, n) => {
    const hex = leer(`cat-${n + 1}`);
    assert.ok(hex, `${selector} no define --cat-${n + 1}`);
    return hex;
  });
  return { card, cats };
}

for (const [modo, selector] of [['claro', ':root'], ['oscuro', '.dark']] as const) {
  test(`paleta categórica (${modo}): cada tono cumple AA sobre --card`, () => {
    const { card, cats } = bloque(selector);
    cats.forEach((hex, i) => {
      const r = ratioContraste(hex, card);
      assert.ok(r !== null && r >= 4.5, `--cat-${i + 1} (${hex}) da ${r?.toFixed(2)}:1 sobre ${card}, AA pide 4.5`);
    });
  });

  test(`paleta categórica (${modo}): legible también sobre su propio tinte`, () => {
    // El icono no se pinta sobre la tarjeta limpia sino sobre su propio color
    // diluido (color-mix al 12-14%). Ese es el fondo real, y contrasta menos.
    const { card, cats } = bloque(selector);
    cats.forEach((hex, i) => {
      const a = hexARgb(hex)!;
      const b = hexARgb(card)!;
      const mezcla = '#' + (['r', 'g', 'b'] as const)
        .map(c => Math.round(a[c] * 0.14 + b[c] * 0.86).toString(16).padStart(2, '0')).join('');
      const r = ratioContraste(hex, mezcla);
      assert.ok(r !== null && r >= 4.5, `--cat-${i + 1} sobre su tinte da ${r?.toFixed(2)}:1, AA pide 4.5`);
    });
  });

  test(`paleta categórica (${modo}): ningún par de tonos se confunde`, () => {
    const { cats } = bloque(selector);
    // Distancia euclídea en RGB — basta para cazar la colisión que hubo:
    // #35785A y #2F6B4F (dos verdes a 3° de tono) quedan en ~15.
    const distancia = (x: string, y: string) => {
      const a = hexARgb(x)!, b = hexARgb(y)!;
      return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    };
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const d = distancia(cats[i], cats[j]);
        assert.ok(d >= 40, `--cat-${i + 1} (${cats[i]}) y --cat-${j + 1} (${cats[j]}) están a ${d.toFixed(0)}: se confunden`);
      }
    }
  });
}

test('las nueve acciones usan nueve tonos distintos, sin hex sueltos', () => {
  const mapa = paginaAutomatizaciones.slice(
    paginaAutomatizaciones.indexOf('const accionConfig'),
    paginaAutomatizaciones.indexOf('const tinte'),
  );
  const usados = Array.from(mapa.matchAll(/color: 'var\(--cat-(\d)\)'/g)).map(m => m[1]);
  assert.equal(usados.length, TONOS, 'alguna acción no usa un tono de la paleta categórica');
  assert.equal(new Set(usados).size, TONOS, `dos acciones comparten tono: ${usados.join(', ')}`);
  assert.equal(mapa.match(/#[0-9A-Fa-f]{6}/g), null, 'accionConfig ha vuelto a llevar un hex suelto');
});

test('no vuelven el magenta ni el rosa del morado anterior', () => {
  // #DB2777 y #F7A6C4 pintaban dos acciones; #35785A era el verde que chocaba
  // con --success. Mismo tipo de guarda que la de /suscripcion.
  for (const hex of ['#DB2777', '#F7A6C4', '#35785A', '#0891B2']) {
    assert.ok(
      !paginaAutomatizaciones.toUpperCase().includes(hex.toUpperCase()),
      `${hex} ha vuelto a app/(dashboard)/automatizaciones/page.tsx`,
    );
  }
});


// ─── Mapa SEMÁNTICO de actividad del dashboard ───────────────────────────────
// Otro problema que el mismo mapa: aquí los colores se REPITEN a propósito
// (23 tipos → seis lecturas), así que lo que hay que garantizar no es que sean
// distintos sino que todos se lean, en los dos modos. La etiqueta es texto de
// 10px en negrita: AA pide 4.5:1, no el 3:1 de los elementos gráficos.

const MAPA_ACTIVIDAD = paginaDashboard.slice(
  paginaDashboard.indexOf('const actividadConfig'),
  paginaDashboard.indexOf('// ─── Sparkline'),
);

const FILAS_ACTIVIDAD = [...MAPA_ACTIVIDAD.matchAll(
  /^\s*(\w+):\s*\{ color: (.+?), bg: (.+?), label: '(.+?)' \}/gm,
)];

test('el mapa de actividad tiene todas sus filas legibles', () => {
  // Si el regex deja de casar, el resto de asserts pasarían en vacío: eso ya
  // pasó al escribirlo (las comillas se colaban en la captura) y el informe
  // salió "todo correcto" sin haber medido nada.
  assert.ok(FILAS_ACTIVIDAD.length >= 20, `solo ${FILAS_ACTIVIDAD.length} filas: el regex ya no casa`);
});

for (const [modo, selector] of [['claro', ':root'], ['oscuro', '.dark']] as const) {
  test(`mapa de actividad (${modo}): cada etiqueta cumple AA sobre su fondo`, () => {
    const T = TOKENS[selector];
    for (const [, tipo, colorExpr, bgExpr] of FILAS_ACTIVIDAD) {
      const color = resolver(colorExpr, T);
      const bg = resolver(bgExpr, T);
      assert.ok(color, `${tipo}: no sé resolver el color ${colorExpr}`);
      assert.ok(bg, `${tipo}: no sé resolver el fondo ${bgExpr}`);
      const r = ratioContraste(color, bg);
      assert.ok(r !== null && r >= 4.5, `${tipo}: ${color} sobre ${bg} da ${r?.toFixed(2)}:1, AA pide 4.5`);
    }
  });
}

test('el mapa de actividad no lleva hex sueltos', () => {
  // #0891B2 sobre #ECFEFF daba 3.54:1 y, sin variante oscura, dejaba cuatro
  // chips casi blancos sobre la tarjeta negra.
  assert.equal(MAPA_ACTIVIDAD.match(/#[0-9A-Fa-f]{6}/g), null, 'ha vuelto un hex suelto a actividadConfig');
});


// ─── Grises de texto sobre las superficies del panel ─────────────────────────
// --muted-foreground no era un caso puntual: con ~2.100 usos de
// text-muted-foreground, fallaba AA sobre TODAS las superficies claras a la vez.
// Eso lo convierte en un problema del token, no de los sitios que lo llaman, y
// por eso se arregla en un valor y no con un barrido de 207 ficheros.

const SUPERFICIES = ['card', 'background', 'muted', 'secondary', 'accent'] as const;

for (const [modo, selector] of [['claro', ':root'], ['oscuro', '.dark']] as const) {
  test(`--muted-foreground (${modo}): legible sobre todas las superficies`, () => {
    const T = TOKENS[selector];
    const tinta = T['muted-foreground'];
    assert.ok(tinta, `${selector} no define --muted-foreground`);
    for (const sup of SUPERFICIES) {
      const fondo = T[sup];
      assert.ok(fondo, `${selector} no define --${sup}`);
      const r = ratioContraste(tinta, fondo);
      assert.ok(r !== null && r >= 4.5, `--muted-foreground (${tinta}) sobre --${sup} (${fondo}) da ${r?.toFixed(2)}:1, AA pide 4.5`);
    }
  });

  test(`--muted-foreground (${modo}): sigue siendo un gris apagado, no tinta`, () => {
    // Si acaba pegado a --foreground deja de distinguir texto secundario de
    // principal, que es justo para lo que existe.
    const T = TOKENS[selector];
    const r = ratioContraste(T['muted-foreground'], T['foreground']);
    assert.ok(r !== null && r >= 2, `--muted-foreground ya no se distingue de --foreground (${r?.toFixed(2)}:1)`);
  });
}
