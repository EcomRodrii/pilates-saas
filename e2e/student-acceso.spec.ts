import { test, expect } from '@playwright/test';
import { SLUG, sembrarSociaLista } from './socia-lista';

// La puerta de la Student PWA.
//
// Reconstruye parte de lo que se perdió al borrar el portal (45 specs, 179
// casos). Cubre lo que de verdad rompe a una alumna: que la app no la deje
// entrar, o que la deje ver algo sin haber entrado.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · acceso', () => {
  test('sin sesión, la app manda a la puerta y no enseña nada de dentro', async ({ page }) => {
    // Sin sembrar sesión a propósito.
    await page.goto(base);
    await expect(page.getByRole('heading', { name: /hola de nuevo/i })).toBeVisible({ timeout: 30_000 });
    // Y nada del interior se cuela: ni la nav ni el saludo.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toHaveCount(0);
  });

  test('la puerta ofrece las tres vías: contraseña, enlace y Google', async ({ page }) => {
    await page.goto(`${base}/acceso/login`);
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Contraseña')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
    // La segunda puerta: quien entró por enlace y nunca eligió contraseña.
    await expect(page.getByRole('button', { name: /no tengo contraseña/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible();
  });

  test('hay salida hacia crear cuenta y hacia recuperar contraseña', async ({ page }) => {
    // Es el callejón que tenía el portal viejo: enlazaba a una pantalla de
    // crear contraseña que no existía y devolvía a la misma página.
    await page.goto(`${base}/acceso/login`);
    await page.getByRole('link', { name: /crear cuenta/i }).click();
    await expect(page.getByRole('heading', { name: /crea tu cuenta/i })).toBeVisible({ timeout: 30_000 });

    await page.goto(`${base}/acceso/login`);
    await page.getByRole('link', { name: /has olvidado la contraseña/i }).click();
    await expect(page).toHaveURL(/\/acceso\/recuperar/);
  });

  test('con sesión, la app entra y pinta la nav', async ({ page }) => {
    await sembrarSociaLista(page);
    await page.goto(base);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('navigation')).toBeVisible();
  });
});
