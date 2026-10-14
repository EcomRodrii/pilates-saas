import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El buscador (⌘K) con el teclado, como el de Bonsai: ↑↓ mueven por los
// resultados y ↵ abre el marcado (el primero en cuanto se escribe). Antes el pie
// decía «↵ abrir» y no hacía nada: había que coger el ratón.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

async function abrirBuscador(page: Page) {
  await montar(page);
  await ir(page, 'dashboard');
  await page.getByRole('button', { name: /Qué quieres hacer o buscar/ }).first().click({ timeout: 30_000 });
  const input = page.getByPlaceholder('¿Qué quieres hacer? O busca una clienta, clase o pago…');
  await expect(input).toBeVisible();
  return input;
}

const marcado = (page: Page) => page.locator('button[data-resultado][data-activo]');

test('escribir y pulsar Intro abre el primero, aunque la búsqueda no haya llegado todavía', async ({ page }) => {
  const input = await abrirBuscador(page);
  // Sin esperar a los resultados (van con 150 ms de retraso): no debe abrir uno de lo de antes.
  await input.pressSequentially('Calendario', { delay: 0 });
  await input.press('Enter');
  await expect(page).toHaveURL(/\/calendario/, { timeout: 30_000 });
});

test('las flechas mueven la marca por los resultados e Intro abre el marcado', async ({ page }) => {
  const input = await abrirBuscador(page);
  await input.fill('Cobros');
  await expect(page.getByRole('button', { name: /^Cobros$/ })).toBeVisible();
  await expect(marcado(page)).toHaveCount(1);
  await expect(marcado(page)).toHaveText(/^Cobros/);

  await input.press('ArrowDown');
  await expect(marcado(page)).toHaveCount(1);
  await expect(marcado(page)).not.toHaveText(/^Cobros$/);
  await input.press('ArrowUp');
  await expect(marcado(page)).toHaveText(/^Cobros/);

  await input.press('Enter');
  await expect(page).toHaveURL(/\/cobros/, { timeout: 30_000 });
});

test('con la caja vacía no hay nada marcado, e Intro no abre nada, hasta usar las flechas', async ({ page }) => {
  const input = await abrirBuscador(page);
  await expect(page.locator('button[data-resultado]').first()).toBeVisible();
  await expect(marcado(page)).toHaveCount(0);
  // Intro sin nada marcado no abre nada por su cuenta.
  await input.press('Enter');
  await expect(input).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/);
  await input.press('ArrowDown');
  await expect(marcado(page)).toHaveCount(1);
  // ↑ desde el primero da la vuelta al último.
  await input.press('ArrowUp');
  const ultimo = page.locator('button[data-resultado]').last();
  await expect(ultimo).toHaveAttribute('data-activo', '');
});
