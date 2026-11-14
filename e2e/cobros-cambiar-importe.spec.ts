import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cobros → ⋯ de un recibo pendiente → «Cambiar el importe» (lib/cobros/cambiar-importe-reglas.ts).
//
// Un estudio que cobra a mano cobra a veces otra cantidad que la de la tarifa (el primer mes parcial de una alumna). El recibo nacía con
// el precio del plan y no había cómo corregirlo antes de cobrar: «Cobrado este mes» no cuadraba con el dinero que entró. Ahora lo
// corrige el servidor (el navegador NO escribe `importe`), y la pantalla cambia con lo que contesta, nunca antes.
//
// Cada camino de fallo lleva su contador de peticiones: «no dio el cambio por hecho» podría ser verdad por no haber intentado nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
type Fila = Record<string, unknown>;

const SOCIAS = [{ id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] }];
const BASE = {
  studio_id: STUDIO_ID, suscripcion_id: null, fecha_vencimiento: '2026-11-09', fecha_devolucion: null, fecha_cobro: null, metodo_cobro: null,
  intentos_reintento: 0, sepa_estado: null, importe_devuelto: 0, stripe_payment_intent_id: null, socio_id: 's1',
};
const PENDIENTE = { ...BASE, id: 'rec-pend', concepto: 'Cuota mensual', importe: 45, estado: 'PENDIENTE' };
const FALLIDO = { ...BASE, id: 'rec-fallido', concepto: 'Cuota mensual — octubre', importe: 45, estado: 'FALLIDO', intentos_reintento: 2 };
const PENALIZACION = { ...BASE, id: 'rec-penaliz-1', concepto: 'Penalización', importe: 10, estado: 'PENDIENTE' };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function montar(page: Page, recibos: Fila[], respuesta?: { status: number; body: unknown }) {
  const llamadas: Fila[] = [];
  let escriturasDirectas = 0;
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  // Comodines primero: Playwright resuelve las rutas en orden inverso.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/cobros/cambiar-importe', route => {
    llamadas.push(JSON.parse(route.request().postData() ?? '{}'));
    const nuevo = (llamadas[llamadas.length - 1] as { importe: number }).importe;
    return respuesta ? json(route, respuesta.body, respuesta.status) : json(route, { ok: true, importe: nuevo });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() !== 'GET') { escriturasDirectas++; return json(route, { message: 'el panel no debería escribir recibos directamente' }, 400); }
    return json(route, recibos);
  });
  await page.goto('/cobros');
  await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
  // Los recibos pendientes se ven dentro de la ficha de la clienta en «Quién me debe».
  await page.getByRole('button', { name: /Abrir la ficha de Ana Ruiz/ }).click();
  return { llamadas, escrituras: () => escriturasDirectas };
}

const fila = (page: Page, id: string) => page.locator(`[data-recibo="${id}"]`);

async function abrirMenu(page: Page, id: string) {
  const boton = fila(page, id).getByRole('button', { name: /^Acciones de/ });
  await boton.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await boton.click();
}

async function opciones(page: Page, id: string): Promise<string[]> {
  await abrirMenu(page, id);
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const textos = await menu.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return textos.map(t => t.split('\n')[0].trim());
}

test.describe('Cobros: cambiar el importe de un recibo pendiente', () => {
  test('solo lo ofrece un recibo pendiente y limpio: no uno fallido ni una penalización', async ({ page }) => {
    await montar(page, [PENDIENTE, FALLIDO, PENALIZACION]);
    await expect(fila(page, 'rec-pend')).toBeVisible({ timeout: 15_000 });
    expect(await opciones(page, 'rec-pend')).toContain('Cambiar el importe');
    expect(await opciones(page, 'rec-fallido')).not.toContain('Cambiar el importe');
    expect(await opciones(page, 'rec-penaliz-1')).not.toContain('Cambiar el importe');
  });

  test('guarda el importe por el servidor y la pantalla lo enseña SOLO tras su respuesta', async ({ page }) => {
    const { llamadas, escrituras } = await montar(page, [PENDIENTE]);
    await expect(fila(page, 'rec-pend')).toContainText('45,00');
    await abrirMenu(page, 'rec-pend');
    await page.getByRole('menuitem', { name: /^Cambiar el importe/ }).click();

    const dialogo = page.getByTestId('dialogo-cambiar-importe');
    await expect(dialogo).toBeVisible();
    await dialogo.getByTestId('importe-nuevo').fill('35');
    await dialogo.getByTestId('confirmar-cambiar-importe').click();

    await expect(page.getByText(/Importe cambiado a 35,00 €/)).toBeVisible({ timeout: 10_000 });
    expect(llamadas).toEqual([{ reciboId: 'rec-pend', importe: 35 }]);
    await expect(fila(page, 'rec-pend')).toContainText('35,00');
    expect(escrituras(), 'el navegador no escribe el recibo').toBe(0);
  });

  test('acepta la coma decimal', async ({ page }) => {
    const { llamadas } = await montar(page, [PENDIENTE]);
    await abrirMenu(page, 'rec-pend');
    await page.getByRole('menuitem', { name: /^Cambiar el importe/ }).click();
    await page.getByTestId('importe-nuevo').fill('33,39');
    await page.getByTestId('confirmar-cambiar-importe').click();
    await expect(page.getByText(/Importe cambiado a 33,39 €/)).toBeVisible({ timeout: 10_000 });
    expect(llamadas).toEqual([{ reciboId: 'rec-pend', importe: 33.39 }]);
  });

  test('un importe inválido se rechaza en el diálogo, sin molestar al servidor', async ({ page }) => {
    const { llamadas } = await montar(page, [PENDIENTE]);
    await abrirMenu(page, 'rec-pend');
    await page.getByRole('menuitem', { name: /^Cambiar el importe/ }).click();
    await page.getByTestId('importe-nuevo').fill('abc');
    await page.getByTestId('confirmar-cambiar-importe').click();
    await expect(page.getByTestId('error-cambiar-importe')).toContainText('importe válido');
    expect(llamadas, 'aquí la ausencia de peticiones ES lo correcto: se rechaza antes de enviar').toHaveLength(0);
    await expect(fila(page, 'rec-pend')).toContainText('45,00');
  });

  test('si el servidor dice que no, lo dice, deja el importe como estaba y no anuncia nada', async ({ page }) => {
    const motivo = 'Este recibo acaba de cambiar (se ha cobrado o tiene un pago abierto). Recarga y vuelve a mirarlo.';
    const { llamadas } = await montar(page, [PENDIENTE], { status: 409, body: { error: motivo } });
    await abrirMenu(page, 'rec-pend');
    await page.getByRole('menuitem', { name: /^Cambiar el importe/ }).click();
    await page.getByTestId('importe-nuevo').fill('35');
    await page.getByTestId('confirmar-cambiar-importe').click();

    await expect(page.getByTestId('error-cambiar-importe')).toContainText('acaba de cambiar');
    expect(llamadas.length, 'tiene que haberlo intentado').toBeGreaterThan(0);
    await expect(page.getByText(/Importe cambiado/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(fila(page, 'rec-pend')).toContainText('45,00');
  });
});
