import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La intro del logo: una cortina delante de la página que vende.
//
// El montaje en sí es CSS y no se prueba aquí (que una curva de easing "se vea
// bien" no lo dice un test). Lo que sí se fija es todo aquello por lo que una
// cortina puede arruinar una landing:
//
//   · que no se quede             — se retira sola, y también con un gesto.
//   · que salga SIEMPRE           — y, sobre todo, que esté desde el primer
//                                   fotograma: la primera versión se pintaba
//                                   tras hidratar y se veía la web ANTES que
//                                   la cortina.
//   · que no salga a quien pidió  — `prefers-reduced-motion`.
//     menos movimiento
//   · que no esté en el HTML      — Google y los lectores de pantalla tienen
//                                   que recibir la landing, no la cortina.
//
// Cada uno de esos puntos es un fallo que no se nota en local y sí en la cara
// de un visitante.
// ─────────────────────────────────────────────────────────────────────────────

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
    await expect(cortina(page)).toBeHidden({ timeout: 15_000 });
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
    await expect(cortina(page)).toBeHidden({ timeout: 900 });
    // Como mucho 900 + 900 = 1800 ms de vida, y sola no se va hasta ~2900 ms:
    // si ha desaparecido, la ha quitado el clic.
  });

  test('sale también en la segunda visita', async ({ page }) => {
    await entrarYCazarLaCortina(page);
    await expect(cortina(page)).toBeHidden({ timeout: 15_000 });

    // Se enseña siempre, no una vez por visitante.
    await entrarYCazarLaCortina(page);
    await expect(cortina(page)).toBeVisible();
  });

  test('quien pide menos movimiento no la ve', async ({ page }) => {
    // No es un adorno: son 60px de desenfoque animados.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    // Se oculta por CSS (`display: none`), no por JavaScript: así tampoco
    // depende de que el JS llegue.
    await expect(cortina(page)).toBeHidden();
  });

  test('viaja EN el HTML: es lo que quita el flash', async ({ page }) => {
    // El fallo que se vio en producción: la cortina se pintaba tras hidratar,
    // así que primero se veía la web. Si vuelve a salir del HTML, vuelve el
    // flash — por eso se mira la respuesta CRUDA, no el DOM ya hidratado.
    const res = await page.request.get('/');
    const html = await res.text();
    expect(html, 'sin esto, la cortina llega tarde y se ve la web antes').toContain('logo-piezas');
    // Y la landing sigue entera en ese mismo HTML: la cortina va delante, no
    // en lugar de.
    //
    // Se comprueba que hay un <h1> con texto, NO un titular concreto. Esta
    // aserción llevaba clavado el titular del hero y se ha roto dos veces
    // seguidas al reescribirlo — y las dos veces por un cambio de copy
    // perfectamente sano, no por el fallo que este test vigila. Lo que
    // importa aquí es que el HTML del servidor trae la landing y no solo la
    // cortina; el titular exacto es asunto de quien escriba el copy.
    expect(html.toLowerCase()).toContain('pilates');
    expect(html).toMatch(/<h1[^>]*>[^<]*\S/);
  });

  test('se retira aunque no haya JavaScript', async ({ browser }) => {
    // La retirada es CSS (la última keyframe la deja en visibility:hidden).
    // Si dependiera del JS, un fallo de carga dejaría la web tapada.
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    // Mismo motivo que en `entrarYCazarLaCortina`: en frío la compilación del
    // dev server se lleva segundos, más que los 5s por defecto de expect.
    await expect(cortina(page)).toBeVisible({ timeout: 30_000 });
    await expect(cortina(page)).toBeHidden({ timeout: 15_000 });
    await ctx.close();
  });
});
