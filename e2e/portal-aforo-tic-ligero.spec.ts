import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El tic de REFRESCO_ACTIVO_MS pide el endpoint ligero, no el catálogo entero.
//
// Esta es la regresión de COSTE: antes cada tic era un POST a
// /api/public/studio-data —catálogo completo del estudio más el histórico
// financiero de la socia, varios MB— doce veces por minuto y por pantalla
// abierta. Se espera a que el tic corra de verdad (dos periodos completos)
// porque ningún otro test del portal llega vivo al primero.
//
// La otra mitad del cambio —que la fusión NO borre el historial de la socia—
// se prueba aparte y mejor en lib/portal-aforo.test.ts: aquí haría falta
// navegar a Progreso, y una navegación dura remonta la app y recarga todo,
// con lo que el test pasaría aunque la fusión estuviera rota.
// ─────────────────────────────────────────────────────────────────────────────

const REFRESCO_MS = 5_000;

test.describe('Portal — el tic de aforo es ligero', () => {
  test('el tic pide el endpoint ligero, nunca el catálogo completo', async ({ page }) => {
    const aforo: string[] = [];
    const completo: string[] = [];
    page.on('request', r => {
      if (r.url().includes('/api/public/aforo')) aforo.push(r.url());
      if (r.url().includes('/api/public/studio-data')) completo.push(r.url());
    });

    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: /clases/i }).first()).toBeVisible({ timeout: 30_000 });

    const completoTrasMontar = completo.length;
    await page.waitForTimeout(REFRESCO_MS * 2 + 1_500);

    // El tic tiene que haber corrido...
    expect(aforo.length).toBeGreaterThanOrEqual(2);
    // ...y NO haber vuelto a pedir el catálogo completo ni una sola vez. Esta
    // es la regresión de coste: cada studio-data de más son megabytes y Active
    // CPU de Vercel, doce veces por minuto y por pantalla abierta.
    expect(completo.length, 'el tic no debe pedir /api/public/studio-data').toBe(completoTrasMontar);
  });
});
