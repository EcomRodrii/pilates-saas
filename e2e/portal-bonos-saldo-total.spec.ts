import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Los bonos se acumulan, y el saldo que se enseñaba era el del bono EN CURSO.
//
// Una socia con 17 sesiones repartidas en cuatro bonos leía «8 de 10» en Bonos
// y «8/10» en su Perfil: el del que está gastando ahora. No era falso, pero no
// respondía a lo que había ido a mirar —cuántas clases le quedan— y hacía
// parecer que había perdido sesiones pagadas. La cola, además, era un párrafo
// que había que leer entero para sacar algo que es una tabla.
//
// El mock `variosBonos`: 8+4+0+5 = 17 sesiones de 10+5+5+5 = 25.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('El saldo que se enseña es el TOTAL, no el del bono en curso', () => {
  test('Bonos: el titular suma todos los bonos', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variosBonos: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('de 25 sesiones disponibles')).toBeVisible();
    // El 17 es el saldo real; el 8 del bono en curso ya no manda en el titular.
    await expect(page.getByText('17', { exact: true })).toBeVisible();
  });

  test('Bonos: la cola es una lista con su fracción, no un párrafo', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variosBonos: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    await expect(page.getByText('Tus bonos (4)')).toBeVisible({ timeout: 30_000 });

    // Cada bono con su propia fracción.
    await expect(page.getByText('8/10')).toBeVisible();
    await expect(page.getByText('4/5')).toBeVisible();
    await expect(page.getByText('5/5')).toBeVisible();
    // El agotado sigue en la lista: lo pagó.
    await expect(page.getByText('0/5')).toBeVisible();
    await expect(page.getByText('Sin sesiones')).toBeVisible();
    // Y se dice cuál se gasta primero, que es lo que explica el orden.
    await expect(page.getByText('· en curso')).toBeVisible();
    // El titular deja de llevar el nombre de UN bono encima del total de todos.
    await expect(page.getByText('Tu saldo')).toBeVisible();
    // Y la fecha de arriba se marca como la del primero, sin repetir el verbo.
    await expect(page.getByText(/El primero caduca en \d+ días/)).toBeVisible();
    await expect(page.getByText(/caduca: Caduca/i)).toHaveCount(0);

    // El párrafo viejo ya no existe.
    await expect(page.getByText(/bonos? más en cola/)).toHaveCount(0);
  });

  test('Perfil: la tarjeta enseña el saldo total y en cuántos bonos está', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variosBonos: true });
    await page.goto(`/portal/${SLUG}/perfil`);
    await expect(page.getByText('Sesiones')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('17/25')).toBeVisible();
    await expect(page.getByText('en 4 bonos')).toBeVisible();
    // Lo que salía antes: la fracción del bono en curso.
    await expect(page.getByText('8/10')).toHaveCount(0);
  });

  test('con un solo bono no cambia nada: ni lista ni "en 1 bono"', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/perfil`);
    await expect(page.getByText('Sesiones')).toBeVisible({ timeout: 30_000 });

    // El mock por defecto tiene un Bono 10 con 8 restantes.
    await expect(page.getByText('8/10')).toBeVisible();
    await expect(page.getByText(/en \d+ bonos/)).toHaveCount(0);
  });

  test('con un solo bono, la pantalla de Bonos no saca la lista', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('de 10 sesiones disponibles')).toBeVisible();
    await expect(page.getByText(/^Tus bonos \(/)).toHaveCount(0);
  });
});
