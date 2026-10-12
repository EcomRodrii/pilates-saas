import { test, expect } from '@playwright/test';
import { abrirClaseConReservas } from './calendario-clase-con-reservas';

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar una clase cuando la sesión no vuelve al bono de alguna alumna
// (P0.3, 12-oct-2026). La clase sí se cancela, pero hay algo que revisar a mano
// —que una clienta no ha recuperado lo que pagó—, y eso no puede salir con el ✓
// verde de «todo bien» durante 3 segundos: sale en rojo, como `alert`, 8 s.
//
// Con contador: se exige que la devolución SÍ se intentara.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

test('la sesión no vuelve al bono: «Clase cancelada» sale en rojo y dice qué revisar', async ({ page }) => {
  const { cuerposDevolver } = await abrirClaseConReservas(page, { status: 500, cuerpo: { error: 'No se ha podido devolver el bono.' } });
  await page.getByRole('button', { name: 'Más acciones de la clase' }).click({ timeout: 30_000 });
  await page.getByRole('menu', { name: 'Más acciones de la clase' }).getByRole('menuitem', { name: /Cancelar esta clase/ }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /cancelar (la )?clase|sí, cancelar/i }).click();

  await expect.poll(() => cuerposDevolver.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const aviso = page.getByRole('alert').filter({ hasText: 'No hemos podido devolver la sesión al bono' });
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(aviso).toContainText('Clase cancelada');
  await expect(page.getByRole('status').filter({ hasText: 'No hemos podido devolver' })).toHaveCount(0);
});
