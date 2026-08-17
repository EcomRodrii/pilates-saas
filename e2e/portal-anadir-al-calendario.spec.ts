import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// §6 — La alumna tiene que poder llevarse su reserva a SU calendario.
//
// Se prueba sobre `/portal/[slug]/reservas`, que es la pantalla que abre una
// socia de verdad. No sobre el kit de temas (`components/portal-tema/`): ese
// hoy solo se pinta en vistas previas —`/portal-tema-preview` y la del editor—
// y ninguna ruta viva lo monta, así que un test allí saldría verde sin que
// ninguna alumna viera nada.
//
// ⚠️ Y no confundirlo con la integración Google Calendar del ESTUDIO: esa
// vuelca la agenda del negocio en la cuenta de la propietaria y no pone ni una
// clase en el calendario de su alumna.
// ─────────────────────────────────────────────────────────────────────────────

test('una reserva futura ofrece Google Calendar y el calendario del dispositivo', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/reservas`);

  await expect(page.getByRole('link', { name: /Google Calendar/ }).first())
    .toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Mi calendario/ }).first()).toBeVisible();
});

test('el enlace lleva la clase de verdad, con la hora en UTC', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/reservas`);

  const href = await page.getByRole('link', { name: /Google Calendar/ }).first()
    .getAttribute('href', { timeout: 30_000 });
  const u = new URL(href!);
  expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(u.searchParams.get('action')).toBe('TEMPLATE');
  // El nombre de la clase, no un genérico.
  expect(u.searchParams.get('text')).toBeTruthy();
  expect(u.searchParams.get('text')).not.toBe('Clase');
  // En UTC (`...Z`) y con las dos puntas: sin eso la clase sale corrida de hora
  // en un móvil configurado en otro huso, que es el fallo que nadie reporta
  // porque parece cosa del teléfono.
  expect(u.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  // Y el sitio, para que se pueda tocar y abrir el mapa.
  expect(u.searchParams.get('location')).toBeTruthy();
});

test('es un enlace de verdad, no un botón con onClick', async ({ page }) => {
  // Tiene que poder abrirse en pestaña nueva y anunciarse como enlace a un
  // lector de pantalla. Y `noopener noreferrer` porque sale del portal de una
  // alumna hacia un tercero.
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/reservas`);

  const enlace = page.getByRole('link', { name: /Google Calendar/ }).first();
  await expect(enlace).toBeVisible({ timeout: 30_000 });
  await expect(enlace).toHaveAttribute('target', '_blank');
  await expect(enlace).toHaveAttribute('rel', /noopener/);
  await expect(enlace).toHaveAttribute('rel', /noreferrer/);
});
