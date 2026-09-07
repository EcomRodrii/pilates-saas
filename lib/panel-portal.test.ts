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
const FUERA_DEL_PANEL = ['components/student', 'components/portal', 'components/network',
  'components/network-v2', 'components/network-publico', 'components/reserva', 'components/landing'];

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${e}`;
    if (FUERA_DEL_PANEL.some(f => rel.startsWith(f))) continue;
    const st = statSync(join(raiz, rel));
    if (st.isDirectory()) tsx(rel, acc);
    else if (e.endsWith('.tsx')) acc.push(rel);
  }
  return acc;
}

test('ningún componente del panel portalea a document.body', () => {
  const culpables = tsx('components')
    .filter(f => /createPortal\s*\([^)]*document\.body/s.test(readFileSync(join(raiz, f), 'utf8')));
  assert.deepEqual(culpables, [],
    'Portalear a document.body saca el contenido de `.dark`: usa `anfitrionPortal()` de lib/panel-portal.ts.');
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
