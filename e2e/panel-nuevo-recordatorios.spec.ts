import { test, expect, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Los recordatorios de clase en el panel nuevo (interruptor `panelNuevo`),
// calcados a «Recordatorios» de Bonsai: dos pestañas, una tarjeta ancha por
// recordatorio con cuándo se envía, por dónde, su texto editable ahí mismo (se
// guarda al salir del campo) y cómo lo recibe la alumna. Elegir otra antelación
// se guarda, y si el servidor dice que no, vuelve a lo que había (contador de
// peticiones: un test del camino de fallo sin contador puede pasar sin haber
// intentado nada).
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

test('cada recordatorio en su tarjeta, con cuándo, por dónde, su texto y cómo le llega', async ({ page }) => {
  await preparar(page);
  await page.route('**/rest/v1/notification_template**', (r) => r.request().method() === 'GET' ? json(r, []) : r.fallback());
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');
  await expect(page.getByRole('tab', { name: 'Recordatorios de clase', selected: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Los cambios se guardan solos.', { exact: false })).toBeVisible();
  await expect(page.getByText('Recordatorio 1', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Cuándo se envía el recordatorio 1' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Cuándo se envía el recordatorio 2' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Texto del aviso' })).toHaveCount(2);
  await expect(page.getByText('Así lo recibirá').first()).toBeVisible();

  // «Otros avisos»: la lista de siempre, sin los recordatorios (ya tienen su pestaña).
  await page.getByRole('tab', { name: 'Otros avisos' }).click();
  await expect(page.getByText('Lo que dicen los avisos')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Cuándo se envía el recordatorio 1' })).toHaveCount(0);
});

test('el texto se guarda al salir del campo, y si el servidor no lo guarda se dice y no se pierde', async ({ page }) => {
  await preparar(page);
  let intentos = 0;
  await page.route('**/rest/v1/notification_template**', (r) => {
    if (r.request().method() === 'GET') return json(r, []);
    intentos++;
    return json(r, { message: 'caído' }, 500);
  });
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');
  const texto = page.getByRole('textbox', { name: 'Texto del aviso' }).first();
  await expect(texto).toBeVisible({ timeout: 30_000 });
  await texto.fill('Te esperamos en {clase}. Trae tus calcetines.');
  await texto.blur();
  await expect.poll(() => intentos).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido guardar el texto' })).toBeVisible();
  await expect(texto).toHaveValue('Te esperamos en {clase}. Trae tus calcetines.');
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
