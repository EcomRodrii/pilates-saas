// ─────────────────────────────────────────────────────────────────────────────
// Apariencia en mantenimiento + personalización del panel.
//
// Estructurales a propósito: lo que hay que impedir no es un cálculo mal hecho,
// es que alguien reabra media puerta (deja el enlace al editor, o el editor
// accesible por URL) o que las dos posiciones del menú dejen de coincidir entre
// el CHECK de la BD y el tipo de TypeScript.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

/**
 * El fichero SIN comentarios.
 *
 * ⚠️ Hace falta de verdad: estas pantallas explican en sus comentarios cómo
 * REABRIR el editor, y esa nota cita literalmente la ruta y el componente que
 * los tests de aquí prohíben. Sin quitar los comentarios, la documentación
 * buena hace fallar al guardia — que es exactamente el fallo que tuvo que
 * arreglarse ya una vez en `errores-rpc.test.ts`.
 */
const leerCodigo = (p: string) =>
  leer(p).split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

const APARIENCIA = 'app/(dashboard)/configuracion/apariencia/page.tsx';
const EDITOR = 'app/(dashboard)/configuracion/apariencia/editor/page.tsx';
const PANEL = 'app/(dashboard)/configuracion/apariencia/panel/page.tsx';

// ── El mantenimiento, cerrado por las DOS puertas ────────────────────────────
test('la pantalla de Apariencia dice que está en mantenimiento', () => {
  const src = leer(APARIENCIA);
  assert.match(src, /mantenimiento/i);
  // Y dice lo que NO se rompe: lo publicado sigue en pie. Sin eso, «en
  // mantenimiento» se lee como «mis clientas no ven mi marca».
  assert.match(src, /sigue\s*\n?\s*funcionando igual|sigue funcionando igual/);
});

test('Apariencia ya no lleva al editor de marca', () => {
  const src = leerCodigo(APARIENCIA);
  assert.ok(!src.includes('/configuracion/apariencia/editor'),
    'Si sigue el enlace, el mantenimiento es solo un cartel.');
});

test('el editor tampoco se abre escribiendo la URL', () => {
  const src = leerCodigo(EDITOR);
  assert.match(src, /redirect\('\/configuracion\/apariencia'\)/,
    'Quien lo tenga en marcadores entraría igual.');
  assert.ok(!src.includes('<ThemeEditorFullscreen'),
    'La ruta no puede seguir montando el editor.');
});

test('los e2e del editor se saltan, no se borran', () => {
  // Son lo que demuestra que el editor funciona. Borrarlas mientras está
  // cerrado significaría reabrirlo a ciegas el día que toque.
  // `.spec.ts` y no `apariencia-*` a secas: al lado vive `apariencia-mock.ts`,
  // que es andamiaje compartido y no tiene ningún test que saltar.
  const specs = readdirSync(join(raiz, 'e2e'))
    .filter(f => f.startsWith('apariencia-') && f.endsWith('.spec.ts'));
  assert.ok(specs.length >= 5, `esperaba las suites de apariencia, encontré ${specs.length}`);
  for (const f of specs) {
    const src = readFileSync(join(raiz, 'e2e', f), 'utf8');
    assert.ok(!/^test\.describe\(/m.test(src),
      `${f} entra por la ruta cerrada: tiene que ir con .skip mientras dure el mantenimiento.`);
    assert.match(src, /PARA REACTIVARLA/,
      `${f} se salta sin decir cómo devolverlo: así es como una suite se queda muerta para siempre.`);
  }
});

test('la nota de reapertura lista TODO lo que hay que deshacer', () => {
  const src = leer(EDITOR);
  assert.match(src, /e2e\/apariencia-\*\.spec\.ts/,
    'Sin nombrar los e2e, se reabre el editor y sus tests siguen saltados en silencio.');
});

test('el editor NO se borra: solo se cierra la puerta', () => {
  // Mantenimiento ≠ borrar. Si algún día se reabre, tiene que estar entero.
  const editor = leer('components/theme/theme-editor-fullscreen.tsx');
  assert.ok(editor.length > 0);
  assert.match(leer(EDITOR), /PARA REABRIRLO/,
    'Sin la nota de cómo volver, reabrirlo es arqueología.');
});

// ── El botón y sus tres cosas ────────────────────────────────────────────────
test('Apariencia ofrece UNA salida, a personalizar el panel', () => {
  const src = leer(APARIENCIA);
  const enlaces = [...src.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(enlaces, ['/configuracion/apariencia/panel'],
    'Un solo botón: era el encargo, y dos destinos aquí es una pantalla de menú.');
});

test('la pantalla del panel trae las tres cosas', () => {
  const src = leer(PANEL);
  // 1) color  2) módulos  3) menú
  assert.match(src, /guardarThemeBorrador|publicarThemeApi/, 'falta el color');
  assert.match(src, /HomeSeccionesList/, 'faltan los módulos');
  assert.match(src, /menuPosicion/, 'falta la posición del menú');
  // Los módulos se REUSAN, no se reimplementan: el editor de Inicio ya existía
  // dentro del editor de marca y arrastra, oculta y guarda.
  assert.ok(!/DndContext/.test(src),
    'Si aquí hay drag & drop propio, hay dos editores de Inicio que divergirán.');
});

test('el color se guarda sobre lo PUBLICADO, no sobre el borrador', () => {
  const src = leer(PANEL);
  // `guardarBorradorTheme` fusiona sobre el borrador actual. Si hubiera uno a
  // medias del editor viejo, publicar sacaría a producción cambios que nadie
  // pidió sacar.
  assert.match(src, /guardarThemeBorrador\(\{ \.\.\.publicado, primary \}\)/,
    'Publicar tiene que ser predecible: publicado + el color, y nada más.');
});

test('un color sin contraste no llega a publicarse en silencio', () => {
  const src = leer(PANEL);
  assert.match(src, /if \(!res\.ok\)/, 'no se mira el veredicto de publicar');
  assert.match(src, /res\.errores\[0\]\?\.mensaje/,
    'Se enseña el motivo real del rechazo, no un genérico.');
});

// ── Las dos posiciones, iguales en la BD y en TypeScript ─────────────────────
test('el CHECK de la BD y el tipo de TS dicen las mismas dos posiciones', () => {
  const dir = join(raiz, 'supabase', 'migrations');
  const f = readdirSync(dir).filter(x => x.endsWith('.sql'))
    .filter(x => readFileSync(join(dir, x), 'utf8').includes('studios_menu_posicion_valido'))
    .sort().pop();
  assert.ok(f, 'no encuentro la migración de menu_posicion');

  const sql = readFileSync(join(dir, f!), 'utf8');
  const check = sql.slice(sql.indexOf('studios_menu_posicion_valido'));
  const enSql = [...check.matchAll(/'([a-z]+)'/g)].map(m => m[1]).slice(0, 2).sort();

  const tipos = leer('lib/types.ts');
  const decl = /export type MenuPosicion = ([^;]+);/.exec(tipos);
  assert.ok(decl, 'no encuentro el tipo MenuPosicion');
  const enTs = [...decl![1].matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort();

  assert.deepEqual(enTs, enSql,
    'Una posición que TS acepta y la BD rechaza revienta al guardar; al revés, es una columna con valores que nadie sabe pintar.');
});

// ── El armazón ───────────────────────────────────────────────────────────────
test('con el menú arriba, el contenido no reserva hueco a la izquierda', () => {
  const src = leer('components/layout/sidebar.tsx');
  assert.match(src, /horizontal \? '0px' : SIDEBAR_SIZES\[initial\]\.cssVar/,
    'Sin poner --sidebar-w a 0 queda una franja vacía donde ya no hay menú.');
  const shell = leer('components/layout/dashboard-shell.tsx');
  assert.match(shell, /lg:pt-\[92px\]/,
    'Y sin hueco ARRIBA, la barra flotante tapa la primera fila de cada pantalla.');
});

test('el menú de tamaño no se ofrece tumbado', () => {
  const src = leer('components/layout/sidebar.tsx');
  // «Pequeño/Normal/Grande» describe el ANCHO de la columna. En una barra
  // horizontal no hay ancho que elegir: ofrecerlo es un control que miente.
  assert.match(src, /\{!horizontal && \(\n\s*<div className="relative shrink-0 border-t"/);
});

test('el modo Esencial/Todo SÍ sobrevive a la barra', () => {
  const src = leer('components/layout/sidebar.tsx');
  // Es lo único que devuelve el menú completo a quien esté en «esencial».
  assert.match(src, /\{\(horizontal \|\| !collapsed\) && \(\n\s*<div className=\{cn\(horizontal \? 'shrink-0 w-\[132px\]'/,
    'Sin él, quien esté en Esencial se queda encerrada en media aplicación.');
});
