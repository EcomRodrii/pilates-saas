import { test, expect, type Page } from '@playwright/test';
import { abrirPanel, controlesCortos, quitarMarcaPanelNuevo } from './zona-tactil';

// Las pantallas del MOSTRADOR del panel nuevo en el iPad de recepción, con el
// dedo: Resumen (Hoy en el estudio), Clientas y su ficha, Cobros y el
// Calendario. Las piezas comunes (cabecera, botones, pestañas, píldoras, el
// marco) las mide `panel-nuevo-tableta-tactil.spec.ts`; aquí, los controles
// propios de cada pantalla, que medían entre 16 y 36 px: las flechas de «Hoy en
// el estudio» 32, «Pasar lista» 29, las casillas de Clientas 16, las pestañas
// de Cobros 32, y la cabecera del Calendario volvía a 36 justo en el iPad (`md:`).

test.use({ timezoneId: 'Europe/Madrid', hasTouch: true });
// Contra un `next dev` que compila al vuelo, una ruta nueva tarda en la primera petición.
test.describe.configure({ timeout: 90_000 });

test.describe('iPad vertical (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('Resumen: «Hoy en el estudio» y las tarjetas de debajo', async ({ page }) => {
    await abrirPanel(page, 'dashboard');
    expect(await controlesCortos([
      ['«Día anterior»', page.getByRole('button', { name: 'Día anterior' })],
      ['«Día siguiente»', page.getByRole('button', { name: 'Día siguiente' })],
      ['«Ver calendario»', page.getByRole('link', { name: 'Ver calendario' }).first()],
      ['«Pasar lista»', page.getByRole('link', { name: 'Pasar lista' }).first()],
      ['«Rellenar huecos»', page.getByRole('button', { name: /^Rellenar hueco/ }).first()],
      ['«Ver todas» (Próximas clases)', page.getByRole('link', { name: 'Ver todas' })],
      ['«Añadir un gráfico personalizado»', page.getByRole('button', { name: 'Añadir un gráfico personalizado' })],
    ])).toEqual([]);
  });

  test('Clientas: estados, orden, lápiz y la casilla, que se marca tocando al lado', async ({ page }) => {
    await abrirPanel(page, 'clientas');
    const casilla = page.getByRole('checkbox', { name: 'Seleccionar a Bea Ortega' });
    await expect(casilla).toBeVisible({ timeout: 30_000 });
    expect(await controlesCortos([
      ['estado «Todas»', page.getByRole('radio', { name: /^Todas/ })],
      ['estado «Activa»', page.getByRole('radio', { name: /^Activa/ })],
      ['«Segmentos»', page.getByRole('button', { name: /^Segmentos/ })],
      ['ordenar por «Clienta»', page.getByRole('button', { name: 'Clienta', exact: true })],
      ['lápiz', page.getByRole('button', { name: 'Editar a Bea Ortega' })],
      // La casilla (16 px) no puede llevar el `::after`: la zona es su etiqueta.
      ['casilla (su etiqueta)', casilla.locator('xpath=..')],
    ])).toEqual([]);
    // Y la etiqueta la marca de verdad: un toque a 18 px de la casilla.
    const caja = (await casilla.boundingBox())!;
    await page.touchscreen.tap(caja.x + caja.width / 2 + 18, caja.y + caja.height / 2);
    await expect(casilla).toBeChecked();
  });

  test('Cobros: pestañas, filtros, buscador, casillas, «Cobrar» y «Ver lo que he cobrado»', async ({ page }) => {
    await abrirPanel(page, 'cobros');
    const secciones = page.getByRole('navigation', { name: 'Secciones de Cobros' });
    expect(await controlesCortos([
      ['pestaña «Quién me debe»', secciones.getByRole('button', { name: /^Quién me debe/ })],
      ['pestaña «Facturas»', secciones.getByRole('button', { name: 'Facturas' })],
      ['filtro «Todas»', page.getByRole('button', { name: /^Todas/ })],
      ['filtro «No se pudo cobrar»', page.getByRole('button', { name: /^No se pudo cobrar/ })],
      ['buscador', page.getByRole('searchbox', { name: 'Buscar clienta o concepto' })],
      ['«Seleccionar todo»', page.getByRole('button', { name: 'Seleccionar todo' })],
      ['marcar a una clienta', page.getByRole('button', { name: 'Marcar a Bea Ortega' })],
      ['«Cobrar» de la fila', page.getByRole('button', { name: 'Cobrar', exact: true }).first()],
      ['«Ver lo que he cobrado»', page.getByRole('button', { name: 'Ver lo que he cobrado' })],
      ['nombre en «Próximas cuotas»', page.getByRole('link', { name: 'Laura Martín' }).last()],
    ])).toEqual([]);
  });

  test('sin la marca del panel nuevo, la medida ve el diseño de antes (quitada con JavaScript)', async ({ page }) => {
    await abrirPanel(page, 'cobros');
    await quitarMarcaPanelNuevo(page);
    const secciones = page.getByRole('navigation', { name: 'Secciones de Cobros' });
    const malos = await controlesCortos([
      ['pestaña «Quién me debe»', secciones.getByRole('button', { name: /^Quién me debe/ })],
      ['filtro «No se pudo cobrar»', page.getByRole('button', { name: /^No se pudo cobrar/ })],
      ['buscador', page.getByRole('searchbox', { name: 'Buscar clienta o concepto' })],
      ['marcar a una clienta', page.getByRole('button', { name: 'Marcar a Bea Ortega' })],
      ['«Ver lo que he cobrado»', page.getByRole('button', { name: 'Ver lo que he cobrado' })],
    ]);
    expect(malos.length, malos.join('\n')).toBe(5);
  });
});

async function cabeceraDelCalendario(page: Page) {
  return controlesCortos([
    ['flecha anterior', page.getByRole('button', { name: /anterior$/ }).first()],
    ['«Hoy»', page.getByRole('button', { name: 'Hoy', exact: true })],
    ['flecha siguiente', page.getByRole('button', { name: /siguiente$/ }).first()],
    ['vista «Día»', page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Día' })],
    ['vista «Semana»', page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Semana' })],
    ['«Buscar clase»', page.getByRole('button', { name: 'Buscar clase' })],
    ['«Más herramientas»', page.getByRole('button', { name: 'Más herramientas' })],
    ['filtro de sala', page.getByRole('combobox', { name: 'Filtrar por sala' })],
    ['«por pasar lista»', page.getByTestId('resumen-calendario').getByRole('button').first()],
  ]);
}

/**
 * Las cabeceras de los días sin clases (plegadas a 36 px): su texto cabe en su
 * columna y no lo corta la esquina redondeada de la tarjeta (la última columna
 * va pegada a ella, y a la altura del texto la curva entra unos 8 px).
 */
async function cabecerasPlegadasQueSeSalen(page: Page) {
  await expect(page.getByTestId('semana-franjas')).toBeVisible({ timeout: 30_000 });
  return page.locator('[data-cabecera-dia] > p.text-center').evaluateAll((ps) =>
    ps.filter((p) => {
      const caja = p.parentElement!.getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents(p);
      const t = r.getBoundingClientRect();
      if (t.left < caja.left - 0.5 || t.right > caja.right + 0.5) return true;
      const tarjeta = p.closest('[data-testid="semana-franjas"]')!.parentElement!;
      const tr = tarjeta.getBoundingClientRect();
      const radio = parseFloat(getComputedStyle(tarjeta).borderTopRightRadius);
      const y = t.top - tr.top;
      const entra = y < radio ? radio - Math.sqrt(radio * radio - (radio - y) ** 2) : 0;
      // Con 2 px de aire: antes, la «É» de «MIÉ» quedaba a 0,1 px de la curva y se veía cortada.
      return t.right > tr.right - entra - 2;
    }).map((p) => (p as HTMLElement).innerText.replace(/\s+/g, ' ')));
}

for (const [ancho, alto, nombre] of [[768, 1024, 'vertical'], [1024, 768, 'tumbado']] as const) {
  test.describe(`Calendario, iPad ${nombre} (${ancho}×${alto})`, () => {
    test.use({ viewport: { width: ancho, height: alto } });

    test('la cabecera tiene 44 px de zona táctil y los días sin clases caben en su columna', async ({ page }) => {
      await abrirPanel(page, 'calendario');
      expect(await cabeceraDelCalendario(page)).toEqual([]);
      expect(await cabecerasPlegadasQueSeSalen(page)).toEqual([]);
    });
  });
}

test.describe('ficha de la clienta, iPad tumbado (1024×768)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('los controles de la ficha y el título de cada tarjeta, entero', async ({ page }) => {
    await abrirPanel(page, 'clientas/soc-1');
    for (let i = 0; i < 10 && await page.getByText('Esta página no existe').count(); i++) {
      await page.waitForTimeout(2000); await page.reload({ waitUntil: 'domcontentloaded' });
    }
    expect(await controlesCortos([
      ['volver a «Clientas»', page.getByRole('link', { name: 'Clientas', exact: true }).last()],
      ['«Reservar»', page.getByRole('button', { name: 'Reservar', exact: true })],
      ['«Más acciones»', page.getByRole('button', { name: 'Más acciones' }).first()],
      ['pestaña «Historia»', page.getByRole('tablist', { name: 'Secciones de la ficha' }).getByRole('tab', { name: 'Historia' })],
      ['«Cambiar plan»', page.getByRole('button', { name: 'Cambiar plan' })],
      ['«Reservar otra»', page.getByRole('button', { name: 'Reservar otra' })],
      ['quitar una etiqueta', page.getByRole('button', { name: 'Quitar la etiqueta reformer' })],
      ['añadir etiqueta', page.getByRole('button', { name: 'Añadir', exact: true })],
    ])).toEqual([]);
    // «Asistencia últimos meses» se quedaba en «Asistencia últimos m…» por las píldoras de al lado.
    const titulo = page.getByRole('heading', { name: 'Asistencia últimos meses' }).locator('span.truncate');
    await titulo.scrollIntoViewIfNeeded();
    expect(await titulo.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
});
