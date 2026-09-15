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
// en el ordenador), así que no se avisa de lo contrario: las acciones pasan al
// detalle que se abre al tocar la fila, a tamaño de dedo. Este test comprueba
// las dos cosas midiendo, no buscando el texto en el DOM —el nombre ESTABA en el
// DOM cuando no se veía—.
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

const fila = (page: Page, id: string) => page.locator(`[data-recibo="${id}"]`);

async function quienMeDebe(page: Page) {
  await montar(page);
  await ir(page, 'cobros');
  await expect(fila(page, 'rec-2')).toBeVisible({ timeout: 30_000 });
}

const TELEFONOS = [
  { nombre: '375×812', uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { nombre: '768×1024', uso: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
] as const;

for (const vista of TELEFONOS) {
  test.describe(`Cobros con el dedo, ${vista.nombre}`, () => {
    test.use(vista.uso);

    test('cada recibo sin cobrar dice de quién es, cuánto y cómo está, sin salirse de lado', async ({ page }) => {
      await quienMeDebe(page);
      expect(await desborde(page), 'la página se sale de lado').toBeLessThanOrEqual(0);

      for (const [id, nombre, estado] of [['rec-2', 'Laura Martín', 'Sin cobrar'], ['rec-4', 'Bea Ortega', 'No se pudo cobrar']] as const) {
        const f = fila(page, id);
        const n = f.getByText(nombre, { exact: true });
        await expect(n).toBeVisible();
        const lectura = await comoSeLee(n);
        expect(lectura.ancho, `${nombre}: la línea del nombre mide ${lectura.ancho} px`).toBeGreaterThan(60);
        expect(lectura.cortada, `${nombre}: sale cortado`).toBe(false);
        expect(lectura.dentro, `${nombre}: fuera de la pantalla`).toBe(true);
        await expect(f.getByText('89,00 €')).toBeVisible();
        await expect(f.getByText(estado, { exact: true })).toBeVisible();
        // Los botones de pasar el ratón no están ni ocupando sitio ni esperando un toque a ciegas.
        await expect(f.getByTitle('Marcar devuelto')).toBeHidden();
      }
    });

    test('tocar la fila abre las acciones a tamaño de dedo, y «Cobrar» abre el cobro', async ({ page }) => {
      await quienMeDebe(page);
      await fila(page, 'rec-2').tap();

      const cobrar = page.getByRole('button', { name: 'Cobrar', exact: true });
      await expect(cobrar).toBeInViewport({ ratio: 1 });
      for (const nombre of ['Cobrar', 'Cobrar online', 'Marcar devuelto', 'Eliminar']) {
        const caja = await page.getByRole('button', { name: nombre, exact: true }).boundingBox();
        expect(caja?.height ?? 0, `«${nombre}» mide ${caja?.height} px de alto`).toBeGreaterThanOrEqual(44);
      }
      expect(await desborde(page), 'con el detalle abierto').toBeLessThanOrEqual(0);

      await cobrar.tap();
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    test('«Lo que he cobrado» también dice de quién es cada cobro', async ({ page }) => {
      await montar(page);
      await ir(page, 'cobros?tab=cobrado');
      const n = page.getByText('Laura Martín', { exact: true });
      await expect(n).toBeVisible({ timeout: 30_000 });
      const lectura = await comoSeLee(n);
      expect(lectura.cortada, 'Laura Martín sale cortado').toBe(false);
      expect(lectura.dentro).toBe(true);
      expect(await desborde(page), 'la página se sale de lado').toBeLessThanOrEqual(0);
      for (const boton of await page.getByRole('button', { name: 'Sin factura' }).all()) {
        expect((await boton.boundingBox())?.height ?? 0, '«Sin factura» a tamaño de dedo').toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test('en el ordenador la fila no cambia: el nombre va debajo del concepto y las acciones, en la fila', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await quienMeDebe(page);
  const f = fila(page, 'rec-2');
  const concepto = await f.getByText('Mensual ilimitado — septiembre').boundingBox();
  const nombre = await f.getByText('Laura Martín', { exact: true }).boundingBox();
  expect(nombre!.y, 'el nombre, debajo del concepto').toBeGreaterThan(concepto!.y);
  await f.hover();
  await expect(f.getByTitle('Marcar devuelto')).toBeVisible();
});
