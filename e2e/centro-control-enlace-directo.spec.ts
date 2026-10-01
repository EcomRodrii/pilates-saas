import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Llegar al Centro de Control a por algo concreto.
//
// El detalle del Centro está plegado por defecto (El Umbral: un mensaje al día y
// el resto cuando se pide). Pero quien llega desde la ficha de una clienta, con
// su aviso delante, sí lo está pidiendo: antes aterrizaba con todo plegado y
// tenía que buscarla a mano entre todas las situaciones.
//   · `?rec=<id>`  → abre el detalle, baja hasta esa situación y la resalta;
//   · `?detalle=1` → abre el detalle (el «Ver y decidir» del Resumen);
//   · sin nada     → sigue plegado.
// Se lee una vez y se quita de la dirección: volver o recargar no lo repite.
//
// Andamiaje: `panel-sembrado.ts`. Bea Ortega (soc-4) tiene la recomendación
// «rec-2», que NO es la del mensaje del día (esa es «rec-1»).
// ─────────────────────────────────────────────────────────────────────────────

const botonDetalle = (page: Page) => page.getByRole('button', { name: /todo el detalle/ });

test('desde la ficha de la clienta, «Ver en el Centro de Control» lleva a SU situación, abierta y resaltada', async ({ page }) => {
  await montar(page);
  await ir(page, 'clientas/soc-4');
  const enlace = page.getByRole('link', { name: 'Ver en el Centro de Control' });
  await expect(enlace).toHaveAttribute('href', '/centro-de-control?rec=rec-2', { timeout: 30_000 });
  await enlace.click();

  const situacion = page.locator('[data-recomendacion="rec-2"]');
  await expect(situacion).toBeVisible({ timeout: 30_000 });
  await expect(situacion).toHaveAttribute('data-resaltada', 'true');
  await expect(situacion).toContainText('Bea Ortega lleva 6 semanas sin venir');
  await expect(botonDetalle(page)).toHaveAttribute('aria-expanded', 'true');
  // Se quita de la dirección: recargar no vuelve a buscarla.
  await expect(page).toHaveURL(/\/centro-de-control$/);
});

test('si esa situación ya no está pendiente, se dice (no se abre sin más)', async ({ page }) => {
  await montar(page);
  await ir(page, 'centro-de-control?rec=rec-que-ya-no-esta');
  await expect(page.getByText('Esa situación ya no está pendiente: se resolvió o el Centro de Control la retiró.')).toBeVisible({ timeout: 30_000 });
});

test('«?detalle=1» abre la lista entera; sin nada, sigue plegada', async ({ page }) => {
  await montar(page);
  await ir(page, 'centro-de-control?detalle=1');
  await expect(botonDetalle(page)).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
  await expect(page.locator('[data-recomendacion="rec-2"]')).toBeVisible();

  await ir(page, 'centro-de-control');
  await expect(botonDetalle(page)).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 });
  await expect(page.locator('[data-recomendacion]')).toHaveCount(0);
});

// En el build de producción, el router de Next puede devolver la dirección con
// la búsqueda de la primera visita al volver a la misma ruta (ver la memoria del
// repo sobre `?tab=`): si pasara, volver al Centro por el menú reabriría y
// buscaría otra vez. Se comprueba volviendo por el menú.
test('volver al Centro por el menú después de un enlace directo lo abre plegado, como siempre', async ({ page }) => {
  await montar(page);
  await ir(page, 'centro-de-control?rec=rec-2');
  await expect(page.locator('[data-recomendacion="rec-2"]')).toHaveAttribute('data-resaltada', 'true', { timeout: 30_000 });

  await page.getByRole('link', { name: 'Resumen', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page.getByRole('link', { name: 'Centro de Control', exact: true }).first().click();
  await expect(page).toHaveURL(/\/centro-de-control$/, { timeout: 30_000 });
  await expect(botonDetalle(page)).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 });
  await expect(page.getByText('Esa situación ya no está pendiente')).toHaveCount(0);
});
