import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Cobrar» en /cobros cuando el servidor dice QUE NO (o no dice nada).
//
// Desde el PR 3 del dueño único, marcar un recibo cobrado va a
// `POST /api/cobros/marcar-cobrado` y la pantalla solo cambia con su respuesta.
// Esta suite fija que un recibo NUNCA se pinta como cobrado sin un 200 que diga
// `aplicada` o `ya_estaba` para ese recibo:
//   · 403 (sesión/rol), 409 `no_cobrable`: se dice el motivo y sigue pendiente;
//   · 500 con HTML, red caída o un 200 sin detalle: «Comprobando…», se relee el
//     recibo de la BD y, si no figura cobrado, se dice — sin reintentar solo;
//   · y ningún justificante a la socia por un cobro que no está confirmado.
//
// ⚠️ Todos los tests exigen `intentos > 0`: un «no dijo cobrado» sin petición
// es verdad por no haber intentado nada (ver `.claude/tentare-os.md`).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];
const PLANES = [
  { id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true },
];
const SUSCRIPCIONES = [
  { id: 'sus-1', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
];
const recibo = (estado: string) => ({
  id: 'rec-1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: 'sus-1', concepto: 'Renovación Mensual', importe: 60,
  estado, fecha_vencimiento: '2026-07-20', fecha_cobro: estado === 'COBRADO' ? '2026-07-21' : null, fecha_devolucion: null,
  intentos_reintento: 0, metodo_cobro: estado === 'COBRADO' ? 'EFECTIVO' : null, sepa_estado: null,
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Contadores {
  intentos: number;
  cuerpos: { reciboIds: string[]; metodo: string | null }[];
  /** Relecturas del estado real tras una respuesta que no llegó. */
  relecturas: number;
  /** Justificantes pedidos a /api/emails/send. */
  emails: number;
  escriturasDirectas: number;
}

async function montar(
  page: Page,
  responder: (route: Route) => Promise<void> | void,
  opts: { lentoAlReleer?: boolean; cobraEnBd?: boolean } = {},
) {
  const c: Contadores = { intentos: 0, cuerpos: [], relecturas: 0, emails: 0, escriturasDirectas: 0 };
  let estadoEnBd = 'PENDIENTE';

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // Comodines primero: Playwright da prioridad a la ruta registrada MÁS TARDE.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/emails/send', route => { c.emails++; return json(route, { ok: true }); });
  await page.route('**/api/cobros/marcar-cobrado', async route => {
    c.intentos++;
    c.cuerpos.push(JSON.parse(route.request().postData() ?? '{}'));
    // Solo un `aplicada` cambia la BD de mentira, como el servidor real.
    if (opts.cobraEnBd) estadoEnBd = 'COBRADO';
    await responder(route);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));
  await page.route('**/rest/v1/recibos**', async route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      c.escriturasDirectas++;
      return json(route, { message: 'el panel no debería escribir recibos directamente' }, 400);
    }
    const url = new URL(req.url());
    if (url.searchParams.get('select') === 'id,estado') {
      c.relecturas++;
      // Lenta a propósito: si no, «Comprobando…» dura un parpadeo y no se puede
      // afirmar que se enseñó.
      if (opts.lentoAlReleer) await new Promise(r => setTimeout(r, 1500));
      return json(route, [{ id: 'rec-1', estado: estadoEnBd }]);
    }
    return json(route, [recibo(estadoEnBd)]);
  });

  await page.goto('/cobros');
  await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
  return c;
}

const botonCobrar = (page: Page) => page.getByTitle('Marcar cobrado (elige cómo) y enviar email');

async function cobrarEnEfectivo(page: Page) {
  await botonCobrar(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Efectivo' }).click();
}

async function sigueSinCobrar(page: Page, c: Contadores) {
  expect(c.intentos, 'el cobro no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  expect(c.cuerpos[0]).toEqual({ reciboIds: ['rec-1'], metodo: 'EFECTIVO' });
  await expect(page.getByText(/Cobro registrado/)).toHaveCount(0);
  // La fila sigue en «Quién me debe» con su botón.
  await expect(botonCobrar(page)).toBeVisible();
  expect(c.emails, 'un justificante de un cobro sin confirmar es un email falso').toBe(0);
  expect(c.escriturasDirectas, 'el panel no puede caer a escribir el recibo él mismo').toBe(0);
}

test.setTimeout(120_000);

test('⚠️ 403: dice por qué y el recibo sigue sin cobrar', async ({ page }) => {
  const c = await montar(page, route => json(route, { error: 'Tu rol no puede registrar cobros' }, 403));
  await cobrarEnEfectivo(page);
  await expect(page.getByText('Tu rol no puede registrar cobros')).toBeVisible({ timeout: 15_000 });
  await sigueSinCobrar(page, c);
  expect(c.relecturas, 'un 403 es un «no» seguro: no hay nada que releer').toBe(0);
});

test('⚠️ 409 no_cobrable: dice el motivo del servidor y no lo pinta cobrado', async ({ page }) => {
  const c = await montar(page, route => json(route, {
    resultados: [{ reciboId: 'rec-1', resultado: 'no_cobrable', selladoOk: true, error: 'Este recibo tiene un cobro en curso (banco o tarjeta). Espera a que se resuelva antes de marcarlo a mano.' }],
  }, 409));
  await cobrarEnEfectivo(page);
  await expect(page.getByText(/tiene un cobro en curso/)).toBeVisible({ timeout: 15_000 });
  await sigueSinCobrar(page, c);
});

for (const [nombre, responder] of [
  ['500 con HTML', (route: Route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<html><body>Internal Server Error</body></html>' })],
  ['red caída', (route: Route) => route.abort('failed')],
  // La trampa del comodín `**/api/**` de estas suites: un 200 sin detalle no es un sí.
  ['200 sin detalle', (route: Route) => json(route, {})],
] as const) {
  test(`⚠️ ${nombre}: «Comprobando…», relee la BD y no lo da por cobrado`, async ({ page }) => {
    const c = await montar(page, responder, { lentoAlReleer: true });
    await cobrarEnEfectivo(page);
    await expect(page.getByText('Comprobando si el cobro se ha guardado…')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/No hemos podido confirmar el cobro y ahora figura sin cobrar/)).toBeVisible({ timeout: 15_000 });
    expect(c.relecturas, 'sin respuesta clara hay que mirar la BD antes de decir nada').toBeGreaterThan(0);
    await sigueSinCobrar(page, c);
    // Nunca un reintento a ciegas: una sola petición por un clic.
    expect(c.intentos).toBe(1);
  });
}

test('contraprueba: un 200 aplicada sí se da por cobrado y manda su justificante', async ({ page }) => {
  const c = await montar(page, route => json(route, { resultados: [{ reciboId: 'rec-1', resultado: 'aplicada', selladoOk: true }] }), { cobraEnBd: true });
  await cobrarEnEfectivo(page);
  await expect(page.getByText(/Cobro registrado/)).toBeVisible({ timeout: 15_000 });
  expect(c.intentos).toBeGreaterThan(0);
  await expect.poll(() => c.emails, { timeout: 10_000 }).toBe(1);
  expect(c.escriturasDirectas).toBe(0);
});

test('un 200 ya_estaba se dice «ya estaba cobrado», no es un error ni manda otro justificante', async ({ page }) => {
  const c = await montar(page, route => json(route, { resultados: [{ reciboId: 'rec-1', resultado: 'ya_estaba', selladoOk: true }] }));
  await cobrarEnEfectivo(page);
  await expect(page.getByText('Ya estaba cobrado.')).toBeVisible({ timeout: 15_000 });
  expect(c.intentos).toBeGreaterThan(0);
  await expect(page.getByText(/Cobro registrado/)).toHaveCount(0);
  expect(c.emails).toBe(0);
  expect(c.escriturasDirectas).toBe(0);
});
