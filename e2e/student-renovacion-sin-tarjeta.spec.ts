import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Una renovación que no se cobra sola (sin tarjeta guardada: cuota cobrada en
// recepción). Antes se quedaba pendiente sin que nadie se enterase; ahora su app
// se la enseña en Bonos con «Pagar ahora», que paga ESE recibo —no «Renovar mi
// plan», que elige la suscripción activa más reciente— y guarda la tarjeta.
// Cada camino que escribe lleva su contador: un test de fallo sin él es hueco.

const base = `/portal/${SLUG}`;

const RENOVACION = {
  reciboId: 'rec-renov-sus-1-2026-08', concepto: 'Renovación Cuota mensual', importe: 60, vence: '2026-08-01', pagableOnline: true,
};

async function montar(page: Page, renovacion: typeof RENOVACION | null, respuesta = { status: 200, body: { url: 'about:blank' } as unknown }) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.socia as Record<string, unknown>).renovacionPorPagar = renovacion;
  const pagos: Record<string, unknown>[] = [];
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/api/stripe/checkout', (r) => {
    pagos.push(JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>);
    return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.body) });
  });
  return { pagos };
}

test.describe('Student PWA · renovación que no se cobra sola', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('se la enseña en Bonos y «Pagar ahora» paga ESE recibo, con su sesión', async ({ page }) => {
    const { pagos } = await montar(page, RENOVACION);
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('renovacion-por-pagar');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta).toContainText('Renovación Cuota mensual');
    await expect(tarjeta).toContainText('no tienes una tarjeta guardada');
    await expect(tarjeta).toContainText('las próximas renovaciones se cobran solas');

    await tarjeta.getByRole('button', { name: 'Pagar ahora' }).click();
    await expect.poll(() => pagos.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(pagos[0]).toMatchObject({ studioId: STUDIO_ID, reciboId: RENOVACION.reciboId, origen: 'portal' });
  });

  test('si el servidor dice que no, lo dice y deja volver a intentarlo', async ({ page }) => {
    const { pagos } = await montar(page, RENOVACION, { status: 409, body: { error: 'Este recibo ya no está pendiente de cobro' } });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('renovacion-por-pagar');
    await tarjeta.getByRole('button', { name: 'Pagar ahora' }).click({ timeout: 30_000 });
    await expect(page.getByText('Este recibo ya no está pendiente de cobro')).toBeVisible({ timeout: 30_000 });
    expect(pagos.length, 'la petición salió de verdad').toBeGreaterThan(0);
    await expect(tarjeta.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();
  });

  test('si el estudio no cobra online, no hay botón: se paga en el estudio', async ({ page }) => {
    const { pagos } = await montar(page, { ...RENOVACION, pagableOnline: false });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('renovacion-por-pagar');
    await expect(tarjeta).toContainText('Págala en el estudio.', { timeout: 30_000 });
    await expect(tarjeta.getByRole('button', { name: 'Pagar ahora' })).toHaveCount(0);
    expect(pagos).toHaveLength(0);
  });

  test('sin renovación pendiente, no hay tarjeta', async ({ page }) => {
    await montar(page, null);
    await page.goto(`${base}/bonos`);
    await expect(page.getByRole('heading', { name: /bonos/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('renovacion-por-pagar')).toHaveCount(0);
  });
});
