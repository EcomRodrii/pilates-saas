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
    // El saludo cambió de "Hola, {nombre}" a saludo-por-hora + titular (que
    // depende de la hora a la que corra la suite) — se usa un elemento
    // siempre presente en Inicio, sin importar variante, para esperar a que
    // haya cargado antes de comprobar lo que este test realmente verifica:
    // el look de la barra inferior.
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    // La pestaña de Inicio se llama "Hoy" desde la reconstrucción "Tentare
    // Studio App" (lib/portal-nav.ts, NAV_DEFAULT) — "Inicio" ya no existe.
    const inicio = nav.getByRole('link', { name: 'Hoy' });
    await expect(inicio).toBeVisible();
    // La activa lleva icono (svg) además del texto.
    await expect(inicio.locator('svg')).toHaveCount(1);

    // Las inactivas (Reservas — fusión de Clases+Bonos) llevan icono SIN el
    // nombre visible como texto.
    const reservas = nav.locator('a[href$="/reservas"]');
    await expect(reservas.locator('svg')).toHaveCount(1);
    await expect(reservas).not.toContainText('Reservas');
  });

  test('con tabBarStyle pestanaActiva, la pestaña activa (Hoy) muestra icono + nombre', async ({ page }) => {
    await montarPortal(page, { conSesion: true, tabBarStyle: 'pestanaActiva' });
    await page.goto(`/portal/${SLUG}/home`);
    // Mismo motivo que el test anterior: locator estable, no el saludo.
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const inicio = nav.getByRole('link', { name: 'Hoy' });
    await expect(inicio).toBeVisible();
    await expect(inicio.locator('svg')).toHaveCount(1);

    const reservas = nav.locator('a[href$="/reservas"]');
    await expect(reservas.locator('svg')).toHaveCount(1);
    await expect(reservas).not.toContainText('Reservas');
  });
});

// ⚠️ La bienvenida se decidía en /login y ahora vive en /acceso: con la puerta
// única nadie aterriza en /login, se llega siempre desde el paso 1. Si esto
// vuelve a apuntar a /login, el test pasaría por el sitio equivocado — /login
// sin email redirige al paso 1, así que acabaría comprobando /acceso de todas
// formas, pero por accidente y con una navegación de más.
test.describe('Tema Editorial — bienvenida antes de la puerta', () => {
  test('primera vez en el dispositivo: se ve la bienvenida, no el formulario de login', async ({ page }) => {
    await montarPortal(page, { conSesion: false, tabBarStyle: 'pestanaActiva' });
    await page.goto(`/portal/${SLUG}/acceso`);

    await expect(page.getByText('Empieza donde estás.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Siguiente/ })).toBeVisible();
    // El formulario de login todavía no está.
    await expect(page.getByPlaceholder('tu@email.com')).toHaveCount(0);
  });

  test('pulsar "Siguiente" pasa a la puerta (paso intro) y no vuelve a enseñar la bienvenida', async ({ page }) => {
    await montarPortal(page, { conSesion: false, tabBarStyle: 'pestanaActiva' });
    await page.goto(`/portal/${SLUG}/acceso`);

    // Tras la bienvenida, /acceso aterriza en el paso `intro` de la puerta
    // reconstruida (816f4971) — no directo al login. Desde ahí, "Ya tengo
    // cuenta" sigue llevando al formulario de siempre.
    await page.getByRole('button', { name: /Siguiente/ }).click({ timeout: 30_000 });
    await expect(page.getByText('Muévete. Lo demás, ya está.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Empieza donde estás.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 30_000 });

    // Tras recargar, la bienvenida ya no vuelve (localStorage) — aterriza otra
    // vez en `intro`, no se queda en el paso `login` (cada carga recalcula el
    // paso desde la ruta).
    await page.reload();
    await expect(page.getByText('Muévete. Lo demás, ya está.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Empieza donde estás.')).toHaveCount(0);
  });

  test('con tema clásico, nunca se ve la bienvenida — va directa a la puerta y desde ahí al login', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal/${SLUG}/acceso`);

    await expect(page.getByText('Muévete. Lo demás, ya está.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Empieza donde estás.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 30_000 });
  });
});
