import { test, expect } from '@playwright/test';

// Cuando el estudio no se puede LEER (la base no contesta), el layout de la app
// de la alumna lanza. Un `error.tsx` no recoge los errores del layout de su
// propio segmento, así que antes el fallo subía hasta `app/global-error.tsx`:
// la pantalla genérica oscura de la web («Algo se ha roto»), que dentro de la
// app de iOS parece que se ha roto la app entera. Ahora lo recoge
// `app/portal/error.tsx` con la pantalla de la app y su «Volver a intentarlo».
//
// El fallo se provoca en el SERVIDOR (`page.route` no llega ahí) con la palanca
// por slug de `lib/studio-seo.ts`: `tentare-no-disponible` = «no se ha podido
// leer», nunca «no existe».

test.describe('Student PWA · el estudio no se puede cargar', () => {
  test.describe.configure({ timeout: 90_000 });

  test('sale la pantalla de la app con «Volver a intentarlo», no la genérica de la web', async ({ page }) => {
    await page.goto('/portal/tentare-no-disponible', { waitUntil: 'domcontentloaded' });

    const pantalla = page.getByTestId('error-portal');
    await expect(pantalla).toBeVisible({ timeout: 60_000 });
    await expect(pantalla.getByRole('heading', { name: 'No hemos podido cargar esta pantalla' })).toBeVisible();
    await expect(pantalla.getByRole('button', { name: 'Volver a intentarlo' })).toBeVisible();
    // Con la ropa de la app (student.css cargado aunque el layout que lo carga
    // haya fallado): el contenedor de la app y su tipografía.
    await expect(page.locator('.student-app').filter({ has: pantalla })).toHaveCount(1);
    // Y la de `global-error` no aparece.
    await expect(page.getByText('Algo se ha roto')).toHaveCount(0);
  });
});
