import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// PERFIL — la octava y última pantalla del prototipo. El diseño la convierte en
// un índice de filas, así que lo que hay que fijar es que NADA de lo que se
// editaba antes se haya quedado por el camino, y las cuatro decisiones que se
// apartan del lienzo a propósito.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Perfil', () => {
  test.beforeEach(async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/perfil`);
    await expect(page.getByRole('heading', { name: /Marta/ })).toBeVisible({ timeout: 30_000 });
  });

  test('la cabecera dice quién eres y desde cuándo', async ({ page }) => {
    await expect(page.getByText('Socia desde enero de 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar tu foto' })).toBeVisible();
  });

  test('las tarjetas de estadística resumen lo contratado', async ({ page }) => {
    // Antes eran chips de texto ("Plaza fija · miércoles", "Bono 10 activo");
    // ahora son tarjetas con el número por delante (Fase 2, feedback de 49
    // propietarias). El mock trae 12 asistencias, un bono de 10 con 8
    // restantes y plaza fija los miércoles.
    await expect(page.getByText('Clases asistidas')).toBeVisible();
    await expect(page.getByText('12', { exact: true })).toBeVisible();
    await expect(page.getByText('Sesiones', { exact: true })).toBeVisible();
    await expect(page.getByText('8/10')).toBeVisible();
    await expect(page.getByText('Plaza fija', { exact: true })).toBeVisible();
    await expect(page.getByText('miércoles', { exact: true })).toBeVisible();
  });

  test('NO hay ficha de salud', async ({ page }) => {
    // Decisión de producto: el portal no guarda datos de salud.
    await expect(page.getByText(/[Ff]icha de salud/)).toHaveCount(0);
  });

  test('«Mis datos» abre la hoja con el formulario entero', async ({ page }) => {
    await page.getByRole('button', { name: 'Mis datos' }).click();
    for (const campo of ['Nombre', 'Apellidos', 'Email', 'Calle, número, ciudad']) {
      await expect(page.getByPlaceholder(campo)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
  });

  test('el interruptor día/noche sigue estando, aunque el lienzo no lo dibuje', async ({ page }) => {
    // Es un switch, no una fila que navega: se declara como tal y enseña su
    // estado en vez de una flecha que no lleva a ningún sitio.
    const modo = page.getByRole('switch', { name: /Aspecto/ });
    await expect(modo).toBeVisible();
    await expect(modo).toHaveAttribute('aria-checked', 'false');
    await expect(modo).toContainText('Día');
    await modo.click();
    await expect(modo).toHaveAttribute('aria-checked', 'true');
    await expect(modo).toContainText('Noche');
  });

  test('«El estudio» informa, y no promete una flecha que no lleva a nada', async ({ page }) => {
    const fila = page.getByText('El estudio').locator('..');
    await expect(fila).toContainText('Marbella');
    await expect(fila).not.toContainText('→');
  });

  test('el pie lleva el nombre del estudio, no el nuestro', async ({ page }) => {
    // Marca blanca: la clienta entra a su estudio, no a Tentare.
    await expect(page.getByText('Estudio Alma', { exact: true })).toBeVisible();
    await expect(page.getByText('TENTARE', { exact: true })).toHaveCount(0);
  });

  test('«Métodos de pago» lleva a Compras', async ({ page }) => {
    await page.getByRole('button', { name: 'Métodos de pago' }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/compras$`));
  });
});
