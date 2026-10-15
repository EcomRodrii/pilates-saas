import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Mensajería › Conversaciones. Dos cosas:
//   · con las conversaciones como las devuelve la API (`conversacion_participantes`),
//     la bandeja se pinta: el andamiaje sembraba una forma vieja y la pestaña salía
//     con «Algo ha ido mal» en todas las suites, sin que nadie la viera de verdad;
//   · con una respuesta que no espera (un `{}` con 200, un 500, sin red), dice que no
//     ha podido cargar y ofrece «Reintentar», en vez de tumbar Mensajería entera.
// Con contador de peticiones: un «no se cayó» sin haber pedido nada no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrirConversaciones(page: Page) {
  await ir(page, 'mensajeria');
  await page.getByText('Conversaciones', { exact: true }).first().click({ timeout: 60_000 });
}

test('con la forma real de la API, la bandeja se pinta con sus conversaciones', async ({ page }) => {
  await montar(page);
  await abrirConversaciones(page);
  await expect(page.getByText('María García Fernández').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Carmen Del Río Sánchez').first()).toBeVisible();
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
});

for (const [caso, falla] of [
  ['un `{}` con 200', (r: Route) => json(r, {})],
  ['un 500', (r: Route) => json(r, { error: 'boom' }, 500)],
  ['sin red', (r: Route) => r.abort()],
] as const) {
  test(`con ${caso}, dice que no ha podido cargar (sin tumbar Mensajería) y «Reintentar» vuelve a pedir`, async ({ page }) => {
    await montar(page);
    // Después de `montar`: gana a su conversación sembrada. Falla hasta `bien = true`
    // (no por número de petición: en desarrollo React monta dos veces y pide dos).
    const cuenta = { gets: 0, bien: false };
    await page.route((u) => u.pathname === '/api/mensajeria/conversaciones', (r) => {
      if (r.request().method() !== 'GET') return json(r, {});
      cuenta.gets++;
      return cuenta.bien ? json(r, { conversaciones: [] }) : falla(r);
    });
    await abrirConversaciones(page);
    const aviso = page.getByRole('alert').filter({ hasText: 'No se han podido cargar tus conversaciones.' });
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    expect(cuenta.gets, 'peticiones a /api/mensajeria/conversaciones').toBeGreaterThan(0);
    await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
    await expect(page.getByText('boom')).toHaveCount(0);

    const antes = cuenta.gets;
    cuenta.bien = true;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(aviso).toHaveCount(0);
    expect(cuenta.gets).toBeGreaterThan(antes);
  });
}
