import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Un recibo que agota los 3 reintentos automáticos del dunning
// (lib/billing/dunning.ts) pasa a estado FALLIDO. `cobrarReciboOffSession`
// (lib/billing/stripe-cobros.ts) acepta explícitamente cobrar un recibo
// FALLIDO — "recuperación manual tras agotar el dunning" — pero
// `PanelPendientes` solo pintaba los botones de acción (Cobrar / Online /
// Marcar devuelto) para `estado === 'PENDIENTE'`. Una fila FALLIDO no tenía
// NINGÚN botón de cobro: "Cobrar online" pulsado ahí no hacía nada porque el
// botón, sencillamente, no existía — sin loading, sin toast, sin request, sin
// evidencia de ningún intento. Esta suite fija que un recibo FALLIDO recupera
// las mismas acciones que uno PENDIENTE.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const SOCIAS = [
  {
    id: 's1', studio_id: STUDIO_ID, nombre: 'Lamine', apellidos: 'RE',
    email: 'lamine@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01',
    campos_extra: {}, tags: [], stripe_customer_id: 'cus_test', stripe_payment_method_id: 'pm_test',
  },
];
const PLANES = [
  { id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true },
];
const SUSCRIPCIONES = [
  { id: 'sus-1', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-09-01', sesiones_restantes: null, stripe_subscription_id: null },
];
function recibo(estado: 'PENDIENTE' | 'FALLIDO', intentos: number) {
  return [{
    id: 'rec-1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: 'sus-1',
    concepto: 'Renovación Mensual', importe: 60, estado, fecha_vencimiento: '2026-08-01',
    fecha_cobro: null, fecha_devolucion: null, intentos_reintento: intentos,
    metodo_cobro: null, sepa_estado: null,
  }];
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opts: {
  estado: 'PENDIENTE' | 'FALLIDO';
  intentos?: number;
  cobrarOnlineStatus?: number;
  cobrarOnlineBody?: unknown;
  /** Retraso artificial antes de responder — para poder observar el estado de loading. */
  cobrarOnlineDelayMs?: number;
}) {
  const llamadasCobrarOnline: string[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // Comodines primero: Playwright resuelve las rutas en orden inverso, así que
  // el handler concreto de cobrar-online tiene que registrarse DESPUÉS del
  // comodín `**/api/**` para no quedar tapado por él (mismo criterio que
  // e2e/cobros-masivo.spec.ts).
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/cobros/cobrar-online', async route => {
    llamadasCobrarOnline.push(route.request().postData() ?? '');
    if (opts.cobrarOnlineDelayMs) await new Promise(r => setTimeout(r, opts.cobrarOnlineDelayMs));
    return json(route, opts.cobrarOnlineBody ?? { ok: true, status: 'succeeded' }, opts.cobrarOnlineStatus ?? 200);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() !== 'GET') return json(route, [{ id: 'rec-1' }]);
    return json(route, recibo(opts.estado, opts.intentos ?? 0));
  });

  await page.goto('/cobros');
  await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
  return llamadasCobrarOnline;
}

test.describe('Recibo FALLIDO — recuperación manual desde Cobros', () => {
  test('un recibo FALLIDO enseña los mismos botones que uno PENDIENTE (Cobrar / Online / Marcar devuelto)', async ({ page }) => {
    await montar(page, { estado: 'FALLIDO', intentos: 3 });
    await expect(page.getByText('Renovación Mensual')).toBeVisible();
    await expect(page.getByText('No se pudo cobrar', { exact: true })).toBeVisible();

    // Antes de este fix, NINGUNO de los tres existía para FALLIDO.
    await expect(page.getByTitle('Marcar cobrado (elige cómo) y enviar email')).toBeVisible();
    await expect(page.getByTitle('Reintentar el cobro con la tarjeta o SEPA que ya tiene guardado la socia')).toBeVisible();
    await expect(page.getByTitle('Marcar devuelto')).toBeVisible();
  });

  test('pulsar "Online" en un FALLIDO SÍ dispara el cobro: loading → request real → toast de éxito', async ({ page }) => {
    const llamadas = await montar(page, { estado: 'FALLIDO', intentos: 3, cobrarOnlineDelayMs: 800 });
    const btnOnline = page.getByTitle('Reintentar el cobro con la tarjeta o SEPA que ya tiene guardado la socia');
    await expect(btnOnline).toBeVisible();

    await btnOnline.click();
    // Feedback inmediato: el botón se deshabilita y muestra el spinner mientras
    // se resuelve — nunca "he pulsado y no sé si ha pasado algo".
    await expect(btnOnline).toBeDisabled();

    // La request llegó de verdad, con el recibo y la socia correctos.
    await expect.poll(() => llamadas.length).toBeGreaterThan(0);
    const body = JSON.parse(llamadas[0]);
    expect(body).toMatchObject({ reciboId: 'rec-1', socioId: 's1' });

    // Y la pantalla lo confirma — sin recargar, sin salir y volver a entrar.
    await expect(page.getByText(/Cobro intentado con el método guardado/)).toBeVisible({ timeout: 10_000 });
  });

  test('si Stripe/el backend rechaza el cobro, se ve un error claro (nunca en silencio)', async ({ page }) => {
    await montar(page, {
      estado: 'FALLIDO', intentos: 3, cobrarOnlineStatus: 402,
      cobrarOnlineBody: { error: 'No se pudo completar el cobro. Inténtalo de nuevo más tarde.', errorCode: 'FALLO_COBRO' },
    });
    const btnOnline = page.getByTitle('Reintentar el cobro con la tarjeta o SEPA que ya tiene guardado la socia');
    await btnOnline.click();

    await expect(page.getByText('No se pudo completar el cobro. Inténtalo de nuevo más tarde.')).toBeVisible({ timeout: 10_000 });
    // El botón se reactiva: no queda "clavado" pensando para siempre.
    await expect(btnOnline).toBeEnabled();
  });

  test('doble clic mientras carga no dispara una segunda request', async ({ page }) => {
    const llamadas = await montar(page, { estado: 'FALLIDO', intentos: 3, cobrarOnlineDelayMs: 800 });
    const btnOnline = page.getByTitle('Reintentar el cobro con la tarjeta o SEPA que ya tiene guardado la socia');

    await btnOnline.click();
    await expect(btnOnline).toBeDisabled();
    // El segundo clic, con el botón ya deshabilitado por `stripeLoading`, no
    // debe llegar a producir una segunda llamada. Timeout CORTO a propósito
    // (muy por debajo del retraso de 800ms del mock): Playwright reintenta la
    // acción hasta que el elemento sea "clicable" — con un timeout más largo
    // que el retraso, esperaría a que el primer cobro termine y reactive el
    // botón, y el segundo clic dejaría de ser un doble-clic real para pasar a
    // ser un segundo clic legítimo y consecutivo tras el primero.
    await btnOnline.click({ timeout: 200 }).catch(() => {});

    // Deja que el mock del primer cobro resuelva del todo.
    await page.waitForTimeout(1000);
    expect(llamadas.length).toBe(1);
  });
});
