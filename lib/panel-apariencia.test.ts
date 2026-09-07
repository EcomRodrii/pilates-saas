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

test('la pantalla del panel trae las cinco cosas', () => {
  const src = leer(PANEL);
  assert.match(src, /publicarThemeApi/, 'faltan los colores');
  assert.match(src, /p\.modulos/, 'faltan los módulos del menú');
  assert.match(src, /p\.seccionesHome/, 'faltan las secciones de Inicio');
  assert.match(src, /elegirPosicion/, 'falta la posición del menú');
  assert.match(src, /setDark/, 'falta claro/oscuro');
  // El arrastrar-y-soltar vive en UN componente compartido: dos listas
  // parecidas es como acaban divergiendo (el ojo a un lado en una y al otro
  // en la otra) y ninguna parece del mismo producto.
  assert.ok(!/DndContext/.test(src),
    'La lista ordenable es compartida: aquí no puede haber otra.');
});

// ⚠️ El fallo que costó una migración de ida y vuelta.
test('la posición del menú usa el layout que YA existía, no una columna nueva', () => {
  const src = leer(PANEL) + leer('components/panel/use-personalizacion-panel.ts');
  assert.match(src, /menuPosition/, 'tiene que ir por `studio_layout`');
  assert.ok(!/menu_posicion|menuPosicion/.test(src),
    '`MENU_POSICIONES` existe en layout-runtime desde antes: una columna aparte son dos fuentes para el mismo ajuste.');
  const sidebar = leer('components/layout/sidebar.tsx');
  // Lo que importa es que la LEA del layout, no con qué grafía: la primera
  // versión de este guardia exigía `setMenuPosition(l.menuPosition)` literal y
  // se rompió sola al endurecer el valor contra respuestas vacías.
  assert.match(sidebar, /setMenuPosition\([^)]*l\.menuPosition/,
    'El menú tiene que LEER la posición del layout: declararla y no cablearla fue el problema original.');
});

test('guardar el color repinta el panel sin recargar', () => {
  const src = leer(PANEL);
  // `PanelThemeProvider` ya escucha este evento. No dispararlo fue exactamente
  // por qué la primera versión «no hacía nada» al guardar un color.
  assert.match(src, /dispatchEvent\(new CustomEvent\('tentare-theme-changed'\)\)/);
  assert.ok(!/Recarga para verlo/.test(src),
    'Pedir una recarga era tapar el fallo, no arreglarlo.');
});

test('guardar el menú lo recoloca sin recargar', () => {
  const hook = leer('components/panel/use-personalizacion-panel.ts');
  assert.match(hook, /dispatchEvent\(new CustomEvent\('tentare-layout-changed'\)\)/);
  assert.match(leer('components/layout/sidebar.tsx'), /addEventListener\('tentare-layout-changed'/,
    'Si el menú no escucha, guardar no mueve nada hasta recargar.');
});

test('no se puede guardar encima de un layout que no se ha podido leer', () => {
  const hook = leer('components/panel/use-personalizacion-panel.ts');
  assert.match(hook, /setEstado\('error'\)/);
  assert.match(leer(PANEL), /disabled=\{p\.guardando \|\| p\.estado === 'error'\}/,
    'Guardar sobre una lectura fallida borraría el menú que el estudio ya tenía.');
});

test('el color se guarda sobre lo PUBLICADO, no sobre el borrador', () => {
  const src = leer(PANEL);
  // `guardarBorradorTheme` fusiona sobre el borrador actual. Si hubiera uno a
  // medias del editor viejo, publicar sacaría a producción cambios que nadie
  // pidió sacar.
  assert.match(src, /guardarThemeBorrador\(\{ \.\.\.base, primary, secondary \}\)/,
    'Publicar tiene que ser predecible: publicado + los colores, y nada más.');
});

test('un color sin contraste no llega a publicarse en silencio', () => {
  const src = leer(PANEL);
  assert.match(src, /if \(!res\.ok\)/, 'no se mira el veredicto de publicar');
  assert.match(src, /res\.errores\[0\]\?\.mensaje/,
    'Se enseña el motivo real del rechazo, no un genérico.');
});

// ── El armazón ───────────────────────────────────────────────────────────────
test('los dos huecos los escribe el MENÚ, y siempre uno de los dos a cero', () => {
  const src = leer('components/layout/sidebar.tsx');
  assert.match(src, /setProperty\('--sidebar-w', horizontal \? '0px'/,
    'Sin --sidebar-w a 0 queda una franja vacía donde ya no hay menú.');
  assert.match(src, /setProperty\('--panel-top', horizontal \?/,
    'Y sin hueco ARRIBA, la barra tapa la primera fila de cada pantalla.');
  // ⚠️ El alto se MIDE, no se supone: un número fijo se queda corto con el
  // selector de sede de una cadena, con el tipo de letra del sistema más grande
  // o en cuanto la barra envuelve en varias filas.
  assert.match(src, /new ResizeObserver/,
    'El hueco tiene que seguir al alto REAL de la barra, no a una constante.');
  assert.match(src, /borderBoxSize/,
    '`contentRect` deja fuera el relleno: el hueco salía 32 px corto.');
  // ⚠️ Los dos, en la MISMA función: separarlos es como acaban discrepando
  // (menú arriba y hueco a la izquierda a la vez).
  assert.match(src, /function aplicarHuecos\(/);
  const shell = leer('components/layout/dashboard-shell.tsx');
  assert.match(shell, /lg:pt-\[var\(--panel-top\)\]/,
    'El armazón no pide el layout: si decidiera el hueco por su cuenta, discreparía con la barra en cada carga.');
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
