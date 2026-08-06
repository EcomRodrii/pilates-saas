import { test, expect } from '@playwright/test';
import { montarPortal, SLUG, SOCIA } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Pagar desde el portal: los caminos que NO son el feliz.
//
// Los tres fallos que fija este fichero solo se ven forzando respuestas que la
// suite nunca produce — `page.route` mockea la red y por defecto todo va bien,
// así que un 500, un `abort()` o un recibo FALLIDO no aparecen jamás por su
// cuenta. Los tres estaban en producción:
//
//  1. Red caída al pulsar "Pagar" → overlay a pantalla completa y spinner
//     girando para siempre. `crearCheckoutStripe` devolvía `res.json()` a pelo y
//     el llamador no envuelve: la promesa rechazaba y `setComprando(null)` no
//     llegaba a ejecutarse. Sin mensaje y sin salida salvo recargar.
//  2. Un 500 del servidor se le contaba a la socia como "no hay conexión".
//  3. Un recibo FALLIDO (dunning agotado) se pintaba SIN etiqueta y SIN botón,
//     indistinguible de uno pagado — y el push de pago fallido manda justo aquí.
// ─────────────────────────────────────────────────────────────────────────────

// Forma de cliente (bootstrap del portal), no de BD: es lo que sirve el arnés.
const RECIBO_PENDIENTE = {
  id: 'rec-pend', studioId: 'studio-test', socioId: SOCIA.socioId, concepto: 'Bono 10 clases',
  importe: 175, estado: 'PENDIENTE', fechaVencimiento: '2026-08-01', fechaCobro: null, metodoCobro: null,
};

const RECIBO_FALLIDO = { ...RECIBO_PENDIENTE, id: 'rec-fall', estado: 'FALLIDO' };

test.describe('Pagar desde el portal cuando algo va mal', () => {
  test('se cae la red: se dice, y el botón vuelve — no un spinner eterno', async ({ page }) => {
    await montarPortal(page, { conSesion: true, recibos: [RECIBO_PENDIENTE] });
    await page.route('**/api/stripe/checkout', route => route.abort('connectionfailed'));
    await page.goto(`/portal/${SLUG}/compras`);

    const pagar = page.getByRole('button', { name: /^Pagar$/i }).first();
    await expect(pagar).toBeVisible({ timeout: 30_000 });
    await pagar.click();

    // ⚠️ `p[role=alert]`, no `getByRole('alert')`: Next monta su propio
    // anunciador de rutas con ese rol y el locator amplio da strict mode.
    // Lo que fallaba: ni mensaje ni recuperación.
    await expect(page.locator('p[role="alert"]')).toContainText(/conexión/i, { timeout: 15_000 });
    await expect(pagar).toBeEnabled();
  });

  test('un 500 del servidor NO se le cuenta a la socia como fallo de su conexión', async ({ page }) => {
    await montarPortal(page, { conSesion: true, recibos: [RECIBO_PENDIENTE] });
    // 500 con HTML: así responde Next de verdad, y es lo que hacía reventar al
    // `res.json()` y caer en la rama de red.
    await page.route('**/api/stripe/checkout', route =>
      route.fulfill({ status: 500, contentType: 'text/html', body: '<html><body>Internal Server Error</body></html>' }));
    await page.goto(`/portal/${SLUG}/compras`);

    const pagar = page.getByRole('button', { name: /^Pagar$/i }).first();
    await expect(pagar).toBeVisible({ timeout: 30_000 });
    await pagar.click();

    const alerta = page.locator('p[role="alert"]');
    await expect(alerta).toBeVisible({ timeout: 15_000 });
    await expect(alerta).not.toContainText(/no hay conexión con el servidor/i);
  });

  test('un recibo FALLIDO se ve y se puede pagar', async ({ page }) => {
    await montarPortal(page, { conSesion: true, recibos: [RECIBO_FALLIDO] });
    await page.goto(`/portal/${SLUG}/compras`);

    // Antes: sin etiqueta y sin botón, igual que uno ya pagado.
    await expect(page.getByText('Sin pagar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Pagar$/i })).toHaveCount(1);
  });

  // Antes este camino devolvía a `/cobros` —el panel del STAFF, que además pide
  // login—: la socia pagaba 175 € y aterrizaba en un "¿Eres del equipo?" sin una
  // sola palabra sobre su pago. Un test por caso: dos `goto` seguidos en el
  // mismo test no rehidratan la pantalla con el nuevo query string.
  test('al pagar, vuelve a SU portal y se le confirma', async ({ page }) => {
    await montarPortal(page, { conSesion: true, recibos: [RECIBO_PENDIENTE] });
    await page.goto(`/portal/${SLUG}/compras?pago=ok`);
    await expect(page).toHaveURL(/\/portal\//);
    await expect(page.locator('p[role="status"]')).toContainText(/pago completado/i, { timeout: 30_000 });
  });

  test('si sale sin pagar, se le dice que no se le ha cobrado', async ({ page }) => {
    await montarPortal(page, { conSesion: true, recibos: [RECIBO_PENDIENTE] });
    await page.goto(`/portal/${SLUG}/compras?pago=cancelado`);
    await expect(page.locator('p[role="status"]')).toContainText(/no se te ha cobrado nada/i, { timeout: 30_000 });
  });
});
