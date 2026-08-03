import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Barra inferior de pestaña expandible (icono + texto) + bienvenida a
// pantalla completa antes del login. La barra era antes un look opt-in del
// tema "Editorial" (`tabBarStyle: 'pestanaActiva'"); tras el rediseño de
// 2026-08 (feedback de 49 propietarias) es el ÚNICO look de la barra, sin
// importar el tema — `tabBarStyle` se sigue guardando en el esquema pero
// components/portal/portal-nav.tsx ya no lo lee para decidir el render.
// La bienvenida SÍ sigue gateada por `tabBarStyle: 'pestanaActiva'` (ver
// app/portal/[slug]/login/page.tsx + components/portal/bienvenida-portal.tsx)
// — es una pantalla distinta, sin relación con el look de la barra.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Barra inferior de pestaña expandible', () => {
  test('con tabBarStyle clásico (o sin configurar), la barra igual lleva iconos — ya es el único look', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const inicio = nav.getByRole('link', { name: 'Inicio' });
    await expect(inicio).toBeVisible();
    // La activa lleva icono (svg) además del texto.
    await expect(inicio.locator('svg')).toHaveCount(1);

    // Las inactivas (Clases) llevan icono SIN el nombre visible como texto.
    const clases = nav.locator('a[href$="/clases"]');
    await expect(clases.locator('svg')).toHaveCount(1);
    await expect(clases).not.toContainText('Clases');
  });

  test('con tabBarStyle pestanaActiva, la pestaña activa (Inicio) muestra icono + nombre', async ({ page }) => {
    await montarPortal(page, { conSesion: true, tabBarStyle: 'pestanaActiva' });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const inicio = nav.getByRole('link', { name: 'Inicio' });
    await expect(inicio).toBeVisible();
    await expect(inicio.locator('svg')).toHaveCount(1);

    const clases = nav.locator('a[href$="/clases"]');
    await expect(clases.locator('svg')).toHaveCount(1);
    await expect(clases).not.toContainText('Clases');
  });
});

test.describe('Tema Editorial — bienvenida antes del login', () => {
  test('primera vez en el dispositivo: se ve la bienvenida, no el formulario de login', async ({ page }) => {
    await montarPortal(page, { conSesion: false, tabBarStyle: 'pestanaActiva' });
    await page.goto(`/portal/${SLUG}/login`);

    await expect(page.getByText('Empieza donde estás.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Siguiente/ })).toBeVisible();
    // El formulario de login todavía no está.
    await expect(page.getByPlaceholder('Tu email')).toHaveCount(0);
  });

  test('pulsar "Siguiente" pasa al login y no vuelve a enseñar la bienvenida', async ({ page }) => {
    await montarPortal(page, { conSesion: false, tabBarStyle: 'pestanaActiva' });
    await page.goto(`/portal/${SLUG}/login`);

    await page.getByRole('button', { name: /Siguiente/ }).click({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Tu email')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByPlaceholder('Tu email')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Empieza donde estás.')).toHaveCount(0);
  });

  test('con tema clásico, nunca se ve la bienvenida — va directa al login', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal/${SLUG}/login`);

    await expect(page.getByPlaceholder('Tu email')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Empieza donde estás.')).toHaveCount(0);
  });
});
