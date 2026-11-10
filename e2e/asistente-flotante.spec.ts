import { test, expect } from '@playwright/test';
import { ir } from './panel-sembrado';
import { recolectarScripts } from './recolector-scripts';
import { HUELLA_DEL_CHAT, json, conAsistente } from './asistente-andamiaje';
import { PLAN_INFO, planMinimoPara } from '../lib/billing/entitlements.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El chat flotante de «Pregúntale a Tentare» y la salida del Centro de Control
// sin plan (8-oct-2026).
//
// Los estudios decían que «no les dejaba entrar» al Centro de Control: con el
// plan Founding Studio o la prueba vencida la pantalla decía «No hemos podido
// cargar…» con un «Reintentar» inútil, y como la puerta principal del asistente
// era la barra DENTRO de esa pantalla, tampoco llegaban a Tentare. Ahora el
// asistente tiene un botón flotante en todas las pantallas del panel, y el
// Centro de Control sin plan explica por qué y a dónde ir.
//
// Cada caso cuenta sus peticiones: un «no pasó nada» sin intento no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const flotante = (page: import('@playwright/test').Page) => page.getByTestId('chat-asistente-flotante');

const panel = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Ayuda de Tentare' });

// 11-nov-2026: el botón del asistente ya no flota aparte. Hay UN botón de ayuda en la esquina y
// Tentare vive dentro de su panel, como pestaña (fundador: «no deben de estar los 2 separados»).
test('un solo botón en cualquier pantalla: Tentare está dentro de su panel, y el chat no viaja antes de abrir su pestaña', async ({ page }) => {
  const scripts = recolectarScripts(page);
  const n = await conAsistente(page);
  await ir(page, 'calendario');
  const boton = page.getByTestId('boton-ayuda');
  await expect(boton).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('asistente-flotante')).toHaveCount(0);
  expect(n.disponible).toBeGreaterThan(0);
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(false);

  await boton.click();
  await expect(panel(page)).toBeVisible({ timeout: 60_000 });
  // Con el panel abierto y sin entrar en «Tentare», el chat sigue sin descargarse.
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(false);
  await panel(page).getByRole('tab', { name: 'Tentare' }).click();
  await expect(flotante(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(true);
  // Sigue en la misma pantalla: no ha navegado.
  await expect(page).toHaveURL(/\/calendario/);

  await flotante(page).getByLabel('Preguntas de ejemplo').getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
  await expect.poll(() => n.preguntas).toBe(1);
  await expect(flotante(page).getByTestId('chat-respuesta')).toContainText('Mañana tienes 5 clases');

  // Escape cierra el panel y el botón sigue ahí.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(boton).toBeVisible();
});

test('lo que se escribe en Inicio lo contesta el asistente, en su pestaña', async ({ page }) => {
  const n = await conAsistente(page);
  await ir(page, 'calendario');
  await page.getByTestId('boton-ayuda').click({ timeout: 30_000 });
  await panel(page).getByLabel('Pregúntale a Tentare', { exact: true }).fill('¿Qué clases hay mañana?');
  await panel(page).getByRole('button', { name: 'Preguntar' }).click();
  await expect(panel(page).getByRole('tab', { name: 'Tentare' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => n.preguntas, { timeout: 60_000 }).toBe(1);
  await expect(flotante(page).getByTestId('chat-respuesta')).toContainText('Mañana tienes 5 clases');
});

test('«Abrir en pantalla completa» lleva a /asistente y ahí no hay botón flotante', async ({ page }) => {
  await conAsistente(page);
  await ir(page, 'calendario');
  await page.getByTestId('boton-ayuda').click({ timeout: 30_000 });
  await panel(page).getByRole('tab', { name: 'Tentare' }).click();
  await page.getByRole('link', { name: 'Abrir en pantalla completa' }).click();
  await expect(page).toHaveURL(/\/asistente$/, { timeout: 30_000 });
  await expect(page.getByTestId('chat-asistente')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('boton-ayuda')).toHaveCount(0);
});

test('sin asistente para el estudio, o sin rol, el botón de ayuda sigue pero sin la pestaña «Tentare»', async ({ page }) => {
  const apagado = await conAsistente(page, { disponible: false });
  await ir(page, 'calendario');
  await expect.poll(() => apagado.disponible, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.getByTestId('boton-ayuda').click({ timeout: 30_000 });
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('tab', { name: 'Tentare' })).toHaveCount(0);
  await expect(panel(page).getByRole('tab')).toHaveCount(4);
});

test('Centro de Control sin plan: explica el porqué y da salida, sin «Reintentar»', async ({ page }) => {
  await conAsistente(page);
  let intentos = 0;
  await page.route((u) => u.pathname === '/api/decisiones', (r) => {
    intentos++;
    return json(r, { error: 'Tu plan no incluye el Centro de Control' }, 403);
  });
  await ir(page, 'centro-de-control');
  const pantalla = page.getByTestId('centro-no-incluido');
  await expect(pantalla).toBeVisible({ timeout: 30_000 });
  expect(intentos).toBeGreaterThan(0);
  // El plan que lo incluye sale del entitlement (Founding Studio desde el 15-oct-2026).
  await expect(pantalla.getByRole('heading')).toContainText(`El Centro de Control es del plan ${PLAN_INFO[planMinimoPara('decisiones') ?? 'ESTUDIO'].nombre}`);
  await expect(pantalla.getByRole('link', { name: 'Ver planes y precios' })).toHaveAttribute('href', '/suscripcion');
  await expect(pantalla.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  await expect(page.getByText('No hemos podido cargar el Centro de Control')).toHaveCount(0);
  // Lo que SÍ pueden usar: el asistente, desde la propia pantalla.
  await expect(pantalla.getByRole('button', { name: 'Pregúntale a Tentare' })).toBeVisible();
});
