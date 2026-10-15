import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// En un móvil de 375 px, con el panel nuevo, dos sitios se apretaban: las
// tarjetas de Mensajería cortaban su título («Notificacione…») y la cabecera de
// «Quién me debe» en Cobros dejaba el título en una columna de una palabra por
// línea por el botón de al lado. Se mide la caja de cada uno.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 375, height: 812 } });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await ir(page, ruta);
}

test('Mensajería: el título de cada tarjeta cabe entero en su tarjeta', async ({ page }) => {
  await abrir(page, 'mensajeria');
  const pestanas = page.getByRole('tablist', { name: 'Mensajería' }).getByRole('tab');
  await expect(pestanas.first()).toBeVisible({ timeout: 30_000 });
  const n = await pestanas.count();
  expect(n).toBeGreaterThan(2);
  for (let i = 0; i < n; i++) {
    const tarjeta = pestanas.nth(i);
    const desborda = await tarjeta.evaluate((el) => {
      const caja = el.getBoundingClientRect();
      const titulo = el.querySelector('span > span') as HTMLElement;
      const r = titulo.getBoundingClientRect();
      return titulo.scrollWidth > titulo.clientWidth + 1 || r.right > caja.right - 8;
    });
    expect(desborda, `la tarjeta ${i + 1} corta su título`).toBe(false);
  }
});

test('Cobros: «Quién me debe» no se queda en una columna estrecha por el botón', async ({ page }) => {
  await abrir(page, 'cobros');
  const titulo = page.getByRole('heading', { name: 'Quién me debe' });
  await expect(titulo).toBeVisible({ timeout: 30_000 });
  const caja = (await titulo.boundingBox())!;
  // En una línea: el alto de una línea de 16 px, no dos.
  expect(caja.height, `«Quién me debe» ocupa ${caja.height} px de alto`).toBeLessThan(26);
});
