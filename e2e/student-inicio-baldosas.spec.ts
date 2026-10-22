import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Las cuatro baldosas de Inicio, copia de la maqueta de los cuatro iPhones (fundador, 19-oct-2026: «copia exacta»):
// Reservar · Mi plan · Comunidad · Mis favoritos. Sustituyen a las del 7-oct (Comunidad · Instructoras · Chat ·
// Favoritos); Instructoras y el chat con el estudio siguen en Perfil y en la ficha de cada clase.

test.describe.configure({ timeout: 150_000 });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const INICIO = `/portal/${SLUG}`;
const CONVERSACIONES = '/api/public/mensajeria/conversaciones';

const baldosas = (page: Page) => page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');

test('las cuatro baldosas de la maqueta, en su orden, y cada una lleva a su sitio', async ({ page }) => {
  const a = await sembrarSociaCompleta(page, { posts: 1 });
  await page.goto(INICIO);

  await expect(baldosas(page)).toHaveCount(4, { timeout: 60_000 });
  await expect(baldosas(page)).toHaveText(['Reservar', 'Mi plan', 'Comunidad', 'Mis favoritos']);
  await expect(baldosas(page).nth(0)).toHaveAttribute('href', `${INICIO}/reservar`);
  await expect(baldosas(page).nth(1)).toHaveAttribute('href', `${INICIO}/bonos`);
  await expect(baldosas(page).nth(2)).toHaveAttribute('href', `${INICIO}/comunidad`);
  await expect(baldosas(page).nth(3)).toHaveAttribute('href', `${INICIO}/reservar?filtro=Favoritas`);

  // Que ningún título parta en dos líneas a 390 px (la maqueta las pinta en una).
  for (const titulo of ['Reservar', 'Mi plan', 'Comunidad', 'Mis favoritos']) {
    const t = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByText(titulo, { exact: true });
    const alto = await t.evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(Math.round(alto), `«${titulo}» parte en dos líneas`).toBe(1);
  }

  // Comunidad: el tablón del estudio.
  await baldosas(page).nth(2).click();
  await expect(page).toHaveURL(`${INICIO}/comunidad`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Comunidad' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Publicación 1 del estudio.')).toBeVisible();
  expect(a.llamadas()['/api/public/comunidad/posts']).toBeGreaterThan(0);

  await page.goto(INICIO);
  await baldosas(page).nth(1).click();
  await expect(page).toHaveURL(`${INICIO}/bonos`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Mi plan' })).toBeVisible({ timeout: 30_000 });

  await page.goto(INICIO);
  await baldosas(page).nth(3).click();
  await expect(page).toHaveURL(`${INICIO}/reservar?filtro=Favoritas`, { timeout: 30_000 });
  expect(a.sinMockear()).toEqual([]);
});

test('Inicio no pide ni las conversaciones ni el tablón al cargar', async ({ page }) => {
  const a = await sembrarSociaCompleta(page);
  await page.goto(INICIO);
  await expect(baldosas(page)).toHaveCount(4, { timeout: 60_000 });
  // Con el saludo ya pintado y los datos de Inicio cargados (las baldosas salen con ellos).
  await expect(page.getByRole('heading', { name: /^Hola/ })).toBeVisible({ timeout: 30_000 });
  expect(a.llamadas()[CONVERSACIONES] ?? 0).toBe(0);
  expect(a.llamadas()['/api/public/comunidad/posts'] ?? 0).toBe(0);
  expect(a.sinMockear()).toEqual([]);
});
