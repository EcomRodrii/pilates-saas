import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Primeros pasos» flotante con el panel nuevo (15-oct-2026): nunca se abre sola.
// Fuera de la home es una píldora; se abre al tocarla, solo para esa pantalla; la X
// la recoge; y nunca tapa un formulario ni un botón de la pantalla. Antes salía
// abierta en todas y se comía el «Siguiente» de Widgets o el campo y el botón de
// «Contenido de tu app».
//
// Estudio sembrado (con tareas de arranque por hacer). Sin el interruptor no hay
// tarjeta flotante: lo vigila `panel-nuevo-*` y el resto de specs sin panel nuevo.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 420_000 });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, ancho: number, alto: number) {
  await page.setViewportSize({ width: ancho, height: alto });
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  // Estudio con el arranque a medias: sin ninguna reserva todavía («Recibe tu primera reserva»
  // queda por hacer). Con todo hecho, la lista flotante no sale.
  await page.route('**/rest/v1/reservas**', (r) => json(r, []));
  await ir(page, ruta);
}

const pildora = (page: Page) => page.getByRole('button', { name: /Abrir «Primeros pasos»/ });
const tarjeta = (page: Page) => page.locator('[data-primeros-pasos-lista]');

/** Controles de la pantalla que la píldora tapa de verdad (vacío = bien). */
async function loQueTapa(page: Page) {
  return page.evaluate(() => {
    const flota = document.querySelector('[data-primeros-pasos-pildora]');
    if (!flota) return ['sin píldora'];
    const r = flota.getBoundingClientRect();
    const tapados: string[] = [];
    for (const el of Array.from(document.querySelectorAll('button, a[href], input, textarea, select, [role="button"]'))) {
      if (flota.contains(el)) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (!(b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top)) continue;
      const x = (Math.max(b.left, r.left) + Math.min(b.right, r.right)) / 2;
      const y = (Math.max(b.top, r.top) + Math.min(b.bottom, r.bottom)) / 2;
      const encima = document.elementFromPoint(x, y);
      if (encima && flota.contains(encima)) tapados.push(`${el.tagName} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}»`);
    }
    return tapados;
  });
}

const PANTALLAS = ['calendario', 'clientas', 'cobros', 'productos', 'informes', 'configuracion'];

for (const t of [{ ancho: 1280, alto: 800 }, { ancho: 1440, alto: 900 }, { ancho: 375, alto: 812 }]) {
  for (const ruta of PANTALLAS) {
    test(`a ${t.ancho} px, /${ruta}: es una píldora, no se abre sola y no tapa ningún control`, async ({ page }) => {
      test.setTimeout(420_000);
      await abrir(page, ruta, t.ancho, t.alto);
      await expect(pildora(page)).toBeVisible({ timeout: 300_000 });
      await expect(tarjeta(page)).toHaveCount(0);
      expect(await loQueTapa(page), 'la píldora tapa un control').toEqual([]);
    });
  }
}

test('se abre al tocarla, solo para esa pantalla: al cambiar de pantalla vuelve a ser la píldora', async ({ page }) => {
  await abrir(page, 'clientas', 1440, 900);
  await pildora(page).click();
  await expect(tarjeta(page)).toBeVisible();
  await expect(tarjeta(page).getByRole('heading', { name: 'Primeros pasos' })).toBeVisible();
  // Una tarea de la propia lista lleva a otra pantalla (sin recargar): la lista no la sigue.
  await tarjeta(page).getByRole('link', { name: /Programa tus clases/ }).click();
  await expect(page).toHaveURL(/\/calendario/, { timeout: 60_000 });
  await expect(pildora(page)).toBeVisible({ timeout: 60_000 });
  await expect(tarjeta(page)).toHaveCount(0);
});

test('la X la recoge y, al volver a la pantalla o recargar, no se abre sola', async ({ page }) => {
  await abrir(page, 'clientas', 1440, 900);
  await pildora(page).click();
  await page.getByRole('button', { name: 'Plegar «Primeros pasos»' }).click();
  await expect(pildora(page)).toBeVisible();
  await expect(tarjeta(page)).toHaveCount(0);
  await ir(page, 'clientas');
  await expect(pildora(page)).toBeVisible();
  await expect(tarjeta(page)).toHaveCount(0);
});

test('en la home no sale la flotante: allí está la tarjeta entera', async ({ page }) => {
  await abrir(page, 'dashboard', 1440, 900);
  await expect(page.locator('[data-primeros-pasos-pildora]')).toHaveCount(0);
});

test('en el móvil: la píldora está en la cabecera, la lista cabe en la pantalla y no desborda', async ({ page }) => {
  await abrir(page, 'clientas', 375, 812);
  await expect(pildora(page)).toBeVisible({ timeout: 300_000 });
  await pildora(page).click();
  await expect(tarjeta(page)).toBeVisible();
  const caja = await tarjeta(page).boundingBox();
  expect(caja, 'la lista no mide nada').not.toBeNull();
  expect(caja!.x).toBeGreaterThanOrEqual(0);
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
