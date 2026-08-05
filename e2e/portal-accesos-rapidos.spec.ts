import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// Accesos rápidos del Inicio — la diferencia más visible entre los 3 temas de
// la galería (lib/theme-variantes.ts). Se comprueba la GEOMETRÍA real con
// boundingBox(), no clases CSS: lo que rompería a un estudio existente es que
// la variante por defecto dejara de medir lo que mide hoy, y eso una clase no
// lo dice.
//
// El primer test es la RED DE SEGURIDAD de todos los demás: sin `variantes`,
// esto tiene que seguir siendo exactamente lo de siempre.

test.describe('Inicio — accesos rápidos por variante', () => {
  test('sin variantes (todo estudio sin tema): 4 filas de 68 px y ningún encabezado', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });

    const enlaces = page.getByRole('link', { name: 'Mis reservas' });
    await expect(enlaces).toHaveCount(1);
    const caja = await enlaces.first().boundingBox();
    expect(caja!.height).toBeCloseTo(68, 0);
    // El encabezado solo existe en rejilla/círculos.
    await expect(page.getByRole('heading', { name: 'Mis accesos rápidos' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Accesos rápidos' })).toHaveCount(0);
  });

  test('rejilla (Oliva/Bloom): los 4 en la misma fila, con su encabezado en primera persona', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { accesosRapidos: 'rejilla' } });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: 'Mis accesos rápidos' })).toBeVisible({ timeout: 30_000 });

    const cajas = await Promise.all(
      ['Mis reservas', 'Mi progreso', 'Notificaciones', 'El equipo'].map(async (n) => {
        const l = page.getByRole('link', { name: new RegExp(`^${n}:`) });
        await expect(l).toHaveCount(1);
        return (await l.boundingBox())!;
      }),
    );
    // Misma `y` = de verdad están en rejilla, no apilados.
    for (const c of cajas) expect(c.y).toBeCloseTo(cajas[0].y, 0);
    for (const c of cajas) expect(c.height).toBeCloseTo(104, 0);
  });

  test('círculos (Noir): círculo de 58 px y el texto FUERA del círculo', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { accesosRapidos: 'circulos' } });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: 'Accesos rápidos' })).toBeVisible({ timeout: 30_000 });

    const enlace = page.getByRole('link', { name: /^Mis reservas:/ });
    const circulo = enlace.locator('span').first();
    const c = (await circulo.boundingBox())!;
    expect(c.width).toBeCloseTo(58, 0);
    expect(c.height).toBeCloseTo(58, 0);
    // El texto va debajo, no dentro: su `y` empieza pasado el círculo.
    const texto = (await enlace.getByText('Mis reservas').boundingBox())!;
    expect(texto.y).toBeGreaterThan(c.y + c.height - 1);
  });

  // Un test por variante, con página limpia: `montarPortal` registra rutas con
  // page.route, así que llamarlo tres veces sobre la MISMA página las apila y
  // la tercera navegación acaba en ERR_ABORTED.
  for (const variante of ['filas', 'rejilla', 'circulos'] as const) {
    test(`los 4 destinos no cambian con la variante "${variante}" — cambia la forma, no a dónde llevan`, async ({ page }) => {
      await montarPortal(page, { conSesion: true, variantes: { accesosRapidos: variante } });
      await page.goto(`/portal/${SLUG}/home`);
      await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });
      // Acotado al bloque: varios de estos destinos salen también en la barra
      // inferior, así que buscar el href a secas encontraría dos.
      const bloque = page.locator('[data-bloque-sistema="accesosRapidos"]');
      for (const seg of ['reservas', 'progreso', 'notificaciones', 'instructores']) {
        await expect(bloque.locator(`a[href="/portal/${SLUG}/${seg}"]`)).toHaveCount(1);
      }
    });
  }
});
