import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El kit EN SU RUTA REAL (`/portal/<slug>/…`), no en la previsualización.
//
// ⚠️ Existe porque ninguna spec montaba el portal del kit: todas las del kit van
// contra `/portal-tema-preview`, que no navega por URL, y todas las del portal
// real montaban el portal de siempre (`montarPortal` no tenía interruptor de
// `portalReact`). En ese hueco cabía un bug que dejaba el portal ENTERO sin
// barra de pestañas y sin responder a nada, con el Inicio pintándose igual por
// un fallback — o sea, sin ningún síntoma que una spec de las que había pudiera
// ver. Lo encontró una socia mirando su móvil, no la suite.
//
// Lo que se protege aquí es la costura ruta ↔ store, que es donde estaba:
// que la pantalla de la URL gobierne, y que el detalle —la única sin ruta, y la
// única desde la que se reserva— siga sin cerrarse al abrirlo.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal del kit en su ruta real', () => {
  test.beforeEach(async ({ page }) => {
    await montarPortal(page, { conSesion: true, kit: 'sereno' });
  });

  test('el Inicio monta la barra de pestañas', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);

    const barra = page.locator('.tab-bar');
    await expect(barra).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.tab')).toHaveCount(4);
    await expect(page.locator('.tab.is-active')).toHaveText(/Inicio/);

    // Pegada abajo, no al final de un scroll largo: sin altura acotada la barra
    // acaba fuera de la ventana y la socia no la ve nunca.
    const caja = (await barra.boundingBox())!;
    const alto = await page.evaluate(() => window.innerHeight);
    expect(caja.y + caja.height).toBeLessThanOrEqual(alto + 1);
  });

  test('tocar una pestaña navega de verdad', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 30_000 });

    await page.locator('.tab', { hasText: 'Clases' }).click();

    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/clases`));
    // Y la barra se entera: marcar Inicio con Clases delante es el síntoma de
    // que el store y la ruta han dejado de hablarse.
    await expect(page.locator('.tab.is-active')).toHaveText(/Clases/);
  });

  test('el detalle de una clase NO se cierra al abrirlo', async ({ page }) => {
    // ⚠️ La excepción que protege la regla: el detalle no tiene ruta propia. Si
    // la pantalla de la URL lo pisara, se desharía en el mismo render y la socia
    // se quedaría sin poder reservar — es la única pantalla con el botón.
    //
    // Se entra por la tarjeta del Inicio y no por el horario: en el horario hay
    // que acertar un día CON clases, y un test que dependa de eso se cae solo al
    // mover el reloj de los datos de muestra.
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /ver clase/i }).first().click();

    // Se ancla a lo que SOLO tiene el detalle en cualquier tema —su flecha de
    // atrás y el titular de la clase—, no al botón de reservar (su texto cambia
    // si la socia ya la tiene) ni al rótulo de la barra superior (Sereno usa
    // `bleed-bajo` y no lo pinta).
    await expect(page.getByRole('button', { name: 'Atrás' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reformer Flow' })).toBeVisible();
    // Y sigue en la misma URL, porque el detalle no tiene la suya.
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/home`));
  });
});
