import { test, expect, type Locator, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Cobros en el móvil: cada recibo dice DE QUIÉN es.
//
// El fundador lo vio en su teléfono: cada fila enseñaba las iniciales, el
// importe y «Sin cobrar», y ningún nombre. Medido a 375 px: los botones de la
// fila (Cobrar · Online · Marcar devuelto · Eliminar) eran invisibles hasta
// pasar el ratón, pero seguían ocupando su ancho, y la columna del nombre se
// quedaba en 0 px. Seguían ahí aunque no se vieran, así que un toque en la
// mitad derecha de la fila podía caer en «Marcar devuelto».
//
// Cobrar desde el móvil SÍ funciona (los mismos diálogos y la misma llamada que
// en el ordenador), así que no se avisa de lo contrario: desde el rediseño
// (2-oct-2026) la fila es la clienta y, al tocarla, su ficha sube desde abajo con
// las acciones a tamaño de dedo. Este test comprueba las dos cosas midiendo, no
// buscando el texto en el DOM —el nombre ESTABA en el DOM cuando no se veía—.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Cómo se pinta una línea de texto: ancho, si sale cortada con «…» y si cabe en la pantalla. */
const comoSeLee = (texto: Locator) => texto.evaluate((el) => {
  // El nombre es un enlace en línea dentro del párrafo que lo trunca: se mide el párrafo.
  const linea = (el.closest('p') ?? el) as HTMLElement;
  const r = linea.getBoundingClientRect();
  return { ancho: Math.round(r.width), cortada: linea.scrollWidth > linea.clientWidth + 1, dentro: r.left >= 0 && r.right <= window.innerWidth + 0.5 };
});

const deudora = (page: Page, socioId: string) => page.locator(`[data-deudora="${socioId}"]`);

async function quienMeDebe(page: Page) {
  await montar(page);
  await ir(page, 'cobros');
  await expect(deudora(page, 'soc-2')).toBeVisible({ timeout: 30_000 });
}

const TELEFONOS = [
  { nombre: '375×812', uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { nombre: '768×1024', uso: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
] as const;

for (const vista of TELEFONOS) {
  test.describe(`Cobros con el dedo, ${vista.nombre}`, () => {
    test.use(vista.uso);

    test('cada clienta que debe dice quién es, cuánto y cómo está, sin salirse de lado', async ({ page }) => {
      await quienMeDebe(page);
      expect(await desborde(page), 'la página se sale de lado').toBeLessThanOrEqual(0);

      for (const [id, nombre, estado] of [['soc-2', 'Laura Martín', 'No se pudo cobrar'], ['soc-4', 'Bea Ortega', 'No se pudo cobrar']] as const) {
        const f = deudora(page, id);
        const n = f.getByText(nombre, { exact: true });
        await expect(n).toBeVisible();
        const lectura = await comoSeLee(n);
        expect(lectura.ancho, `${nombre}: la línea del nombre mide ${lectura.ancho} px`).toBeGreaterThan(60);
        expect(lectura.cortada, `${nombre}: sale cortado`).toBe(false);
        expect(lectura.dentro, `${nombre}: fuera de la pantalla`).toBe(true);
        await expect(f.getByText('89,00 €')).toBeVisible();
        await expect(f.getByText(estado, { exact: true })).toBeVisible();
      }
    });

    test('tocar la fila abre su ficha con las acciones a tamaño de dedo, y «Cobrar» abre el cobro', async ({ page }) => {
      await quienMeDebe(page);
      await deudora(page, 'soc-2').getByRole('button', { name: 'Abrir la ficha de Laura Martín' }).tap();

      const ficha = page.getByTestId('ficha-deudora');
      const cobrar = ficha.getByRole('button', { name: /^Cobrar 89,00 €/ });
      await expect(cobrar).toBeInViewport({ ratio: 1 });
      for (const boton of [cobrar, ficha.getByRole('button', { name: /^Acciones de/ }).first()]) {
        const caja = await boton.boundingBox();
        expect(caja?.height ?? 0, `mide ${caja?.height} px de alto`).toBeGreaterThanOrEqual(44);
      }
      expect(await desborde(page), 'con la ficha abierta').toBeLessThanOrEqual(0);

      await cobrar.tap();
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Efectivo' })).toBeVisible();
    });

    test('«Lo que he cobrado» también dice de quién es cada cobro', async ({ page }) => {
      await montar(page);
      await ir(page, 'cobros?tab=cobrado');
      await expect(page.getByTestId('cobrado-neto')).toBeVisible({ timeout: 30_000 });
      // Los cobros sembrados son de los últimos días: el día 1 caen en el mes anterior.
      if (await page.locator('[data-recibo]').count() === 0) await page.getByRole('button', { name: 'Periodo anterior' }).tap();
      const n = page.getByText('María García Fernández', { exact: true }).first();
      await expect(n).toBeVisible({ timeout: 15_000 });
      const lectura = await comoSeLee(n);
      expect(lectura.cortada, 'el nombre sale cortado').toBe(false);
      expect(lectura.dentro).toBe(true);
      expect(await desborde(page), 'la página se sale de lado').toBeLessThanOrEqual(0);
      for (const boton of await page.locator('[data-recibo]').getByRole('button', { name: /^Acciones de/ }).all()) {
        expect((await boton.boundingBox())?.height ?? 0, 'el ⋯ a tamaño de dedo').toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test('en el ordenador la fila lleva su «Cobrar» a la vista, y abrirla pone la ficha al lado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await quienMeDebe(page);
  const f = deudora(page, 'soc-2');
  await expect(f.getByText('Mensual ilimitado — septiembre')).toBeVisible();
  await f.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Ficha de Laura Martín' })).toBeVisible();
});
