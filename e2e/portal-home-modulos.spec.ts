import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del editor de temas: reordenar/ocultar módulos de Inicio del portal.
// Verifica el lado de CONSUMO (app/portal/[slug]/home/page.tsx) — el lado del
// editor (dashboard) se verifica en e2e/apariencia-inicio-portal.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inicio del portal — módulos reordenables/ocultables', () => {
  test('sin portalHome configurado, se ve todo en el orden de siempre', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
    await expect(page.getByText('Trae a quien quieras')).toBeVisible();
  });

  test('un módulo oculto (Invita a una amiga) no aparece', async ({ page }) => {
    await montarPortal(page, { conSesion: true, portalHome: { orden: [], ocultos: ['invitarAmiga'] } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });
    // El resto de módulos sigue ahí — solo se oculta el elegido.
    await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
    // `hidden` deja el nodo en el DOM (display:none), así que toHaveCount(0)
    // no sirve aquí como sí sirve con getByRole (que respeta accesibilidad) —
    // se comprueba visibilidad, no ausencia del DOM.
    await expect(page.getByText('Trae a quien quieras')).not.toBeVisible();
  });

  test('ocultar Esta semana no afecta al saludo ni a la tarjeta grande (quedan fuera del sistema)', async ({ page }) => {
    await montarPortal(page, { conSesion: true, portalHome: { orden: [], ocultos: ['estaSemana'] } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu próxima clase')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Esta semana' })).toHaveCount(0);
    await expect(page.getByText('Trae a quien quieras')).toBeVisible();
  });

  test('reordenar pone "Invita a una amiga" antes que "Esta semana" visualmente', async ({ page }) => {
    await montarPortal(page, { conSesion: true, portalHome: { orden: ['invitarAmiga', 'estaSemana'], ocultos: [] } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });
    const invitar = page.getByText('Trae a quien quieras');
    const semana = page.getByRole('heading', { name: 'Esta semana' });
    await expect(invitar).toBeVisible();
    await expect(semana).toBeVisible();
    const [yInvitar, ySemana] = await Promise.all([
      invitar.evaluate(el => el.getBoundingClientRect().top),
      semana.evaluate(el => el.getBoundingClientRect().top),
    ]);
    expect(yInvitar).toBeLessThan(ySemana);
  });
});
