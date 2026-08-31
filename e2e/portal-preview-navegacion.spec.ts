process.env.HOME_PREVIEW_TOKEN_SECRET = 'e2e-test-home-preview-secret';

import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { firmarTokenPreviewHome } from '../lib/theme/home-preview-token.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El fundador probó el editor de temas en tiempo real y reportó (2026-08-19):
// «no puedo navegar / no puedo volver atrás / páginas que dejan de funcionar»
// dentro del preview.
//
// Causa raíz encontrada: `PortalNav` (la barra de abajo) construía sus
// enlaces con `/portal/${slug}/...` a pelo, SIEMPRE — el mismo componente que
// usa el portal real, sin distinguir que aquí estaba montado dentro de
// `/portal-preview`. Un clic en cualquier pestaña sacaba al iframe del árbol
// de preview (que deliberadamente no lleva sesión) hacia el portal real, que
// sin sesión manda a `/login` — un callejón sin salida y sin "atrás", porque
// dentro del marco de móvil no hay chrome de navegador.
//
// Esta prueba ata justo eso: clicar una pestaña DENTRO de `/portal-preview`
// tiene que quedarse en `/portal-preview`, nunca aterrizar en `/login`.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

test.setTimeout(120_000);

// Locator estable de "Inicio ya cargó": el saludo dejó de ser el texto fijo
// "Hola, {nombre}" (ver portal-home-view.tsx) — este botón se pinta siempre,
// sin importar el caso de la tarjeta grande ni la hora.
const inicioCargado = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

test.describe('La navegación dentro del preview del editor se queda dentro del preview', () => {
  // ⚠️ La barra ya no tiene "Clases" ni "Bonos" como pestañas propias — se
  // fusionaron en una sola, "Reservas" (lib/portal-nav.ts, reconstrucción
  // "Tentare Studio App"). El destino cambia, pero lo que este test protege
  // (no salir de /portal-preview al navegar) es exactamente lo mismo.
  test('clicar "Reservas" en la barra no saca del árbol /portal-preview', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}?t=${token}`);
    await inicioCargado(page);

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Reservas' }).click();

    // ⚠️ Lo importante: la URL sigue bajo /portal-preview, NUNCA /portal a
    // secas (que redirigiría a /login sin sesión). Y sigue llevando el token
    // — sin él, la propia ruta de Reservas lo habría rechazado también.
    await expect(page).toHaveURL(new RegExp(`/portal-preview/${SLUG}/reservas\\?t=`));
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toHaveCount(0);
  });

  test('clicar "Reservas" y luego "Hoy" — ida y vuelta, sin quedarse varado', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}?t=${token}`);
    await inicioCargado(page);

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await nav.getByRole('link', { name: 'Reservas' }).click();
    await expect(page).toHaveURL(new RegExp(`/portal-preview/${SLUG}/reservas\\?t=`));

    await nav.getByRole('link', { name: 'Hoy' }).click();
    await expect(page).toHaveURL(new RegExp(`/portal-preview/${SLUG}(\\?t=|$)`));
    await inicioCargado(page);
  });

  // ⚠️ Bug encontrado AL VERIFICAR el arreglo de arriba en el navegador, no
  // por lectura de código: Inicio vive en la RAÍZ de `/portal-preview/[slug]`
  // (no en un `/home` — esa sub-ruta no existe), así que el cálculo de "qué
  // pestaña está activa" (`pathname.startsWith('.../home')`,
  // `portal-preview-marco.tsx`) nunca casaba ahí. Al volver a Inicio desde
  // cualquier otra pantalla, NINGUNA pestaña quedaba marcada — visible como
  // un pellizco de animación a medio desvanecer en la pestaña anterior.
  test('al volver a Inicio, la pestaña Hoy queda marcada — ninguna otra', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}?t=${token}`);
    await inicioCargado(page);

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await nav.getByRole('link', { name: 'Perfil' }).click();
    await page.waitForTimeout(500);
    await nav.getByRole('link', { name: 'Hoy' }).click();
    await inicioCargado(page);

    await expect(nav.getByRole('link', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page');
    // "Buscar" no lleva `aria-current` en absoluto: es un botón que abre un
    // overlay, no una ruta (ver components/portal/portal-nav.tsx) — solo los
    // otros dos enlaces pueden competir por la marca de activo.
    for (const otra of ['Reservas', 'Perfil']) {
      await expect(nav.getByRole('link', { name: otra })).not.toHaveAttribute('aria-current', 'page');
    }
  });
});
