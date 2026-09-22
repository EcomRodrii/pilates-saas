// «Apariencia de tu app» + personalización del panel.
//
// Del 7 al 22 de septiembre esta pantalla estuvo en mantenimiento y aquí vivían
// los guardias de que el editor viejo siguiera cerrado por las dos puertas. El
// 22-sep se sustituyó por el editor guiado (components/apariencia/), así que lo
// que hay que vigilar ahora es que la pantalla lo monte de verdad y que la ruta
// de antes lleve a ella.
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
// «Personalizar tu panel» vive hoy dentro de Configuración: el menú, el Inicio,
// la posición y claro/oscuro en «Tu panel»; el color, en «Marca». Su ruta de
// antes redirige.
const PANEL = 'components/configuracion/secciones/seccion-panel.tsx';
const EDITOR_NUEVO = 'components/apariencia/editor-apariencia-app.tsx';
const PANEL_ANTIGUO = 'app/(dashboard)/configuracion/apariencia/panel/page.tsx';

// ── La pantalla nueva, y la puerta de antes ─────────────────────────────────

test('Apariencia monta el editor guiado, y no un cartel', () => {
  const src = leerCodigo(APARIENCIA);
  assert.match(src, /<EditorAparienciaApp/);
  assert.ok(!/mantenimiento/i.test(src), 'El mantenimiento terminó el 22-sep: un cartel viejo aquí manda a la propietaria a ninguna parte.');
});

test('la ruta del editor de antes lleva a la pantalla nueva', () => {
  const src = leerCodigo(EDITOR);
  assert.match(src, /redirect\('\/configuracion\/apariencia'\)/,
    'Quien lo tenga en marcadores tiene que llegar al editor de hoy.');
  assert.ok(!src.includes('<ThemeEditorFullscreen'), 'El editor viejo no vuelve por esta ruta.');
});

test('lo que se elige llega a la app: el editor publica y la app lo pinta en servidor', () => {
  // Las dos mitades. Sin la primera no se guarda nada; sin la segunda, la
  // propietaria elige un estilo y sus alumnas siguen viendo el de siempre.
  assert.match(leer(EDITOR_NUEVO), /publicarThemeApi\(\{/);
  assert.match(leer(EDITOR_NUEVO), /appAlumna/);
  const layout = leer('app/portal/[slug]/layout.tsx');
  assert.match(layout, /temaAppCssText\(estudio\.colorPrimario, estudio\.apariencia\)/,
    'La app tiene que pintar lo elegido en SERVIDOR: en cliente se vería primero el tema de fábrica.');
});

test('la vista previa es la app de verdad, y el marco propio está permitido', () => {
  // Una maqueta del panel se desincroniza de la app en cuanto una cambia; y sin
  // abrir el marco a nuestro propio origen, el iframe sale en blanco.
  assert.match(leer(EDITOR_NUEVO), /src=\{`\/portal\//);
  const proxy = leerCodigo('proxy.ts');
  assert.match(proxy, /startsWith\('\/portal\/'\)/);
  assert.match(proxy, /frame-ancestors 'self'/);
  assert.match(proxy, /frame-ancestors 'none'/, 'El resto del panel sigue sin poder embeberse.');
});

// ── El botón y sus tres cosas ────────────────────────────────────────────────
test('«Tu panel» y «Apariencia de tu app» traen las cinco cosas, y la ruta de antes lleva allí', () => {
  const src = leer(PANEL);
  assert.match(leer(EDITOR_NUEVO), /publicarThemeApi/, 'faltan los colores');
  assert.match(leer(PANEL_ANTIGUO), /redirect\(RUTAS_ANTIGUAS\['\/configuracion\/apariencia\/panel'\]\)/,
    'Quien tenga la pantalla de antes en marcadores tiene que llegar a «Tu panel».');
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

// ⚠️ Reportado con capturas: al scrollear, el buscador se metía dentro del menú.
test('lo pegado arriba se clava DEBAJO del menú, no encima', () => {
  const topbar = leer('components/layout/topbar.tsx');
  const sidebar = leer('components/layout/sidebar.tsx');

  // Con el menú arriba, su barra es `fixed` y ocupa la banda superior. Un
  // `sticky top-0` se clava en y=0 —dentro de esa banda— y con z-30 contra su
  // z-20 la tapa: se veían las filas del menú por detrás del fondo translúcido
  // del Topbar. El umbral tiene que salir de lo que el menú MIDE de sí mismo.
  assert.ok(!/sticky\s+top-0\b/.test(topbar),
    'El Topbar no puede clavarse en y=0: con el menú arriba eso es dentro de la barra.');
  assert.match(topbar, /sticky\s+top-\[var\(--panel-sticky-top/,
    'El Topbar tiene que clavarse a la altura que publica el menú.');

  // Y esa variable la escribe quien mide la barra, junto a las otras dos, para
  // que no puedan contradecirse.
  assert.match(sidebar, /--panel-sticky-top/,
    '`aplicarHuecos` tiene que publicar la altura a la que se puede clavar algo.');
  // ⚠️ El CÁLCULO ya no vive aquí: se sacó a `lib/panel-huecos.ts` para poder
  // probarlo de verdad (`lib/panel-huecos.test.ts` cubre el valor en columna,
  // en barra, y el orden de llamadas que lo descuadraba). Aquí solo se vigila
  // que el menú siga siendo quien lo publica en el DOM.
  const huecos = leer('lib/panel-huecos.ts');
  assert.match(huecos, /panelStickyTop: horizontal \? banda : '0px'/,
    'En columna el sitio correcto es 0, no el aire del contenido.');
});

test('publicar repinta el panel sin recargar', () => {
  const src = leer(EDITOR_NUEVO);
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
  assert.match(leer(PANEL), /bloqueo=\{p\.estado === 'error'/,
    'Guardar sobre una lectura fallida borraría el menú que el estudio ya tenía.');
});

test('se publica SOLO lo cambiado, sobre lo PUBLICADO, sin reescribir el borrador', () => {
  const src = leer(EDITOR_NUEVO);
  // Publicar el borrador entero sacaría a producción lo que el editor viejo
  // dejara a medias; reescribirlo desde lo publicado borraba el favicon
  // pendiente. Se mandan los campos tocados y el servidor fusiona solo esos.
  assert.match(src, /borrador\.primary !== publicado\.primary \? \{ primary/,
    'Publicar tiene que ser predecible: publicado + lo que se ha tocado, y nada más.');
  assert.ok(!/guardarThemeBorrador/.test(src), 'El color no reescribe el borrador.');
  assert.match(leer('lib/theme-data.ts'), /export async function publicarCamposTheme[\s\S]*fusionarCampos\(/,
    'La fusión de solo esos campos vive en el servidor.');
});

test('un color sin contraste no llega a publicarse en silencio', () => {
  const src = leer(EDITOR_NUEVO);
  assert.match(src, /if \(!res\.ok\)/, 'no se mira el veredicto de publicar');
  assert.match(src, /res\.errores\[0\]\?\.mensaje/,
    'Se enseña el motivo real del rechazo, no un genérico.');
});

// ── El armazón ───────────────────────────────────────────────────────────────
test('los dos huecos los escribe el MENÚ, y siempre uno de los dos a cero', () => {
  const src = leer('components/layout/sidebar.tsx');
  const huecos = leer('lib/panel-huecos.ts');
  assert.match(huecos, /sidebarW: horizontal \? '0px'/,
    'Sin --sidebar-w a 0 queda una franja vacía donde ya no hay menú.');
  assert.match(huecos, /panelTop: horizontal \?/,
    'Y sin hueco ARRIBA, la barra tapa la primera fila de cada pantalla.');
  // Calculados en un sitio, escritos en otro: el menú sigue siendo el único
  // que los publica, y los tres van juntos para que no se contradigan.
  for (const v of ['--sidebar-w', '--panel-top', '--panel-sticky-top']) {
    assert.ok(src.includes(`setProperty('${v}'`), `el menú ya no publica ${v}`);
  }
  // ⚠️ Omitir la medida NO puede volver a significar «una fila». Es lo que
  // dejaba el buscador clavado dentro del menú, y no se arreglaba solo porque
  // el ResizeObserver únicamente dispara si la barra CAMBIA de tamaño.
  assert.ok(!/altoBarra\s*(:\s*number)?\s*=\s*BARRA_ALTO_INICIAL/.test(huecos),
    'La medida ha vuelto a tener valor por defecto: omitirla supone una fila otra vez.');
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
