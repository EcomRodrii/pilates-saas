import { test, expect, type Page } from '@playwright/test';
import { SLUG } from './socia-lista';

// Tarjeta regalo · compra pública (sin cuenta) y vuelta del pago.
//
// ⚠️ Cada camino de FALLO lleva su contador: un «no mintió» sin comprobar que la petición
// salió es un test hueco (ver .claude/tentare-os.md). La compra se cobra en Stripe, que aquí
// no se toca: se mockea la sesión y se comprueba lo que viaja y lo que la pantalla afirma.

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const INFO = {
  nombreEstudio: 'Estudio de prueba', aLaVenta: true, importesEur: [25, 50, 100], permiteImporteLibre: true,
  importeMinEur: 10, importeMaxEur: 300, caducidadMeses: 12, terminos: null,
};
const url = `/reservar/${SLUG}/regalo`;

async function montar(page: Page, info: unknown = INFO) {
  await page.route('**/api/public/regalo/info**', (r) => r.fulfill(json(info)));
}

async function rellenar(page: Page) {
  await page.getByLabel('Para (nombre)').fill('Bea');
  await page.getByLabel('Email de quien lo recibe').fill('bea@example.com');
  await page.getByLabel('Mensaje (opcional)').fill('Felices fiestas');
  await page.getByLabel('De (tu nombre)').fill('Ana');
  await page.getByLabel(/Tu email/).fill('ana@example.com');
}

test.describe('Tarjeta regalo · compra pública', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('manda el importe elegido y los datos, sin id de estudio, y va a la página de pago', async ({ page }) => {
    await montar(page);
    const peticiones: Record<string, unknown>[] = [];
    await page.route('**/api/public/regalo/comprar', (r) => {
      peticiones.push(r.request().postDataJSON() ?? {});
      return r.fulfill(json({ url: `${url}?gracias=1&session_id=cs_test_e2e_regalo_1` }));
    });
    await page.route('**/api/public/regalo/estado**', (r) => r.fulfill(json({ estado: 'pagado', destinatarioNombre: 'Bea', importeEur: 100 })));

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Regala una tarjeta de Estudio de prueba/ })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: '100 €' }).click();
    await rellenar(page);
    await page.getByRole('button', { name: /Pagar 100 €/ }).click();

    await expect(page.getByRole('heading', { name: '¡Regalo enviado!' })).toBeVisible({ timeout: 30_000 });
    expect(peticiones.length, 'la compra no llegó a intentarse').toBe(1);
    expect(peticiones[0]).toMatchObject({ slug: SLUG, importeEur: 100, destinatarioNombre: 'Bea', compradorEmail: 'ana@example.com' });
    expect(peticiones[0], 'el cliente no manda el estudio: sale del slug en servidor').not.toHaveProperty('studioId');
    expect(peticiones[0].web, 'la trampa de bots va vacía en una persona').toBe('');
  });

  test('⚠️ un 400 del servidor se enseña y NO se anuncia como regalo enviado', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/regalo/comprar', (r) => { intentos += 1; return r.fulfill(json({ error: 'El importe tiene que estar entre 10 € y 300 €.' }, 400)); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Para (nombre)')).toBeVisible({ timeout: 60_000 });
    await rellenar(page);
    await page.getByRole('button', { name: /Pagar/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'El importe tiene que estar entre' })).toBeVisible();
    expect(intentos, 'la compra no llegó a intentarse: el test no prueba nada').toBe(1);
    await expect(page.getByText('¡Regalo enviado!')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pagar/ })).toBeEnabled();
  });

  test('⚠️ un 500 con HTML tampoco se anuncia como éxito y el botón vuelve a estar libre', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/regalo/comprar', (r) => { intentos += 1; return r.fulfill({ status: 500, contentType: 'text/html', body: '<html>Internal Server Error</html>' }); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Para (nombre)')).toBeVisible({ timeout: 60_000 });
    await rellenar(page);
    await page.getByRole('button', { name: /Pagar/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /No hemos podido abrir el pago/ })).toBeVisible();
    expect(intentos).toBe(1);
    await expect(page.getByText('¡Regalo enviado!')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pagar/ })).toBeEnabled();
  });

  test('⚠️ con la red caída la pantalla no se queda muerta', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/regalo/comprar', (r) => { intentos += 1; return r.abort('connectionfailed'); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Para (nombre)')).toBeVisible({ timeout: 60_000 });
    await rellenar(page);
    await page.getByRole('button', { name: /Pagar/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Revisa tu conexión/ })).toBeVisible();
    expect(intentos).toBe(1);
    await expect(page.getByRole('button', { name: /Pagar/ })).toBeEnabled();
  });

  test('⚠️ si el estudio no la vende, no hay formulario y no se puede comprar nada', async ({ page }) => {
    await montar(page, { ...INFO, aLaVenta: false });
    let intentos = 0;
    await page.route('**/api/public/regalo/comprar', (r) => { intentos += 1; return r.fulfill(json({ url: 'https://example.invalid' })); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/no vende tarjetas regalo por internet/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('Para (nombre)')).toHaveCount(0);
    expect(intentos, 'no debía haber ninguna compra').toBe(0);
  });

  test('⚠️ si el pago aún no está confirmado NO dice «enviado» y avisa de no pagar dos veces', async ({ page }) => {
    await montar(page);
    let consultas = 0;
    await page.route('**/api/public/regalo/estado**', (r) => { consultas += 1; return r.fulfill(json({ estado: 'pendiente' })); });
    await page.goto(`${url}?gracias=1&session_id=cs_test_e2e_regalo_2`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Tu pago está en camino' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/No vuelvas a pagar/)).toBeVisible();
    expect(consultas, 'nunca se preguntó al servidor').toBeGreaterThan(0);
    await expect(page.getByText('¡Regalo enviado!')).toHaveCount(0);
  });
});
