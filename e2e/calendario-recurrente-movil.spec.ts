import { test, expect, type Locator, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Crear clases recurrentes» cabe en un móvil.
//
// El fundador lo describió como «0 responsive, muy a lo ancho». Medido a 375 px
// antes del arreglo: el diálogo iba de borde a borde de la pantalla (x = 0,
// 375 px de ancho) porque su `max-w-lg` pisaba el `max-w` del componente base,
// que es el que deja 1rem de margen a cada lado; «Crear» y «Cancelar» estaban al
// final del formulario, a dos pantallas de scroll; los días de la semana medían
// 36 px y los campos iban a 14 px, que en iOS amplía la página al enfocarlos.
//
// Nada de eso falla en un test que solo busca el formulario: se mide.
// ⚠️ Playwright no reproduce ni el zoom de iOS ni su teclado. Esto no sustituye
// abrirlo en un iPhone.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

async function abrir(page: Page): Promise<Locator> {
  await montar(page);
  await ir(page, 'calendario');
  await page.getByRole('button', { name: /Clase recurrente/ }).click({ timeout: 60_000 });
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText('Crear clases recurrentes')).toBeVisible();
  // Entra escalando: se mide cuando ha llegado.
  await page.waitForTimeout(400);
  return dialogo;
}

/** Márgenes del diálogo, desbordes y controles que se salen de su caja. */
const geometria = (page: Page) => page.evaluate(() => {
  const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const caja = d.getBoundingClientRect();
  const fuera = [...d.querySelectorAll<HTMLElement>('input, select, button, [role="group"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < caja.left - 0.5 || r.right > caja.right + 0.5);
    })
    .map((el) => `${el.tagName.toLowerCase()} «${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24)}»`);
  // El propio diálogo y sus tres piezas (cabecera, formulario, botones).
  const deLado = [d, ...Array.from(d.children)].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
  return {
    izquierda: Math.round(caja.left),
    derecha: Math.round(window.innerWidth - caja.right),
    pagina: document.documentElement.scrollWidth - window.innerWidth,
    fuera,
    deLado,
  };
});

const VISTAS = [
  { nombre: 'móvil 375×812', uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, tactil: true },
  { nombre: 'móvil pequeño 320×568', uso: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, tactil: true },
  { nombre: 'iPad 768×1024', uso: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, tactil: true },
  { nombre: 'portátil 1280×720', uso: { viewport: { width: 1280, height: 720 } }, tactil: false },
] as const;

for (const vista of VISTAS) {
  test.describe(`Clases recurrentes en ${vista.nombre}`, () => {
    test.use(vista.uso);

    test('cabe sin salirse de lado y deja margen a los lados', async ({ page }) => {
      await abrir(page);
      const g = await geometria(page);
      expect(g.izquierda, 'margen izquierdo del diálogo').toBeGreaterThanOrEqual(16);
      expect(g.derecha, 'margen derecho del diálogo').toBeGreaterThanOrEqual(16);
      expect(g.pagina, 'la página se sale de lado').toBeLessThanOrEqual(0);
      expect(g.deLado, 'el diálogo tiene scroll lateral').toBe(0);
      expect(g.fuera, `\n${g.fuera.join('\n')}\n`).toEqual([]);
    });

    test('los siete días van en una fila y se tocan con el dedo', async ({ page }) => {
      const dialogo = await abrir(page);
      const dias = dialogo.getByRole('group', { name: 'Días de la semana' }).getByRole('button');
      await expect(dias).toHaveCount(7);
      const cajas = await Promise.all((await dias.all()).map((d) => d.boundingBox()));
      expect(new Set(cajas.map((c) => Math.round(c!.y))).size, 'los días parten en dos filas').toBe(1);
      if (vista.tactil) {
        for (const c of cajas) expect(c!.height, 'alto de un día').toBeGreaterThanOrEqual(44);
      }
      const martes = dialogo.getByRole('button', { name: 'Martes' });
      await expect(martes).toHaveAttribute('aria-pressed', 'false');
      await martes.click();
      await expect(martes).toHaveAttribute('aria-pressed', 'true');
    });

    test('«Crear» y «Cancelar» se ven sin bajar hasta el final, y siguen ahí al bajar', async ({ page }) => {
      const dialogo = await abrir(page);
      const crear = dialogo.getByRole('button', { name: /^Crear/ });
      const cancelar = dialogo.getByRole('button', { name: 'Cancelar' });
      await expect(crear).toBeInViewport({ ratio: 1 });
      await expect(cancelar).toBeInViewport({ ratio: 1 });
      // Al fondo del formulario (el aforo es el último campo).
      await dialogo.getByLabel('Aforo máximo').scrollIntoViewIfNeeded();
      await expect(crear).toBeInViewport({ ratio: 1 });
      if (vista.tactil) {
        expect((await crear.boundingBox())!.height, 'alto de «Crear»').toBeGreaterThanOrEqual(44);
      }
    });

    if (vista.tactil) {
      test('con el dedo, ningún campo por debajo de 16 px (iOS amplía la página al enfocarlo)', async ({ page }) => {
        await abrir(page);
        const pequenos = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="dialog"] input, [role="dialog"] select')]
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => `${(el as HTMLInputElement).type} ${getComputedStyle(el).fontSize}`));
        expect(pequenos).toEqual([]);
      });
    }
  });
}
