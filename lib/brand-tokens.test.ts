import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ratioContraste } from './wcag-contrast.ts';

// Guarda del Brand System (brand/, fase 1). Tres cosas que un repaso visual no ve:
//   · que tokens.css no se aparte de design-tokens.json, que es su origen;
//   · que el puente legacy no pise lo que la fase 1 deja fuera a propósito
//     (la marca del estudio, los radios, las fuentes, el motion…);
//   · que una utilidad global de la marca no se cuele en la app de la alumna
//     por llevar el mismo nombre que una suya (pasó con `.t-label`).

const raiz = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

const json = JSON.parse(leer('brand/design-tokens.json'));
const tokensCss = leer('brand/tokens.css');
const temaCss = leer('brand/tailwind-theme.css');
const puenteCss = leer('brand/legacy-bridge.css');
const globalsCss = leer('app/globals.css');
const alumnaCss = leer('app/portal/[slug]/student.css');
const fuentesPanel = leer('app/_fuentes/fuentes-panel.ts');

/** Los .ts/.tsx/.css de esas carpetas (sin tests ni node_modules), con su ruta relativa. */
function ficherosDe(...dirs: string[]): string[] {
  const recorrer = (dir: string): string[] => readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : recorrer(ruta);
    return /\.(ts|tsx|css)$/.test(nombre) && !/\.test\.ts$/.test(nombre) ? [relative(raiz, ruta)] : [];
  });
  return dirs.flatMap(d => recorrer(join(raiz, d)));
}

const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Las declaraciones `--x: valor` del primer bloque cuyo selector es exactamente `selector`. */
function bloque(css: string, selector: string): Map<string, string> {
  const limpio = sinComentarios(css);
  const i = limpio.indexOf(`${selector} {`);
  assert.notEqual(i, -1, `no se encuentra el bloque «${selector}»`);
  const cuerpo = limpio.slice(limpio.indexOf('{', i) + 1, limpio.indexOf('}', i));
  return new Map([...cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

const ROOT = bloque(tokensCss, ':root');
const OSCURO = bloque(tokensCss, '.dark, [data-theme="dark"]');

/** Un valor de tokens.css con sus `var(--t-…)` resueltos contra `:root`. */
function resolver(valor: string, tabla = ROOT, vueltas = 0): string {
  assert.ok(vueltas < 10, `referencia circular resolviendo ${valor}`);
  const v = valor.match(/^var\((--t-[\w-]+)\)$/);
  if (!v) return valor;
  const destino = tabla.get(v[1]) ?? ROOT.get(v[1]);
  assert.ok(destino, `${v[1]} no está definido en tokens.css`);
  return resolver(destino, tabla, vueltas + 1);
}

/** Un `$value` del JSON con sus referencias `{color.core.x}` resueltas. */
function resolverJson(valor: string): string {
  const ref = valor.match(/^\{([\w.-]+)\}$/);
  if (!ref) return valor;
  const nodo = ref[1].split('.').reduce((o: Record<string, unknown>, k) => o[k] as Record<string, unknown>, json);
  return resolverJson((nodo as { $value: string }).$value);
}

const igual = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, '') === b.toLowerCase().replace(/\s+/g, '');

test('tokens.css: los colores core coinciden con design-tokens.json', () => {
  for (const [nombre, { $value }] of Object.entries(json.color.core as Record<string, { $value: string }>)) {
    const css = ROOT.get(`--t-${nombre}`);
    assert.ok(css, `falta --t-${nombre} en tokens.css`);
    assert.ok(igual(css, $value), `--t-${nombre} es ${css} y design-tokens.json dice ${$value}`);
  }
});

test('tokens.css: los semánticos en claro y la marca blanca coinciden con design-tokens.json', () => {
  const pares = [
    ...Object.entries(json.color.semantic.light as Record<string, { $value: string }>),
    ...Object.entries(json.color['brand-slot'] as Record<string, { $value: string }>),
  ];
  for (const [nombre, { $value }] of pares) {
    const css = ROOT.get(`--t-${nombre}`);
    assert.ok(css, `falta --t-${nombre} en tokens.css`);
    assert.ok(igual(resolver(css), resolverJson($value)), `--t-${nombre}: ${resolver(css)} ≠ ${resolverJson($value)}`);
  }
});

test('tokens.css: la base oscura incluye todo lo que fija design-tokens.json', () => {
  // El JSON (v1.0) llama «accent» a lo que tokens.css (v1.1) reparte en enlace y acento.
  const alias: Record<string, string> = { 'accent-blue': 'text-link', 'accent-magenta': 'text-accent' };
  for (const [nombre, { $value }] of Object.entries(json.color.semantic.dark as Record<string, { $value: string }>)) {
    if ($value === 'OPEN DECISION') continue;
    const css = OSCURO.get(`--t-${alias[nombre] ?? nombre}`);
    assert.ok(css, `falta --t-${alias[nombre] ?? nombre} en la base oscura de tokens.css`);
    assert.ok(igual(css, $value), `--t-${alias[nombre] ?? nombre} en oscuro: ${css} ≠ ${$value}`);
  }
});

test('tokens.css: espacio, radios y motion coinciden con design-tokens.json', () => {
  for (const [paso, valor] of Object.entries(json.space as Record<string, string>)) {
    assert.equal(ROOT.get(`--t-space-${paso}`), valor, `--t-space-${paso}`);
  }
  for (const [nombre, { $value }] of Object.entries(json.radius as Record<string, { $value: string }>)) {
    assert.equal(ROOT.get(`--t-radius-${nombre}`), $value, `--t-radius-${nombre}`);
  }
  for (const [nombre, valor] of Object.entries(json.motion.duration as Record<string, string>)) {
    assert.equal(ROOT.get(`--t-dur-${nombre}`), valor, `--t-dur-${nombre}`);
  }
  assert.ok(igual(ROOT.get('--t-ease-standard')!, json.motion.easing.standard));
});

test('radio de la card de producto: 24px, sin redefinir el rounded-3xl del repo', () => {
  assert.equal(resolver(ROOT.get('--t-radius-product-card')!), '24px');
  assert.match(temaCss, /--radius-t-card:\s*var\(--t-radius-product-card\)/);
  // rounded-3xl (38,4px) es LEGACY y se migra componente a componente en la fase 6:
  // ningún fichero de brand/ puede redefinirlo de golpe.
  for (const [fichero, css] of [['tokens.css', tokensCss], ['tailwind-theme.css', temaCss], ['legacy-bridge.css', puenteCss]]) {
    assert.doesNotMatch(sinComentarios(css), /(^|[^-\w])--radius(-[\w]+)?\s*:/m, `${fichero} redefine un --radius del repo`);
  }
});

test('globals.css importa la marca justo después de shadcn y en orden', () => {
  const imports = [...globalsCss.matchAll(/^@import\s+"([^"]+)";/gm)].map(m => m[1]);
  assert.deepEqual(imports.slice(0, 6), [
    'tailwindcss',
    'tw-animate-css',
    'shadcn/tailwind.css',
    '../brand/tokens.css',
    '../brand/tailwind-theme.css',
    '../brand/legacy-bridge.css',
  ]);
});

test('el puente legacy solo toca superficies, texto, bordes y estados', () => {
  // Fuera de la fase 1, a propósito: la marca blanca del estudio (PanelThemeProvider
  // escribe --brand* en línea), el portal, los radios, las fuentes, el motion,
  // la paleta categórica, la mascota y los estados en oscuro (OPEN DECISION).
  const PERMITIDOS = new Set([
    '--background', '--card', '--popover', '--muted', '--secondary', '--foreground',
    '--card-foreground', '--popover-foreground', '--secondary-foreground', '--muted-foreground',
    '--primary', '--primary-foreground', '--border', '--input', '--ring', '--sidebar', '--sidebar-foreground',
    '--destructive', '--success', '--warning', '--info',
  ]);
  const claro = bloque(puenteCss, ':root:root');
  const oscuro = bloque(puenteCss, '.dark.dark');
  for (const nombre of [...claro.keys(), ...oscuro.keys()]) {
    assert.ok(PERMITIDOS.has(nombre), `el puente legacy no debe tocar ${nombre} en la fase 1`);
  }
  for (const estado of ['--destructive', '--success', '--warning', '--info']) {
    assert.ok(!oscuro.has(estado), `${estado} en oscuro es OPEN DECISION: el puente no lo define`);
  }
});

test('el tema de Tailwind y el puente solo apuntan a tokens que existen', () => {
  const definidos = new Set([...ROOT.keys()]);
  for (const [fichero, css] of [['tailwind-theme.css', temaCss], ['legacy-bridge.css', puenteCss]]) {
    for (const [, ref] of sinComentarios(css).matchAll(/var\((--t-[\w-]+)\)/g)) {
      assert.ok(definidos.has(ref), `${fichero} usa ${ref}, que no está en tokens.css`);
    }
  }
});

test('ninguna clase usa una utilidad de lado que el espacio `t-` vuelve ambigua', () => {
  // `t-` es también el sufijo de LADO de Tailwind: `border-t-success` era «borde de
  // arriba en --success», y desde que existe --color-t-success Tailwind emite LAS
  // DOS lecturas (borde entero en --t-success-fg + borde de arriba en --success),
  // medido con @tailwindcss/node. Lo mismo valdría para `rounded-t-*`. Hoy nadie
  // las usa; el día que haga falta una, se escribe sin ambigüedad
  // (`border-t-[color:var(--success)]`) o se resuelve el espacio de nombres
  // (OPEN DECISION, brand/phase-1/README.md).
  const nombres = (css: string, re: RegExp) => new Set([...sinComentarios(css).matchAll(re)].map(m => m[1]));
  const ambiguas = [
    ...[...nombres(globalsCss, /--color-([\w-]+):/g)].filter(n => nombres(temaCss, /--color-t-([\w-]+):/g).has(n)).map(n => `border-t-${n}`),
    ...[...nombres(globalsCss, /--radius-([\w-]+):/g)].filter(n => nombres(temaCss, /--radius-t-([\w-]+):/g).has(n)).map(n => `rounded-t-${n}`),
  ];
  if (ambiguas.length === 0) return;
  const patron = new RegExp(`(?<![\\w-])(?:${ambiguas.join('|')})(?![\\w-])`);
  const usos = ficherosDe('app', 'components', 'lib').filter(f => patron.test(leer(f)));
  assert.deepEqual(usos, [], `clases ambiguas (${ambiguas.join(', ')}) en: ${usos.join(', ')}`);
});

test('una utilidad global de la marca no se cuela en la app de la alumna', () => {
  // La app de la alumna tiene sus propias `.t-*` (marca blanca, fase 16). Si la marca
  // define una con el mismo nombre, la regla de la alumna gana por especificidad,
  // pero SOLO en lo que declara: lo que no declare, se hereda de la global.
  const declaraciones = (cuerpo: string) => new Set([...cuerpo.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map(m => m[1]));
  const deMarca = new Map(
    [...sinComentarios(tokensCss).matchAll(/^\.(t-[\w-]+)\s*\{([^}]*)\}/gm)].map(m => [m[1], declaraciones(m[2])]),
  );
  for (const [, clase, cuerpo] of sinComentarios(alumnaCss).matchAll(/^\.student-app \.(t-[\w-]+)\s*\{([^}]*)\}/gm)) {
    const marca = deMarca.get(clase);
    if (!marca) continue;
    const propias = declaraciones(cuerpo);
    for (const propiedad of marca) {
      assert.ok(propias.has(propiedad), `.${clase} de la marca le colaría «${propiedad}» a .student-app .${clase}`);
    }
  }
});

// ── Fase 2: tipografía ────────────────────────────────────────────────────────

/** La primera familia de un token de fuente de tokens.css, sin comillas. */
const primeraFamilia = (token: string) => ROOT.get(token)!.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

test('fase 2: las fuentes del panel se sirven con el nombre que dicen los tokens', () => {
  // Si el `font-family` de fuentes-panel.ts no coincide con la primera familia de
  // `--t-font-sans`/`--t-font-mono`, el token apunta a una fuente que no existe y
  // el panel cae en silencio a la del sistema.
  const servidas = new Set([...fuentesPanel.matchAll(/prop: 'font-family', value: "'([^']+)'"/g)].map(m => m[1]));
  assert.deepEqual([...servidas].sort(), [primeraFamilia('--t-font-mono'), primeraFamilia('--t-font-sans')].sort());
});

test('fase 2: solo se cargan los pesos aprobados', () => {
  const escala = Object.values(json.font.scale as Record<string, { weight: number; family: string }>);
  const permitidos = {
    [primeraFamilia('--t-font-sans')]: new Set(Object.values(json.font.weight as Record<string, { $value: number }>).map(w => String(w.$value))),
    [primeraFamilia('--t-font-mono')]: new Set(escala.filter(e => e.family === 'mono').map(e => String(e.weight))),
  };
  for (const llamada of fuentesPanel.split('localFont({').slice(1)) {
    const familia = /prop: 'font-family', value: "'([^']+)'"/.exec(llamada)![1];
    for (const [, peso] of llamada.matchAll(/weight: '(\d+)'/g)) {
      assert.ok(permitidos[familia].has(peso), `${familia} carga el peso ${peso}, fuera de los de la marca`);
    }
  }
});

test('fase 2: la tipografía de la marca solo vive en el panel', () => {
  // La app de la alumna, /reservar, la landing y /ayuda siguen con la suya hasta
  // su fase: ni cargan estas fuentes ni llevan el ámbito que las aplica.
  const sinComentariosTs = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
  const conAmbito = ficherosDe('app', 'components', 'lib').filter(f => f.endsWith('.tsx') && /\bmarca-panel\b/.test(sinComentariosTs(leer(f))));
  // El layout la pone en el envoltorio y `MarcaEnPortales` en `body` mientras
  // el panel está montado (los diálogos y tooltips de base-ui van a `body`).
  assert.deepEqual(conAmbito.sort(), ['app/(dashboard)/layout.tsx', 'components/layout/marca-en-portales.tsx']);
  const cargan = ficherosDe('app', 'components', 'lib').filter(f => /_fuentes\/fuentes-panel['"]/.test(leer(f)));
  assert.deepEqual(cargan, ['app/(dashboard)/layout.tsx']);
  const ambito = bloque(globalsCss, '.marca-panel');
  assert.equal(ambito.get('--fuente-sans'), 'var(--t-font-sans)');
  assert.equal(ambito.get('--fuente-mono'), 'var(--t-font-mono)');
  for (const utilidad of ['--font-sans', '--font-heading']) {
    assert.match(globalsCss, new RegExp(`${utilidad}: var\\(--fuente-sans\\);`), `${utilidad} debe leer --fuente-sans`);
  }
  assert.match(globalsCss, /--font-mono: var\(--fuente-mono\);/);
});

// ── Trinquete: el panel no suma colores retirados ─────────────────────────────

test('el panel no suma colores retirados (solo pueden bajar)', () => {
  // Los neutros del producto anterior y la familia oliva (brand-os.md §5:
  // «Retirado: oliva, salvia y arena») escritos a mano. Los que ya había se
  // migran en su fase; lo que NO puede pasar es que el panel gane uno nuevo:
  // se usa el token (`bg-background`, `text-foreground`, `bg-brand`…).
  // Fuera a propósito: la web comercial y la app de la alumna (su fase) y
  // `components/marca/` (logo y mascota, con su propio sistema de color).
  // Si un fichero baja, puedes bajar su número aquí; subirlo exige un motivo.
  const TOPE: Record<string, number> = {
    'app/(dashboard)/sustituciones/page.tsx': 5,
    'app/(dashboard)/contenido/metricas/page.tsx': 2,
    'components/configuracion/tab-plantillas-email.tsx': 2,
    'components/layout/sidebar.tsx': 2,
    'app/(dashboard)/citas/page.tsx': 1,
    'app/(dashboard)/cierre/page.tsx': 1,
    'components/calendario/vista-horario.tsx': 1,
    'components/configuracion/dialogo-qr.tsx': 1,
    'components/configuracion/estilos.tsx': 1,
    'components/layout/sede-activa.tsx': 1,
    'components/socios/valoracion-inicial-ficha.tsx': 1,
    'components/studio-slug-gate.tsx': 1,
    'components/ui/page-header.tsx': 1,
  };
  const FUERA = /^components\/(landing|funcionalidades|comparativa|recursos|soluciones|ayuda|student|reserva|widgets|checkout-widget|cuenta-widget|network|network-publico|network-v2|auth|onboarding|marca)\//;
  const RETIRADOS = /#(EEEEE8|1A1A1A|0F0F0F|131313|F5F5F1|F3F3EF|343825|D9C29E|5A6142|55622C|8A9165|A8B37A|22251A|F1F2EA)\b/gi;
  const suben: string[] = [];
  for (const f of ficherosDe('app/(dashboard)', 'components')) {
    if (!/\.(ts|tsx)$/.test(f) || FUERA.test(f)) continue;
    const n = leer(f).match(RETIRADOS)?.length ?? 0;
    if (n > (TOPE[f] ?? 0)) suben.push(`${f}: ${n} (tope ${TOPE[f] ?? 0})`);
  }
  assert.deepEqual(suben, [], `colores retirados nuevos en el panel; usa el token en su lugar:\n${suben.join('\n')}`);
});

test('glass: el prefijo -webkit- va ANTES que backdrop-filter', () => {
  // LightningCSS (el que usa Next) junta las dos declaraciones cuando valen lo
  // mismo y se queda solo con la ÚLTIMA. Con `-webkit-` al final, el CSS servido
  // no lleva `backdrop-filter`: Chrome y Firefox no desenfocan nada (medido en
  // el navegador, 5-oct-2026). Solo Safari lo hacía.
  for (const [, clase, cuerpo] of sinComentarios(tokensCss).matchAll(/^\.(t-[\w-]+)\s*\{([^}]*)\}/gm)) {
    const sin = cuerpo.search(/(^|[;\s])backdrop-filter\s*:/);
    const con = cuerpo.indexOf('-webkit-backdrop-filter');
    if (sin === -1 && con === -1) continue;
    assert.ok(con !== -1 && sin !== -1 && con < sin, `.${clase}: -webkit-backdrop-filter tiene que ir antes que backdrop-filter`);
  }
});

test('fase 4/5: el brand slot por defecto del panel sale de los tokens y se lee', () => {
  const ambito = bloque(globalsCss, '.marca-panel');
  assert.equal(ambito.get('--brand'), 'var(--t-brand)');
  assert.equal(ambito.get('--brand-foreground'), 'var(--t-brand-foreground)');
  const hex = (v: string) => resolver(v);
  // Texto sobre el relleno de marca, y la marca a tamaño pequeño sobre lienzo y tarjeta.
  assert.ok(ratioContraste(hex('var(--t-brand-foreground)'), hex('var(--t-brand)'))! >= 4.5);
  for (const fondo of ['var(--t-surface-canvas)', 'var(--t-surface-raised)']) {
    assert.ok(ratioContraste(hex(ambito.get('--brand-medio')!), hex(fondo))! >= 4.5, `--brand-medio sobre ${fondo}`);
  }
  // `:root` NO cambia: la landing, /login y el alta siguen con el oliva hasta su fase.
  assert.match(globalsCss, /\n\s*--brand:\s*#343825;/);
});

test('fase 4/5: en el panel no hay texto en el color de marca crudo', () => {
  // `text-brand` pinta el texto con el relleno de la marca: con la de fábrica
  // (Sand) o con una marca clara de un estudio no llega a 4,5:1. Para texto,
  // iconos o un indicador pequeño: `text-brand-medio` / `bg-brand-medio`, que
  // `PanelThemeProvider` calcula legible para cada estudio.
  const FUERA = /^components\/(landing|funcionalidades|comparativa|recursos|soluciones|ayuda|student|reserva|widgets|checkout-widget|cuenta-widget|network|network-publico|network-v2|auth|onboarding|marca)\//;
  const crudo = /(?<![\w-])text-brand(?![\w\/-])/;
  const usos = ficherosDe('app/(dashboard)', 'components')
    .filter(f => /\.tsx$/.test(f) && !FUERA.test(f) && !f.includes('.frozen.'))
    .filter(f => leer(f).split('\n').some(l => !/^\s*(\/\/|\*|\{\/\*)/.test(l) && crudo.test(l)));
  assert.deepEqual(usos, [], `text-brand crudo en: ${usos.join(', ')}`);
});
