import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La columna izquierda del calendario en el panel nuevo (interruptor
// `panelNuevo`), como la de Bonsai: el mes en pequeño para saltar a otro día y
// las clases y las instructoras de la semana, cada una con su ojo. Cerrar un ojo
// ATENÚA sus clases (la regla del calendario: nunca se esconden). Sin el
// interruptor, o sin ancho para la columna, el calendario de siempre.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, o: { nuevo: boolean; ancho: number }) {
  await page.setViewportSize({ width: o.ancho, height: 900 });
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo,
  }));
  await ir(page, 'calendario');
  await expect(page.getByTestId('semana-franjas')).toBeVisible({ timeout: 60_000 });
}

const opacidad = (page: Page, quien: string) => page.locator('[data-sesion-id]').filter({ hasText: quien }).first()
  .evaluate(el => getComputedStyle(el).opacity);

test('a la izquierda, el mes y las clases e instructoras de la semana; cerrar un ojo atenúa sus clases', async ({ page }) => {
  await abrir(page, { nuevo: true, ancho: 1440 });
  const columna = page.getByRole('complementary', { name: 'Mes y filtros' });
  await expect(columna).toBeVisible();
  await expect(columna.getByRole('region', { name: 'Clases' })).toBeVisible();
  await expect(columna.getByRole('region', { name: 'Instructoras' })).toBeVisible();
  // La instructora ya no va también en un desplegable arriba: un control, no dos.
  await expect(page.getByLabel('Filtrar por instructora')).toHaveCount(0);

  expect(await opacidad(page, 'Marta Ruiz')).toBe('1');
  await columna.getByRole('button', { name: 'Atenuar las clases de Marta Ruiz' }).click();
  await expect(columna.getByRole('button', { name: 'Resaltar las clases de Marta Ruiz' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => opacidad(page, 'Marta Ruiz')).toBe('0.3');
  expect(await opacidad(page, 'Cloe')).toBe('1');

  await columna.getByRole('button', { name: 'Ver todas las clases' }).click();
  await expect.poll(() => opacidad(page, 'Marta Ruiz')).toBe('1');
});

test('tocar un día del mes pequeño lleva a esa semana', async ({ page }) => {
  await abrir(page, { nuevo: true, ancho: 1440 });
  const columna = page.getByRole('complementary', { name: 'Mes y filtros' });
  const fecha = page.getByTestId('selector-fecha');
  const antes = (await fecha.textContent()) ?? '';
  await columna.getByRole('button', { name: 'Mes siguiente' }).click();
  await columna.getByRole('button', { name: /^15 de / }).click();
  await expect(fecha).not.toHaveText(antes);
});

test('sin el panel nuevo no hay columna', async ({ page }) => {
  await abrir(page, { nuevo: false, ancho: 1440 });
  await expect(page.getByRole('complementary', { name: 'Mes y filtros' })).toHaveCount(0);
  await expect(page.getByLabel('Filtrar por instructora')).toBeVisible();
});

test('sin ancho para la columna, tampoco: la instructora sigue en su desplegable', async ({ page }) => {
  await abrir(page, { nuevo: true, ancho: 1280 });
  await expect(page.getByRole('complementary', { name: 'Mes y filtros' })).toHaveCount(0);
  await expect(page.getByLabel('Filtrar por instructora')).toBeVisible();
});
