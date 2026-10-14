import { test, expect, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Los recordatorios de clase en el panel nuevo (interruptor `panelNuevo`), como
// los de Bonsai: cada uno en su tarjeta, con cuándo se envía, por dónde llega y
// cómo lo recibe la alumna. Elegir otra antelación se guarda, y si el servidor
// dice que no, vuelve a lo que había (contador de peticiones: un test del camino
// de fallo sin contador puede pasar sin haber intentado nada).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function preparar(page: import('@playwright/test').Page) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
}

test('cada recordatorio en su tarjeta, con cuándo, por dónde y cómo le llega', async ({ page }) => {
  await preparar(page);
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');
  await expect(page.getByRole('heading', { name: 'Recordatorios de clase' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Recordatorio 1', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Cuándo se envía el recordatorio 1' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Cuándo se envía el recordatorio 2' })).toBeVisible();
  await expect(page.getByText('Así lo recibirá').first()).toBeVisible();
});

test('si el servidor no guarda la antelación, vuelve a la que había', async ({ page }) => {
  await preparar(page);
  let intentos = 0;
  await page.route('**/rest/v1/studios**', async (r) => {
    if (r.request().method() === 'PATCH') { intentos++; return json(r, { message: 'caído' }, 500); }
    return r.fallback();
  });
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');
  const selector = page.getByRole('combobox', { name: 'Cuándo se envía el recordatorio 1' });
  await expect(selector).toBeVisible({ timeout: 30_000 });
  const antes = await selector.inputValue();
  const otra = (await selector.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).find(v => v !== antes)!;
  await selector.selectOption(otra);
  await expect.poll(() => intentos).toBeGreaterThan(0);
  await expect(selector).toHaveValue(antes);
});
