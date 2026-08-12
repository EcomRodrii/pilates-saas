import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Feature #2 (ficha Lorari-vs-Tentare): autoservicio de plaza fija. Antes,
// "Plaza fija" en Bonos era una tarjeta de SOLO LECTURA (staff la gestionaba
// desde la ficha de la socia); ahora la propia socia puede pausar/reanudar/
// dar de baja su hueco semanal desde aquí mismo.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Bonos: autoservicio de plaza fija', () => {
  test('pausar la plaza fija activa cambia el botón a "Reanudar" (optimista)', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.route('**/api/public/plaza-fija', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    // `postPublico` re-sincroniza con /api/public/studio-data en su `finally`
    // — el mock de esa ruta es estático (sigue devolviendo ACTIVA pase lo que
    // pase), así que sin retrasarla el resync pisaría el optimismo antes de
    // que el test llegue a verlo. `route.fallback()` deja pasar la respuesta
    // real de montarPortal, solo más tarde.
    await page.route('**/api/public/studio-data', async route => {
      await new Promise(r => setTimeout(r, 1000));
      await route.fallback();
    });
    await page.goto(`/portal/${SLUG}/bonos`);

    await expect(page.getByText('Plaza fija', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pausar' }).click();

    // Optimista: no hace falta esperar la respuesta del servidor para verlo.
    await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible();
    await expect(page.getByText('En pausa', { exact: true })).toBeVisible();
  });

  test('dar de baja pide confirmación antes de aplicarse', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    let peticiones = 0;
    await page.route('**/api/public/plaza-fija', route => {
      peticiones++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto(`/portal/${SLUG}/bonos`);

    await expect(page.getByRole('button', { name: 'Dar de baja' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Dar de baja' }).click();

    // Todavía no se ha aplicado: sigue viendo el diálogo, no la confirmación.
    await expect(page.getByText('¿Dar de baja tu plaza fija?')).toBeVisible();
    expect(peticiones).toBe(0);

    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByText('¿Dar de baja tu plaza fija?')).toHaveCount(0);
    expect(peticiones).toBe(0);
  });

  test('confirmar la baja la envía y muestra el aviso', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.route('**/api/public/plaza-fija', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    await page.goto(`/portal/${SLUG}/bonos`);

    await page.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByRole('button', { name: 'Sí, dar de baja' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sí, dar de baja' }).click();

    await expect(page.getByText('Plaza fija dada de baja.')).toBeVisible({ timeout: 30_000 });
  });

  test('un rechazo del servidor al reanudar revierte el estado optimista', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.route('**/api/public/plaza-fija', route =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ese sitio ya no está libre en ese horario — contacta con el estudio' }) }));
    await page.goto(`/portal/${SLUG}/bonos`);

    await page.getByRole('button', { name: 'Pausar' }).click();
    // El rechazo llega tras el resync de studio-data (mismo mock, sigue ACTIVA):
    // el botón vuelve a "Pausar" y se ve el aviso de error.
    await expect(page.getByText('Ese sitio ya no está libre en ese horario — contacta con el estudio')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  });
});
