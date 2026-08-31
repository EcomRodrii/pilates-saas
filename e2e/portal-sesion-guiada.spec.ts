import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Sesión guiada: cronómetro de cliente sobre 4 ejercicios fijos
// (lib/sesion-guiada.ts), alcanzable desde la ficha de una clase CONFIRMADA.
// Sin vídeo, sin servidor — no toca /ondemand ni el "Vídeos" del portal
// (feature-freeze de VOD, lib/frozen-features.ts).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Sesión guiada', () => {
  test('con la clase confirmada, el botón lleva al cronómetro', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases/ses-1`);

    await expect(page.getByRole('button', { name: 'Empezar la sesión guiada' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Empezar la sesión guiada' }).click();

    // Timeout largo: es una navegación cliente (router.push) a una ruta que el
    // servidor de dev todavía no había compilado — la primera visita tarda.
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/clases/ses-1/sesion-guiada$`), { timeout: 30_000 });
    // .last(): durante la transición entre pantallas (portal-shell.tsx), la
    // pantalla saliente queda montada un instante junto a la entrante — con
    // ambas mostrando el mismo texto justo tras navegar, el nodo que persiste
    // es el último en el DOM (la pantalla saliente se pinta primero).
    await expect(page.getByText('Ejercicio 1 de 4').last()).toBeVisible();
    await expect(page.getByText('Flexión lateral sentada').last()).toBeVisible();
    // El cronómetro arranca en 50 y cuenta atrás cada segundo desde el montaje
    // (setInterval real, sin mock) — para cuando llega esta comprobación ya
    // puede haber bajado de "00:50", así que se verifica el FORMATO, no el
    // valor exacto de un instante que ya pasó.
    await expect(page.getByText(/^00:\d{2}$/).last()).toBeVisible();
  });

  test('sin plaza reservada (lista de espera), no hay botón de sesión guiada', async ({ page }) => {
    // ses-2 no está reservada por Marta en el mock — no hay `miReserva`.
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases/ses-2`);

    await expect(page.getByRole('button', { name: /^Reservar|Unirme a la lista de espera/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Empezar la sesión guiada' })).toHaveCount(0);
  });

  test('siguiente avanza de ejercicio; en el último, el control pasa a "Terminar"', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases/ses-1/sesion-guiada`);

    await expect(page.getByText('Ejercicio 1 de 4')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Siguiente ejercicio').click();
    await expect(page.getByText('Ejercicio 2 de 4')).toBeVisible();
    await expect(page.getByText('Puente de hombros')).toBeVisible();

    await page.getByLabel('Siguiente ejercicio').click();
    await page.getByLabel('Siguiente ejercicio').click();
    await expect(page.getByText('Ejercicio 4 de 4')).toBeVisible();
    await expect(page.getByText('Estiramiento de columna')).toBeVisible();
    await expect(page.getByLabel('Siguiente ejercicio')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Terminar' })).toBeVisible();
  });

  test('el botón atrás sale de la sesión sin dejar la tab bar flotante encima', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    // Se llega por click desde la ficha de la clase, no por goto directo: así
    // hay una entrada real en el historial para que router.back() vuelva a
    // algo (con goto directo, "atrás" cae fuera de la app).
    await page.goto(`/portal/${SLUG}/clases/ses-1`);
    await page.getByRole('button', { name: 'Empezar la sesión guiada' }).click();

    await expect(page.getByText('Ejercicio 1 de 4').last()).toBeVisible({ timeout: 30_000 });
    // La tab bar del portal no debe verse durante la sesión guiada — pantalla
    // completa, mismo criterio que /login (ver isFullscreen en portal-shell.tsx).
    await expect(page.getByRole('link', { name: 'Inicio' })).toHaveCount(0);

    await page.getByLabel('Salir de la sesión guiada').last().click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/clases/ses-1$`), { timeout: 30_000 });
  });
});
