import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La intro del logo: una cortina delante de la página que vende.
//
// El montaje en sí es CSS y no se prueba aquí (que una curva de easing "se vea
// bien" no lo dice un test). Lo que sí se fija es todo aquello por lo que una
// cortina puede arruinar una landing:
//
//   · que no se quede             — se retira sola, y también con un gesto.
//   · que no salga a quien vuelve — se recuerda 30 días.
//   · que no salga a quien pidió  — `prefers-reduced-motion`.
//     menos movimiento
//   · que no esté en el HTML      — Google y los lectores de pantalla tienen
//                                   que recibir la landing, no la cortina.
//
// Cada uno de esos puntos es un fallo que no se nota en local y sí en la cara
// de un visitante.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'tentare:intro-vista';
const SEL_PIEZA = 'div[aria-hidden="true"] img[src^="/logo-piezas/"]';
const cortina = (page: Page) => page.locator('div[aria-hidden="true"]').filter({ has: page.locator('img[src^="/logo-piezas/"]') });

/**
 * Entra y CAZA la cortina.
 *
 * La espera se arma ANTES de navegar, a propósito: la intro dura ~3s y se
 * quita sola, así que un `expect(...).toBeVisible()` lanzado después de
 * `goto()` llega tarde de vez en cuando —comprobado: fallaba 1 de cada 3
 * ejecuciones—. Un test que pasa según le pille el reloj no protege nada.
 */
async function entrarYCazarLaCortina(page: Page): Promise<number> {
  const aparece = page.waitForSelector(SEL_PIEZA, { state: 'attached', timeout: 30_000 });
  await page.goto('/');
  await aparece;
  // Devuelve el reloj de la página en el momento en que la cortina ya existe.
  // Es la referencia buena: medir desde el inicio de la navegación mete dentro
  // la compilación del servidor de desarrollo, que en frío se lleva segundos.
  return page.evaluate(() => performance.now());
}

test.describe('La intro del logo', () => {
  test('se ve la primera vez, con sus cuatro piezas', async ({ page }) => {
    await entrarYCazarLaCortina(page);
    const c = cortina(page);
    // Cuatro: asta, bol y las dos hojas. Si alguna no cargara, el logo se
    // montaría incompleto y nadie se enteraría.
    await expect(c.locator('img[src^="/logo-piezas/"]')).toHaveCount(4);
  });

  test('se quita sola: nadie se queda mirando una cortina', async ({ page }) => {
    await entrarYCazarLaCortina(page);
    // El montaje dura ~2,5s y luego se disuelve. Con margen de sobra, pero
    // finito: si se quedara, este test lo diría.
    await expect(cortina(page)).toHaveCount(0, { timeout: 15_000 });
    // Y la landing está debajo, viva.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('un gesto la salta', async ({ page }) => {
    const nacio = await entrarYCazarLaCortina(page);
    // Un respiro para que React enganche los oyentes de gesto.
    await page.waitForTimeout(200);

    // Se mide con el reloj DE LA PÁGINA y desde que nació la cortina. Antes
    // medía con el del test y la latencia del round-trip hacía que la ventana
    // se solapara con la salida natural: el test pasaba incluso quitando los
    // oyentes de gesto — no probaba lo que decía.
    const alHacerClic = await page.evaluate(() => performance.now());
    const vividos = alHacerClic - nacio;
    expect(vividos, 'hay que hacer clic pronto para que esto demuestre algo').toBeLessThan(900);

    await page.mouse.click(400, 300);
    await expect(cortina(page)).toHaveCount(0, { timeout: 900 });
    // Como mucho 900 + 900 = 1800 ms de vida, y sola no se va hasta ~2900 ms:
    // si ha desaparecido, la ha quitado el clic.
  });

  test('a quien ya la vio no se le repite', async ({ page }) => {
    await entrarYCazarLaCortina(page);
    await expect(cortina(page)).toHaveCount(0, { timeout: 15_000 });

    // Segunda visita: nada. Es la diferencia entre un detalle de marca y una
    // peaje que se paga en cada visita.
    await page.goto('/?segunda=1');
    await page.waitForLoadState('networkidle');
    await expect(cortina(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('quien pide menos movimiento no la ve', async ({ page }) => {
    // No es un adorno: son 60px de desenfoque animados.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(cortina(page)).toHaveCount(0);
    // Y no se marca como vista: si mañana quita el ajuste, la verá.
    const marca = await page.evaluate(k => window.localStorage.getItem(k), CLAVE);
    expect(marca, 'no debe consumir la única vez que se enseña').toBeNull();
  });

  test('no viaja en el HTML del servidor', async ({ page }) => {
    // Lo que reciben Google y los lectores de pantalla es la landing. Se mira
    // la respuesta cruda, no el DOM ya hidratado.
    const res = await page.request.get('/');
    const html = await res.text();
    expect(html).not.toContain('logo-piezas');
    expect(html.toLowerCase()).toContain('pilates');
  });
});
