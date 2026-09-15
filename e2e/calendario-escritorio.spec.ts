import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario en un ordenador: la rejilla llega al fondo de la ventana y no
// se la come la cabecera.
//
// Medido antes del arreglo, con el aviso «¿Primera vez aquí?» de la guía puesto
// (lo ve cualquier estudio nuevo):
//   · 1366×768 (el portátil Windows más común): la rejilla empezaba a 499 px y
//     la PÁGINA se desplazaba 60 px, así que salía cortada abajo — unas tres
//     horas a la vista;
//   · la barra de botones no cabía en una fila y «Clase recurrente» bajaba sola
//     a una segunda;
//   · en un monitor de 1920 px, filtros y métricas iban en dos filas medio vacías.
// El alto era un `calc(100vh - 72px)` que no sabía nada del aviso.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const rejilla = (page: Page) => page.getByTestId('grid-semana-scroll');

async function semana(page: Page) {
  await montar(page);
  await ir(page, 'calendario');
  await expect(rejilla(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(400); // el alto se mide en el siguiente fotograma
}

/** Horas de rejilla que se ven de verdad: desde bajo la cabecera de días hasta donde acaba la ventana. */
const horasALaVista = (page: Page) => page.evaluate(() => {
  const r = document.querySelector<HTMLElement>('[data-testid="grid-semana-scroll"]')!.getBoundingClientRect();
  const cabecera = document.querySelector<HTMLElement>('[data-cabecera-dia="0"]')!.getBoundingClientRect();
  return +((Math.min(r.bottom, innerHeight) - cabecera.bottom) / 72).toFixed(2);
});

const VISTAS = [
  // Horas a la vista con el aviso de la guía puesto. Antes del arreglo: 2,96 ·
  // 4,28 · 7,42 (y la rejilla cortada por abajo).
  { nombre: 'portátil Windows 1366×768', w: 1366, h: 768, horas: 3.6 },
  { nombre: 'MacBook 1440×900', w: 1440, h: 900, horas: 5.3 },
  { nombre: 'monitor 1920×1080', w: 1920, h: 1080, horas: 7.6 },
] as const;

for (const v of VISTAS) {
  test.describe(`Calendario en ${v.nombre}`, () => {
    test.use({ viewport: { width: v.w, height: v.h } });

    test('la página no se desplaza y la rejilla acaba dentro de la ventana', async ({ page }) => {
      await semana(page);
      const m = await page.evaluate(() => ({
        sobra: document.documentElement.scrollHeight - innerHeight,
        fondo: document.querySelector<HTMLElement>('[data-testid="grid-semana-scroll"]')!.getBoundingClientRect().bottom,
      }));
      expect(m.sobra, 'la página se desplaza').toBeLessThanOrEqual(1);
      expect(m.fondo, 'la rejilla sale cortada por abajo').toBeLessThanOrEqual(v.h);
      expect(await horasALaVista(page), 'horas de rejilla a la vista').toBeGreaterThanOrEqual(v.horas);
    });

    test('cerrar el aviso de la guía le da ese sitio a la rejilla', async ({ page }) => {
      await semana(page);
      const antes = await horasALaVista(page);
      // Verde por vacío no: el panel sembrado es un estudio nuevo y el aviso tiene que estar.
      const cerrar = page.getByRole('button', { name: 'Ocultar esta ayuda' });
      await expect(cerrar).toBeVisible();
      await cerrar.click();
      await expect.poll(() => horasALaVista(page)).toBeGreaterThan(antes + 0.3);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    });

    test('los botones de la cabecera van en una sola fila', async ({ page }) => {
      await semana(page);
      const filas = new Set<number>();
      for (const nombre of [/^Seleccionar varias$/, /^Semana$/, /^Hoy$/, /Nueva clase/, /Clase recurrente/]) {
        const caja = await page.getByRole('button', { name: nombre }).first().boundingBox();
        filas.add(Math.round((caja!.y + caja!.height / 2) / 8));
      }
      expect(filas.size, 'filas de botones').toBe(1);
    });
  });
}

test.describe('En un monitor ancho', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('filtros y métricas comparten fila', async ({ page }) => {
    await semana(page);
    const buscar = await page.getByPlaceholder('Buscar clase...').boundingBox();
    const clases = await page.getByText('esta semana', { exact: true }).boundingBox();
    expect(Math.abs((buscar!.y + buscar!.height / 2) - (clases!.y + clases!.height / 2)), 'misma fila').toBeLessThan(40);
  });
});
