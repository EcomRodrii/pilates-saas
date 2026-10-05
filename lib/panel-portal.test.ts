// ─────────────────────────────────────────────────────────────────────────────
// Modo oscuro: nada del panel puede portalearse a `document.body`.
//
// `PanelThemeProvider` pone `.dark` en un <div>, nunca en <html> (a propósito:
// la app de socias vive en la misma aplicación y no debe teñirse). Un
// `createPortal(…, document.body)` sale de ese div y sus tokens vuelven a los
// CLAROS — hoja blanca sobre panel oscuro, y el texto pensado para fondo oscuro
// se queda blanco sobre blanco. Es el «no se ven ni letras ni números».
//
// Estructural porque el fallo es INVISIBLE en modo claro: quien añada mañana
// una hoja nueva copiando el patrón de al lado no vería nada raro.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');

// Fuera del panel no hay `.dark` que respetar y `document.body` es correcto.
// `components/reservar` es la marca blanca de /reservar (la cabecera portalea su
// menú a <body> con razón). Va escrita aquí y no colada: antes se salvaba solo
// porque 'components/reserva' casaba por PREFIJO con 'components/reservar', y
// quien dejara la lista en carpetas exactas habría puesto la guardia en rojo
// con un falso positivo.
const FUERA_DEL_PANEL = ['components/student', 'components/portal', 'components/network',
  'components/network-v2', 'components/network-publico', 'components/reserva', 'components/reservar',
  'components/landing'];

// Por SEGMENTO de carpeta, no por prefijo de texto: 'components/reserva' no
// puede excluir de rebote a 'components/reservas-panel' ni a nada que empiece igual.
const fueraDelPanel = (rel: string) => FUERA_DEL_PANEL.some(f => rel === f || rel.startsWith(`${f}/`));

// Sin comentarios: el que explica por qué un componente YA NO portalea a
// <body> nombra `document.body`, y esa explicación no puede hacer fallar a la
// guardia. Se quitan también los bloques `{/* … */}` de JSX.
const leerCodigo = (rel: string) =>
  readFileSync(join(raiz, rel), 'utf8')
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');

// ⚠️ Multilínea y sin cortarse en el primer `)`. La de antes,
// `/createPortal\s*\([^)]*document\.body/`, se paraba en el primer paréntesis que
// cerrara DENTRO del JSX (un `onClick={() => …}`, un `style={{ … }}`), así que
// un portal largo —justo los de pantalla completa— no lo veía nunca: así se
// coló la pantalla de «Tu estudio ya puede recibir reservas».
const PORTAL_A_BODY = /createPortal\s*\([\s\S]*?,\s*document\.body\s*,?\s*\)/;

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${e}`;
    if (fueraDelPanel(rel)) continue;
    const st = statSync(join(raiz, rel));
    if (st.isDirectory()) tsx(rel, acc);
    else if (e.endsWith('.tsx')) acc.push(rel);
  }
  return acc;
}

test('ningún componente del panel portalea a document.body', () => {
  const culpables = tsx('components').filter(f => PORTAL_A_BODY.test(leerCodigo(f)));
  assert.deepEqual(culpables, [],
    'Portalear a document.body saca el contenido de `.dark`: usa `anfitrionPortal()` de lib/panel-portal.ts.');
});

test('la guardia ve un portal largo a <body>, y el mismo con el anfitrión no', () => {
  // La forma exacta que se le escapaba a la regex de antes: JSX con paréntesis
  // por medio entre `createPortal(` y `document.body`.
  const largo = `createPortal(\n  <div onClick={() => cerrar()} style={{ width: calc(1) }}>\n    <p>{f(x)}</p>\n  </div>,\n  document.body,\n)`;
  assert.match(largo, PORTAL_A_BODY);
  assert.doesNotMatch(largo.replace('document.body', 'anfitrionPortal()'), PORTAL_A_BODY);
});

test('lo de fuera del panel se excluye por carpeta, no por cómo empieza el nombre', () => {
  assert.ok(fueraDelPanel('components/reservar/cabecera-reservar.tsx'));
  assert.ok(fueraDelPanel('components/reserva'));
  assert.ok(!fueraDelPanel('components/reservas-panel/hoja.tsx'),
    'Un prefijo de texto excluiría carpetas del panel que solo se llaman parecido.');
});

test('el anfitrión cuelga del contenedor que lleva la clase del tema', () => {
  const src = readFileSync(join(raiz, 'lib/panel-theme.tsx'), 'utf8');
  const div = src.slice(src.indexOf('<div ref={ref}'));
  assert.match(div, /id=\{ID_ANFITRION_PANEL\}/,
    'Si el anfitrión no está DENTRO de este div, no hereda `.dark` y no arregla nada.');
  // Y hermano de `children`, no dentro: si quedara dentro de lo que
  // `.panel-page-in` transforma, `position: fixed` volvería a medirse contra la
  // caja animada — que es justo por lo que se portalea.
  assert.ok(div.indexOf('{children}') < div.indexOf('ID_ANFITRION_PANEL'));
});

test('fuera del panel se sigue usando document.body', () => {
  const src = readFileSync(join(raiz, 'lib/panel-portal.ts'), 'utf8');
  assert.match(src, /\?\?\s*document\.body/,
    'Estos componentes también se usan en la app de la alumna, donde no hay anfitrión: sin respaldo, dejarían de montarse.');
});
