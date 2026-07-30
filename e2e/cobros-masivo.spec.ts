import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Cobro masivo", en verde, abría con TODOS los recibos pendientes ya marcados
// y el botón ejecutaba directo. Cada recibo cobrado emite una factura sellada
// (Veri*Factu, cadena de hashes) y renueva la suscripción — y marcarlo devuelto
// después no anula ninguna de las dos cosas.
//
// La dueña que lo probó un mes lo dejó por escrito: "Cobro masivo, en verde.
// ¿Le cobro a todas de golpe? ¿Se puede deshacer?". Las respuestas eran sí y
// no, y ninguna de las dos estaba a la vista.
//
// Esta suite fija las dos garantías: no hay nada preseleccionado, y no se cobra
// nada sin pasar por una confirmación que dice lo que va a ocurrir.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
  { id: 's2', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'López', email: 'bea@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];

const PLANES = [
  { id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true },
];

const SUSCRIPCIONES = [
  { id: 'sus-1', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
  { id: 'sus-2', studio_id: STUDIO_ID, socio_id: 's2', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
];

const RECIBOS = [
  { id: 'rec-1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: 'sus-1', concepto: 'Renovación Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null },
  { id: 'rec-2', studio_id: STUDIO_ID, socio_id: 's2', suscripcion_id: 'sus-2', concepto: 'Renovación Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null },
];

// Caso que se nos escapó: una socia con DOS suscripciones activas. `masivoData`
// agrupa por SUSCRIPCIÓN, así que sus recibos pendientes —que son los mismos—
// aparecen una vez por suscripción. Si la lista de ids cobrables no se
// deduplica, su `length` supera al `size` del Set de seleccionados y "Marcar
// todas" no llega nunca a "Quitar todas". Pasó de verdad (lo arregló #370) y el
// test original no lo cazó porque montaba una suscripción por socia.
const SUSCRIPCIONES_DOBLES = [
  ...SUSCRIPCIONES,
  { id: 'sus-1b', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Devuelve los PATCH que llegaron a `recibos`: si está vacío, no se ha cobrado nada. */
async function montarCobros(page: Page, suscripciones: unknown[] = SUSCRIPCIONES, opts: { rechazarEscritura?: boolean } = {}) {
  const escrituras: { metodo: string; body: string }[] = [];

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // Comodines primero: Playwright resuelve las rutas en orden inverso.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, suscripciones));
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      escrituras.push({ metodo: req.method(), body: req.postData() ?? '' });
      // Simula que la BD rechaza (RLS, red, lo que sea): el camino que antes se
      // tragaba en silencio y aun así pintaba facturas y renovaciones.
      if (opts.rechazarEscritura) {
        return json(route, { message: 'new row violates row-level security policy' }, 403);
      }
      // dbMarcarCobrado/dbUpdateRecibosBatch (auditoría M-2) exigen
      // `estado = 'PENDIENTE'` en el propio UPDATE y miran las filas
      // devueltas por `.select('id')` para saber si de verdad cobraron algo
      // -- antes esto devolvía [] siempre porque el código nunca inspeccionaba
      // el cuerpo de una escritura con éxito. Se simulan las filas que un
      // UPDATE condicional real devolvería: los ids que venían en el filtro.
      const url = new URL(req.url());
      const idParam = url.searchParams.get('id') ?? '';
      const ids = idParam.startsWith('in.(')
        ? idParam.slice(4, -1).split(',').filter(Boolean)
        : idParam.startsWith('eq.') ? [idParam.slice(3)] : [];
      return json(route, ids.map(id => ({ id })));
    }
    return json(route, RECIBOS);
  });

  await page.goto('/cobros');
  return escrituras;
}

test.describe('Cobrar varias a la vez', () => {
  test('una sola fila de pestañas, en el idioma de la dueña', async ({ page }) => {
    await montarCobros(page);

    await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Lo que he cobrado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Facturas' })).toBeVisible();

    // Las pestañas de la fila intermedia y la de estados ya no existen.
    await expect(page.getByRole('button', { name: 'Suscripciones activas', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Historial', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'En curso', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cobros', exact: true })).toHaveCount(0);

    // Suscripciones sigue estando, pero como enlace y no como pestaña.
    await expect(page.getByRole('button', { name: 'Ver las 2 suscripciones activas' })).toBeVisible();

    // El filtro abre por la pregunta real de la pantalla.
    await expect(page.getByLabel('Ver')).toHaveValue('SIN_COBRAR');
  });

  test('abre sin nada marcado y no deja continuar', async ({ page }) => {
    await montarCobros(page);

    await page.getByRole('button', { name: 'Cobrar varias a la vez' }).click({ timeout: 30_000 });

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('0 recibos seleccionados');
    await expect(dialogo.getByRole('button', { name: /^Continuar/ })).toBeDisabled();
  });

  test('no cobra nada hasta confirmar, y la confirmación avisa de lo irreversible', async ({ page }) => {
    const escrituras = await montarCobros(page);

    await page.getByRole('button', { name: 'Cobrar varias a la vez' }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');

    await dialogo.getByRole('button', { name: /^Marcar todas/ }).click();
    await expect(dialogo).toContainText('2 recibos seleccionados');

    await dialogo.getByRole('button', { name: /^Continuar/ }).click();

    // Dice exactamente qué va a pasar, incluido lo que no se puede deshacer.
    await expect(dialogo).toContainText('Vas a cobrar 2 recibos');
    await expect(dialogo).toContainText('factura con número fiscal');
    await expect(dialogo).toContainText('2 suscripciones');
    await expect(dialogo).toContainText('Esto no se puede deshacer');

    // Hasta aquí no se ha tocado ni un recibo.
    expect(escrituras).toHaveLength(0);

    // Y volverse atrás tampoco cobra.
    await dialogo.getByRole('button', { name: 'Volver a la lista' }).click();
    await expect(dialogo).toContainText('2 recibos seleccionados');
    expect(escrituras).toHaveLength(0);
  });

  test('con una socia de dos suscripciones, "Marcar todas" sigue funcionando', async ({ page }) => {
    await montarCobros(page, SUSCRIPCIONES_DOBLES);

    await page.getByRole('button', { name: 'Cobrar varias a la vez' }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');

    // Los recibos son 2, no 3: los de Ana no se cuentan dos veces por tener dos
    // suscripciones.
    await expect(dialogo.getByRole('button', { name: 'Marcar todas (2)' })).toBeVisible();

    await dialogo.getByRole('button', { name: /^Marcar todas/ }).click();
    await expect(dialogo).toContainText('2 recibos seleccionados');

    // Aquí es donde fallaba: con ids duplicados el botón se quedaba clavado en
    // "Marcar todas" y no había forma de deseleccionar de golpe.
    await expect(dialogo.getByRole('button', { name: 'Quitar todas' })).toBeVisible();

    await dialogo.getByRole('button', { name: 'Quitar todas' }).click();
    await expect(dialogo).toContainText('0 recibos seleccionados');
  });

  // ── Cuando la base de datos dice que no ──────────────────────────────────────
  // `marcarCobrado` escribía de forma optimista y SIN await: marcaba el recibo
  // como COBRADO en pantalla, emitía una factura con número fiscal y renovaba el
  // bono, todo antes de saber si la escritura había funcionado. Si fallaba, nadie
  // se enteraba: el resumen decía "2 cobros procesados" igual.
  test('si la BD rechaza, lo dice y no da los cobros por buenos', async ({ page }) => {
    await montarCobros(page, SUSCRIPCIONES, { rechazarEscritura: true });

    await page.getByRole('button', { name: 'Cobrar varias a la vez' }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: /^Marcar todas/ }).click();
    await dialogo.getByRole('button', { name: /^Continuar/ }).click();
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();

    // Ni un solo cobro dado por bueno, y se explica qué ha pasado.
    await expect(dialogo).toContainText('0 cobros guardados', { timeout: 15_000 });
    await expect(dialogo).toContainText('no se han podido guardar');
    await expect(dialogo).toContainText('siguen como pendientes');
    // Lo que más importa: no se ha emitido factura fiscal contra un cobro que no existe.
    await expect(dialogo).toContainText('No se han emitido sus facturas');
    await expect(dialogo).not.toContainText('2 cobros guardados');
  });

  test('si la BD acepta, el resumen cuadra con lo guardado', async ({ page }) => {
    const escrituras = await montarCobros(page);

    await page.getByRole('button', { name: 'Cobrar varias a la vez' }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: /^Marcar todas/ }).click();
    await dialogo.getByRole('button', { name: /^Continuar/ }).click();
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();

    await expect(dialogo).toContainText('2 cobros guardados', { timeout: 15_000 });
    await expect(dialogo).not.toContainText('no se han podido guardar');
    // Y se escribió de verdad, una vez por recibo.
    expect(escrituras.filter(e => e.metodo === 'PATCH').length).toBeGreaterThanOrEqual(2);
  });
});
