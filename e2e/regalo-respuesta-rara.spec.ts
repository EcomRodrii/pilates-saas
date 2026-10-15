import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Paquetes › «Tarjeta regalo» con una respuesta que no es la que espera: un
// `{}` con 200 (lo que contesta un proxy o un servidor a medias), un 500 o sin
// red. Antes, el `{}` tumbaba Paquetes entera con «Algo ha ido mal»; ahora la
// pestaña dice que no ha podido cargar y ofrece «Reintentar», y «Reintentar»
// vuelve a pedir de verdad (contador de peticiones: un «no se cayó» sin haber
// pedido nada no prueba nada).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const BUENA = {
  ajustes: { activo: false, importesEur: [25, 50, 100], permiteImporteLibre: true, importeMinEur: 10, importeMaxEur: 300, caducidadMeses: 12, terminos: null },
  tarjetas: [], pasivoVivo: 0, puedeEditarAjustes: true,
};

/**
 * /api/regalo falla con `falla` hasta que el test llama a `arreglar()`; desde ahí contesta bien.
 * No por número de petición: en desarrollo, React monta dos veces y pide dos.
 */
async function abrir(page: Page, falla: (r: Route) => Promise<void>) {
  await montar(page);
  const cuenta = { gets: 0, bien: false, arreglar() { this.bien = true; } };
  await page.route((u) => u.pathname === '/api/regalo', (r) => {
    if (r.request().method() !== 'GET') return json(r, {});
    cuenta.gets++;
    return cuenta.bien ? json(r, BUENA) : falla(r);
  });
  await ir(page, 'productos');
  await page.getByRole('button', { name: 'Tarjeta regalo', exact: true }).first().click({ timeout: 60_000 });
  return cuenta;
}

const NO_CARGA = 'No se han podido cargar las tarjetas regalo.';

for (const [caso, falla] of [
  ['un `{}` con 200', (r: Route) => json(r, {})],
  ['un 500', (r: Route) => json(r, { error: 'boom' }, 500)],
  ['sin red', (r: Route) => r.abort()],
] as const) {
  test(`con ${caso}, la pestaña dice que no ha podido cargar (sin tumbar Paquetes) y «Reintentar» vuelve a pedir`, async ({ page }) => {
    const cuenta = await abrir(page, falla);
    const aviso = page.getByRole('alert').filter({ hasText: NO_CARGA });
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    expect(cuenta.gets, 'peticiones a /api/regalo').toBeGreaterThan(0);
    await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
    // El resto de Paquetes sigue en pie: sus pestañas se pueden tocar.
    await expect(page.getByRole('button', { name: 'Planes de suscripción', exact: true }).first()).toBeVisible();

    const antes = cuenta.gets;
    cuenta.arreglar();
    await aviso.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('panel-regalo')).toBeVisible();
    expect(cuenta.gets).toBeGreaterThan(antes);
    await expect(page.getByText(NO_CARGA)).toHaveCount(0);
  });
}
