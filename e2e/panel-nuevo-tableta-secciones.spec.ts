import { test, expect } from '@playwright/test';
import { abrirPanel, controlesCortos, quitarMarcaPanelNuevo } from './zona-tactil';

// El resto de secciones del panel nuevo en el iPad de recepción, con el dedo:
// Equipo, Módulos, Paquetes, Citas, Mensajería, Automatizaciones, Informes,
// Centro de Control y Sustituciones. Las piezas comunes las mide
// `panel-nuevo-tableta-tactil.spec.ts`, el mostrador
// `panel-nuevo-tableta-mostrador.spec.ts`; aquí, lo propio de cada una, que
// medía entre 16 y 40 px («Ir →» de Módulos 28, los días de Equipo 29, el
// periodo de Informes 32, los interruptores de Automatizaciones 28…).

test.use({ timezoneId: 'Europe/Madrid', hasTouch: true, viewport: { width: 768, height: 1024 } });
// Varias pantallas por prueba, contra un `next dev` que compila al vuelo.
test.describe.configure({ timeout: 120_000 });

test('Módulos: «Ir →» y el interruptor de cada tarjeta, sin pisarse', async ({ page }) => {
  await abrirPanel(page, 'explorar-funciones');
  expect(await controlesCortos([
    ['«Ir a Calendario»', page.getByRole('link', { name: 'Ir a Calendario' })],
    ['interruptor de Calendario', page.getByRole('switch', { name: 'Calendario en el menú' })],
    ['«Ir a Cobros»', page.getByRole('link', { name: 'Ir a Cobros' })],
    ['interruptor de Cobros', page.getByRole('switch', { name: 'Cobros en el menú' })],
  ])).toEqual([]);
});

test('Equipo: los desplegables, el lápiz, ⋯ y los días de la semana', async ({ page }) => {
  await abrirPanel(page, 'equipo');
  const ana = page.locator('[data-menu-equipo]').first();
  expect(await controlesCortos([
    ['desplegable «Estado»', page.getByRole('combobox').first()],
    ['lápiz', ana.getByRole('button', { name: 'Editar' })],
    ['⋯', ana.getByRole('button', { name: 'Más acciones' })],
    ['día «X»', page.getByRole('button', { name: 'X', exact: true }).first()],
  ])).toEqual([]);
});

test('Paquetes: pestañas, tipo de tarifa, Lista/Tarjetas, buscador y acciones', async ({ page }) => {
  await abrirPanel(page, 'productos');
  expect(await controlesCortos([
    ['pestaña «Tarjeta regalo»', page.getByRole('button', { name: 'Tarjeta regalo', exact: true })],
    ['tipo «Bonos»', page.getByRole('button', { name: /^Bonos/ })],
    ['«Lista»', page.getByRole('button', { name: 'Lista', exact: true })],
    ['«Tarjetas»', page.getByRole('button', { name: 'Tarjetas', exact: true })],
    ['buscador', page.getByRole('textbox', { name: /^Buscar en/ })],
    ['acciones de un plan', page.getByRole('button', { name: /^Acciones de/ }).first()],
  ])).toEqual([]);
});

test('Citas, Informes, Centro de Control y Sustituciones', async ({ page }) => {
  await abrirPanel(page, 'citas');
  const citas = await controlesCortos([
    ['«Importar»', page.getByRole('link', { name: 'Importar' })],
    ['«Historial»', page.getByRole('button', { name: 'Historial' })],
    ['filtro de instructora', page.getByRole('button', { name: 'Cloe', exact: true })],
    ['«Traerlas de mi programa anterior»', page.getByRole('link', { name: 'Traerlas de mi programa anterior' })],
  ]);
  await abrirPanel(page, 'informes');
  const informes = await controlesCortos([
    ['«Cierre para la gestoría»', page.getByRole('link', { name: 'Cierre para la gestoría' })],
    ['tema «Dinero»', page.getByRole('tab', { name: 'Dinero' })],
    ['periodo «Mes»', page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Mes', exact: true })],
    ['«Periodo anterior»', page.getByRole('button', { name: 'Periodo anterior' })],
  ]);
  await abrirPanel(page, 'centro-de-control');
  const centro = await controlesCortos([
    ['«¿Por qué?»', page.getByRole('button', { name: '¿Por qué?' })],
  ]);
  await abrirPanel(page, 'sustituciones');
  const sustituciones = await controlesCortos([
    ['«Qué más pasa cuando una clase cambia»', page.getByRole('link', { name: 'Qué más pasa cuando una clase cambia' })],
  ]);
  expect([...citas, ...informes, ...centro, ...sustituciones]).toEqual([]);
});

test('Mensajería y Automatizaciones', async ({ page }) => {
  await abrirPanel(page, 'mensajeria');
  const mensajeria = await controlesCortos([
    ['«Ver alumnas»', page.getByRole('link', { name: 'Ver alumnas' })],
    ['«Marcar todas leídas»', page.getByRole('button', { name: 'Marcar todas leídas' })],
    ['«Ver más»', page.getByRole('link', { name: 'Ver más' }).first()],
    // El buscador (23 px de alto) va dentro de una etiqueta: la zona es la caja entera.
    ['buscador (su caja)', page.getByPlaceholder('Buscar notificaciones...').locator('xpath=..')],
  ]);
  await abrirPanel(page, 'automatizaciones');
  const automatizaciones = await controlesCortos([
    ['«Revisar ahora»', page.getByRole('button', { name: 'Revisar ahora' })],
    ['interruptor de una regla', page.getByRole('switch').first()],
    ['«Ver cómo funciona y qué le llega»', page.getByRole('button', { name: 'Ver cómo funciona y qué le llega' }).first()],
  ]);
  expect([...mensajeria, ...automatizaciones]).toEqual([]);
});

test('sin la marca del panel nuevo, la medida ve el diseño de antes (quitada con JavaScript)', async ({ page }) => {
  await abrirPanel(page, 'informes');
  await quitarMarcaPanelNuevo(page);
  const malos = await controlesCortos([
    ['periodo «Mes»', page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Mes', exact: true })],
    ['«Periodo anterior»', page.getByRole('button', { name: 'Periodo anterior' })],
    ['«Cierre para la gestoría»', page.getByRole('link', { name: 'Cierre para la gestoría' })],
  ]);
  expect(malos.length, malos.join('\n')).toBe(3);
});
