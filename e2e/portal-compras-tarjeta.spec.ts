import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Método de pago — tarjeta guardada, en el portal CLÁSICO.
//
// Antes esto solo existía en `components/portal-tema/` (el kit de temas), que
// `esTemaPortal()` apagó para siempre (`themes/registro.ts`). El test original
// (`e2e/portal-tarjeta.spec.ts`, borrado en esa migración) probaba la hoja del
// kit; este es su equivalente sobre `/portal/[slug]/compras`, reutilizando el
// mismo backend (`app/api/public/tarjeta`, `/api/stripe/setup-tarjeta`) que
// nunca dejó de funcionar — solo estaba desconectado de cualquier pantalla.
//
// El test que más importa es el del CONTADOR: sin él, «tarjeta quitada» sale
// verde con el servidor sin enterarse, y la socia se queda creyendo que ya no
// se le puede cobrar. Ver `.claude/tentare-os.md`.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test.describe('Portal (clásico) — tarjeta guardada', () => {
  test('quitar la tarjeta pide confirmación y avisa de las consecuencias', async ({ page }) => {
    const intentos: string[] = [];
    await montarPortal(page, { conSesion: true, conTarjeta: true });
    await page.route('**/api/public/tarjeta', async (route) => {
      intentos.push(route.request().method());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByText(/4242/)).toBeVisible({ timeout: 30_000 });

    // Un solo toque NO la quita: primero avisa de qué implica.
    await page.getByRole('button', { name: 'Quitar esta tarjeta' }).click();
    await expect(page.getByText(/renovaciones automáticas dejarán de cobrarse/i)).toBeVisible();
    expect(intentos).toHaveLength(0);

    await page.getByRole('button', { name: /Sí, quitar la tarjeta/ }).click();
    // ⚠️ Sin esto, el test pasaría con el servidor sin enterarse de nada.
    await expect.poll(() => intentos.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(intentos[0]).toBe('DELETE');
  });

  test('se explica para qué se usa la tarjeta', async ({ page }) => {
    // §14: faltaba decirlo. Sin inventar comportamiento — son los cobros que
    // este repo hace de verdad.
    await montarPortal(page, { conSesion: true, conTarjeta: true });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByText(/se usa para cobrar los bonos y las cuotas/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/nunca guardamos el número/i)).toBeVisible();
  });

  test('sin tarjeta, se puede añadir una', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByRole('button', { name: 'Añadir' })).toBeVisible({ timeout: 30_000 });
    // Y no se ofrece quitar lo que no hay.
    await expect(page.getByRole('button', { name: 'Quitar esta tarjeta' })).toHaveCount(0);
  });
});
