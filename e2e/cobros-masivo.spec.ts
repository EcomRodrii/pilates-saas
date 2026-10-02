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
// nada sin pasar por una confirmación que dice lo que va a ocurrir. Desde el
// rediseño (2-oct-2026) es «Seleccionar varias» en «Quién me debe»: se marca a la
// clienta y entra lo suyo que se puede cobrar en lote.
//
// Desde el PR 3 del dueño único el cobro NO se escribe desde el navegador: va a
// `POST /api/cobros/marcar-cobrado`. Así que lo que se cuenta son esos POST, y
// además que no llega NI UNA escritura directa a `rest/v1/recibos`.
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
  { id: 'rec-1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: 'sus-1', concepto: 'Renovación Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null, es_renovacion: true },
  { id: 'rec-2', studio_id: STUDIO_ID, socio_id: 's2', suscripcion_id: 'sus-2', concepto: 'Renovación Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null, es_renovacion: true },
];

// Caso que se nos escapó: una socia con DOS suscripciones activas. El panel de
// antes agrupaba por SUSCRIPCIÓN y sus recibos salían dos veces: «Marcar todas»
// no llegaba nunca a «Quitar todas» (#370). Ahora se agrupa por clienta; el caso
// se queda para que no vuelva.
const SUSCRIPCIONES_DOBLES = [
  ...SUSCRIPCIONES,
  { id: 'sus-1b', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Contadores {
  /** Cuerpos de los POST a /api/cobros/marcar-cobrado. */
  cobros: { reciboIds: string[]; metodo: string | null; lote?: boolean }[];
  /** Cualquier escritura directa a `rest/v1/recibos` desde el navegador. Tiene que ser 0. */
  escriturasDirectas: number;
}

async function montarCobros(
  page: Page,
  suscripciones: unknown[] = SUSCRIPCIONES,
  opts: { rechazar?: boolean; recibos?: unknown[] } = {},
): Promise<Contadores> {
  const c: Contadores = { cobros: [], escriturasDirectas: 0 };

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
  await page.route('**/api/cobros/marcar-cobrado', route => {
    const cuerpo = JSON.parse(route.request().postData() ?? '{}') as { reciboIds: string[]; metodo: string | null; lote?: boolean };
    c.cobros.push(cuerpo);
    // Simula que el servidor rechaza antes de tocar nada (sesión, rol): el camino
    // que antes se tragaba en silencio y aun así pintaba facturas y renovaciones.
    if (opts.rechazar) return json(route, { error: 'Tu rol no puede registrar cobros' }, 403);
    return json(route, {
      resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })),
    });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, suscripciones));
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() !== 'GET') {
      c.escriturasDirectas++;
      return json(route, { message: 'el panel no debería escribir recibos directamente' }, 400);
    }
    return json(route, opts.recibos ?? RECIBOS);
  });

  await page.goto('/cobros');
  return c;
}

const barra = (page: Page) => page.getByRole('toolbar', { name: 'Cobrar las seleccionadas' });

async function seleccionarTodas(page: Page, n: number) {
  await page.getByRole('button', { name: 'Seleccionar varias' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: `Marcar todas (${n})` }).click();
}

test.describe('Cobrar varias a la vez', () => {
  test('las pestañas, en el idioma de la dueña, y sin las de antes', async ({ page }) => {
    await montarCobros(page);

    await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Lo que he cobrado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Facturas' })).toBeVisible();

    // Las pestañas de la fila intermedia y la de estados ya no existen.
    await expect(page.getByRole('button', { name: 'Suscripciones activas', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Historial', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cobros', exact: true })).toHaveCount(0);

    // Las cuotas siguen, como «Próximas cuotas» y no como pestaña.
    await expect(page.getByRole('button', { name: 'Próximas cuotas' })).toBeVisible();
  });

  test('abre sin nada marcado: no hay con qué cobrar hasta marcar a alguien', async ({ page }) => {
    await montarCobros(page);
    await page.getByRole('button', { name: 'Seleccionar varias' }).click({ timeout: 30_000 });

    await expect(page.getByRole('button', { name: 'Marcar todas (2)' })).toBeVisible();
    await expect(barra(page)).toHaveCount(0);
  });

  test('no cobra nada hasta confirmar, y la confirmación avisa de lo irreversible', async ({ page }) => {
    const c = await montarCobros(page);
    await seleccionarTodas(page, 2);
    await expect(barra(page)).toContainText('2 seleccionadas');

    // Sin método no se sigue: el cobro no entraría en la caja ni en el desglose.
    const cobrar = barra(page).getByRole('button', { name: 'Cobrar las 2' });
    await expect(cobrar).toBeDisabled();
    await barra(page).getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await cobrar.click();

    // Dice exactamente qué va a pasar, incluido lo que no se puede deshacer.
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await expect(dialogo).toContainText('Vas a cobrar 2 recibos');
    await expect(dialogo).toContainText('Te han pagado con tarjeta');
    await expect(dialogo).toContainText('2 cuotas');
    await expect(dialogo).toContainText('Esto no se puede deshacer');

    // Hasta aquí no se ha tocado ni un recibo.
    expect(c.cobros).toHaveLength(0);

    // Y volverse atrás tampoco cobra, ni pierde lo marcado.
    await dialogo.getByRole('button', { name: 'Volver a la lista' }).click();
    await expect(barra(page)).toContainText('2 seleccionadas');
    expect(c.cobros).toHaveLength(0);
    expect(c.escriturasDirectas).toBe(0);
  });

  test('con una socia de dos suscripciones, «Marcar todas» y «Desmarcar todas» siguen funcionando', async ({ page }) => {
    await montarCobros(page, SUSCRIPCIONES_DOBLES);
    // Dos clientas, no tres: Ana no sale dos veces por tener dos suscripciones.
    await seleccionarTodas(page, 2);
    await expect(barra(page)).toContainText('2 seleccionadas');

    await page.getByRole('button', { name: 'Desmarcar todas' }).click();
    await expect(barra(page)).toHaveCount(0);
  });

  // ── Cuando el servidor dice que no ───────────────────────────────────────────
  // `marcarCobrado` escribía de forma optimista y SIN await: marcaba el recibo
  // como COBRADO en pantalla, emitía una factura con número fiscal y renovaba el
  // bono, todo antes de saber si la escritura había funcionado. Si fallaba, nadie
  // se enteraba: el resumen decía "2 cobros procesados" igual.
  test('si el servidor rechaza, lo dice y no da los cobros por buenos', async ({ page }) => {
    const c = await montarCobros(page, SUSCRIPCIONES, { rechazar: true });
    await seleccionarTodas(page, 2);
    await barra(page).getByRole('button', { name: 'Efectivo', exact: true }).click();
    await barra(page).getByRole('button', { name: 'Cobrar las 2' }).click();
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();

    // Ni un solo cobro dado por bueno, y se explica qué ha pasado.
    await expect(dialogo).toContainText('0 cobros guardados', { timeout: 15_000 });
    // Sin contador esto sería hueco: «no mintió» puede ser verdad por no haber
    // intentado nada.
    expect(c.cobros.length, 'el cobro no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
    await expect(dialogo).toContainText('no se han podido guardar');
    await expect(dialogo).toContainText('siguen sin cobrar');
    await expect(dialogo).not.toContainText('2 cobros guardados');
    expect(c.escriturasDirectas, 'el panel no puede caer a escribir el recibo él mismo').toBe(0);
  });

  test('si el servidor acepta, el resumen cuadra con lo que dijo', async ({ page }) => {
    const c = await montarCobros(page);
    await seleccionarTodas(page, 2);
    await barra(page).getByRole('button', { name: 'Bizum', exact: true }).click();
    await barra(page).getByRole('button', { name: 'Cobrar las 2' }).click();
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();

    await expect(dialogo).toContainText('2 cobros guardados', { timeout: 15_000 });
    // Con el método elegido: así entra en la caja y en el desglose por método.
    expect(c.cobros.every(x => x.metodo === 'BIZUM'), JSON.stringify(c.cobros)).toBe(true);
    // Como lote: el servidor no cobra lo que tenga un pago online, el datáfono o un
    // reintento en marcha (serían dos cobros).
    expect(c.cobros.every(x => x.lote === true), JSON.stringify(c.cobros)).toBe(true);
    await expect(dialogo).not.toContainText('no se han podido guardar');
    // Se pidió al servidor, con los dos recibos y sin repetir ninguno.
    expect(c.cobros.length).toBeGreaterThan(0);
    expect(c.cobros.flatMap(x => x.reciboIds).sort()).toEqual(['rec-1', 'rec-2']);
    // Y el navegador no escribió el recibo por su cuenta.
    expect(c.escriturasDirectas).toBe(0);
  });

  // Antes solo entraban los PENDIENTE de clientas con un plan ACTIVO.
  test('entra todo lo que se debe —también lo rechazado y lo devuelto por el banco—, y no lo que está en el banco ni lo que se reintenta solo', async ({ page }) => {
    const base = { studio_id: STUDIO_ID, fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null };
    const c = await montarCobros(page, [], { recibos: [
      { ...base, id: 'rec-suelta', socio_id: 's1', suscripcion_id: null, concepto: 'Clase suelta', importe: 15, estado: 'PENDIENTE' },
      { ...base, id: 'rec-fallido', socio_id: 's2', suscripcion_id: null, concepto: 'Mensual — junio', importe: 60, estado: 'FALLIDO' },
      { ...base, id: 'rec-banco', socio_id: 's2', suscripcion_id: null, concepto: 'Mensual — mayo', importe: 60, estado: 'DEVUELTO', importe_devuelto: 0 },
      { ...base, id: 'rec-remesa', socio_id: 's1', suscripcion_id: null, concepto: 'Mensual — julio', importe: 60, estado: 'EN_CURSO' },
      { ...base, id: 'rec-solo', socio_id: 's1', suscripcion_id: null, concepto: 'Mensual — agosto', importe: 60, estado: 'PENDIENTE', proximo_reintento: '2026-10-05T08:00:00Z' },
    ] });

    await seleccionarTodas(page, 2);
    // La clase suelta de Ana, y lo rechazado y lo devuelto por el banco de Bea.
    await expect(barra(page)).toContainText('135,00 €');
    await barra(page).getByRole('button', { name: 'Efectivo', exact: true }).click();
    await barra(page).getByRole('button', { name: 'Cobrar las 2' }).click();
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await expect(dialogo).toContainText('Vas a cobrar 3 recibos');
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();
    await expect.poll(() => c.cobros.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(c.cobros.flatMap(x => x.reciboIds).sort()).toEqual(['rec-banco', 'rec-fallido', 'rec-suelta']);
  });
});
