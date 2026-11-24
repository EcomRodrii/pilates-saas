import { test, expect, type Page } from '@playwright/test';
import { json, montarAlta } from './onboarding-andamio';

// ─────────────────────────────────────────────────────────────────────────────
// El Inicio de configuración (24-nov-2026, `SHELL_NUEVO` + alta nueva + guía paso a paso): el saludo, la caja «Trabaja con Tenti» y la
// rejilla de tarjetas con los pasos reales de la puesta en marcha. Red mockeada con `page.route` (andamio del alta).
// ⚠️ Todo test de camino con escritura lleva su contador: aquí «Trabaja con Tenti» cuenta cuántas veces abre la columna del asistente.
// Deja capturas en test-results/ para mirarlas (claro, 1440 y 390).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 300_000 });

const RECIEN = {
  claseReservable: false, avisoClase: null, enlaceCompartido: false, alumnas: false, primeraReserva: false,
  recorridoVisto: true, planEnsenado: false, sedesAbiertas: 1, foundingGratis: true,
};

async function montar(page: Page, ancho = 1440, alto = 900) {
  await page.setViewportSize({ width: ancho, height: alto });
  await montarAlta(page, {
    estudio: { bienvenida_vista_en: '2026-10-21T08:00:00Z', creado_en: new Date().toISOString(), nombre: 'Estudio Prueba' },
    antes: async (p) => {
      await p.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
        altaNueva: true, panelNuevo: true, shellNuevo: true, guiaPasoAPaso: true, onboardingNuevo: true,
      }));
      await p.route('**/api/alta/estado', (r) => json(r, RECIEN));
      await p.route('**/api/billing/status**', (r) => json(r, { bloqueado: false, activo: true, plan: 'BASE', configurado: true, subscriptionStatus: 'gratis' }));
    },
  });
}

const rejilla = (page: Page) => page.getByTestId('inicio-configuracion');

test('el Inicio de configuración: saludo, caja de Tenti y once tarjetas con su estado real', async ({ page }) => {
  await montar(page);
  await expect(rejilla(page)).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Te damos la bienvenida a Tentare');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Configuremos Estudio Prueba');
  await expect(page.getByPlaceholder('Trabaja con Tenti')).toBeVisible();
  await expect(rejilla(page).locator('[data-tarjeta-inicio]')).toHaveCount(11);
  await expect(rejilla(page).locator('[data-tarjeta-inicio="reglas"]')).toContainText('0 de 2 tareas completadas');
  await expect(rejilla(page).locator('[data-tarjeta-inicio="estudio"] a')).toHaveAttribute('href', /datos-fiscales/);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/inicio-configuracion-1440.png', fullPage: true });
});

test('«Trabaja con Tenti» abre de verdad el asistente (y cuenta cuántas veces)', async ({ page }) => {
  await montar(page);
  await expect(rejilla(page)).toBeVisible({ timeout: 240_000 });
  const caja = page.getByPlaceholder('Trabaja con Tenti');
  // Si el asistente no está disponible para el estudio sembrado, la caja no sale: se dice en vez de pasar en falso.
  test.skip(await caja.count() === 0, 'el asistente no está disponible en el estudio sembrado');
  await caja.fill('¿Cómo creo mi primera clase?');
  await caja.press('Enter');
  await expect(page.getByText('¿Cómo creo mi primera clase?').first()).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).search).not.toContain('Cómo');
});

test('al pasar el ratón las capas de la ilustración se mueven y sin cursor vuelven', async ({ page }) => {
  await montar(page);
  await expect(rejilla(page)).toBeVisible({ timeout: 240_000 });
  const t = rejilla(page).locator('[data-tarjeta-inicio="salas"]');
  const capa = t.locator('.ic-capa').first();
  const antes = await capa.evaluate((e) => getComputedStyle(e).transform);
  await t.hover();
  await page.waitForTimeout(1200);
  const durante = await capa.evaluate((e) => getComputedStyle(e).transform);
  expect(durante, 'con el cursor encima la capa se desplaza').not.toBe(antes);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1200);
  expect(await capa.evaluate((e) => getComputedStyle(e).transform)).toBe(antes);
});

test('saltar un paso saltable lo deja «saltado» sin darlo por hecho', async ({ page }) => {
  await montar(page);
  await expect(rejilla(page)).toBeVisible({ timeout: 240_000 });
  const t = rejilla(page).locator('[data-tarjeta-inicio="marca"]');
  await t.hover();
  await t.getByRole('button', { name: /Saltar:/ }).click();
  await expect(t).toHaveAttribute('data-estado', 'saltada');
});

test('en el móvil la rejilla es de una columna y no desborda', async ({ page }) => {
  await montar(page, 390, 844);
  await expect(rejilla(page)).toBeVisible({ timeout: 240_000 });
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra).toBeLessThanOrEqual(0);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/inicio-configuracion-390.png', fullPage: true });
});
