import { test, expect } from '@playwright/test';
import { ir } from './panel-sembrado';
import { recolectarScripts } from './recolector-scripts';
import { HUELLA_DEL_CHAT, json, conAsistente } from './asistente-andamiaje';

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

test('el botón flotante está en cualquier pantalla y abre el chat sin salir de ella; el chat no viaja antes del clic', async ({ page }) => {
  const scripts = recolectarScripts(page);
  const n = await conAsistente(page);
  await ir(page, 'calendario');
  const boton = page.getByTestId('asistente-flotante');
  await expect(boton).toBeVisible({ timeout: 30_000 });
  expect(n.disponible).toBeGreaterThan(0);
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(false);

  await boton.click();
  await expect(page.getByRole('dialog', { name: 'Pregúntale a Tentare' })).toBeVisible({ timeout: 60_000 });
  await expect(flotante(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(true);
  // Sigue en la misma pantalla: no ha navegado.
  await expect(page).toHaveURL(/\/calendario/);

  await flotante(page).getByLabel('Preguntas de ejemplo').getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
  await expect.poll(() => n.preguntas).toBe(1);
  await expect(flotante(page).getByTestId('chat-respuesta')).toContainText('Mañana tienes 5 clases');

  // Escape cierra la ventana y el botón sigue ahí.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pregúntale a Tentare' })).toHaveCount(0);
  await expect(boton).toBeVisible();
});

test('«Abrir en pantalla completa» lleva a /asistente y ahí no hay botón flotante', async ({ page }) => {
  await conAsistente(page);
  await ir(page, 'calendario');
  await page.getByTestId('asistente-flotante').click();
  await page.getByRole('link', { name: 'Abrir en pantalla completa' }).click();
  await expect(page).toHaveURL(/\/asistente$/, { timeout: 30_000 });
  await expect(page.getByTestId('chat-asistente')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('asistente-flotante')).toHaveCount(0);
});

test('sin asistente para el estudio, o sin rol, no se pinta el botón', async ({ page }) => {
  const apagado = await conAsistente(page, { disponible: false });
  await ir(page, 'calendario');
  await expect.poll(() => apagado.disponible, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('asistente-flotante')).toHaveCount(0);
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
  await expect(pantalla.getByRole('heading')).toContainText('El Centro de Control es del plan Estudio');
  await expect(pantalla.getByRole('link', { name: 'Ver planes y precios' })).toHaveAttribute('href', '/suscripcion');
  await expect(pantalla.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  await expect(page.getByText('No hemos podido cargar el Centro de Control')).toHaveCount(0);
  // Lo que SÍ pueden usar: el asistente, desde la propia pantalla.
  await expect(pantalla.getByRole('button', { name: 'Pregúntale a Tentare' })).toBeVisible();
});
