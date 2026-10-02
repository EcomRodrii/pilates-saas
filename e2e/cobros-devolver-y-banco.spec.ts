import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Cobros: el dinero que sale y lo que está en el banco (2-oct-2026).
//
//  · «Le he devuelto el dinero» y «El banco lo devolvió» son hechos opuestos y
//    tienen cada uno su botón. Antes un solo «Devolver» dejaba como DEUDA un
//    cobro en efectivo que el estudio había devuelto en mano.
//  · Lo que está «En el banco» (una remesa) tiene salida: «lo ha cobrado» o «lo
//    devolvió». Antes se quedaba ahí para siempre.
//  · «Reintentar por el banco» lo devuelve a la próxima remesa por el servidor,
//    no escribiendo «Enviado al banco» sin mandar nada.
//  · «Descargar para la gestoría» baja lo COBRADO (antes, lo que te deben).
//
// Todo va por el servidor: cada camino cuenta sus llamadas, y ninguno escribe el
// recibo directamente desde el navegador.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

type Fila = Record<string, unknown>;

const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
  { id: 's2', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'López', email: 'bea@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];

const BASE = {
  studio_id: STUDIO_ID, suscripcion_id: null, fecha_vencimiento: '2026-09-20', fecha_devolucion: null,
  intentos_reintento: 0, sepa_estado: null, importe_devuelto: 0, stripe_payment_intent_id: null,
};
const EN_EFECTIVO = { ...BASE, id: 'rec-efectivo', socio_id: 's1', concepto: 'Bono 5 clases', importe: 45, estado: 'COBRADO', fecha_cobro: '2026-09-28', metodo_cobro: 'EFECTIVO' };
const CON_TARJETA = { ...BASE, id: 'rec-tarjeta', socio_id: 's2', concepto: 'Mensual — septiembre', importe: 60, estado: 'COBRADO', fecha_cobro: '2026-09-27', metodo_cobro: 'TARJETA' };
const EN_EL_BANCO = { ...BASE, id: 'rec-remesa', socio_id: 's2', concepto: 'Mensual — octubre', importe: 60, estado: 'EN_CURSO', fecha_cobro: null, metodo_cobro: null };
const DEVUELTO_POR_EL_BANCO = { ...BASE, id: 'rec-devuelto', socio_id: 's2', concepto: 'Mensual — agosto', importe: 60, estado: 'DEVUELTO', fecha_cobro: '2026-08-05', fecha_devolucion: '2026-08-09', metodo_cobro: 'SEPA', intentos_reintento: 1 };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Respuesta = { status: number; body: unknown } | 'red';

interface Llamadas {
  reembolso: Fila[];
  devuelto: Fila[];
  cobrado: Fila[];
  reintento: Fila[];
  /** Lecturas de lo cobrado para la descarga de la gestoría. */
  exportes: number;
  /** Escrituras directas a `rest/v1/recibos`: tienen que ser 0. */
  escriturasDirectas: number;
}

async function montar(page: Page, opts: {
  recibos: Fila[];
  reembolso?: Respuesta;
  devuelto?: Respuesta;
  cobrado?: Respuesta;
  exportar?: Respuesta;
  conRemesa?: boolean;
}): Promise<Llamadas> {
  const ll: Llamadas = { reembolso: [], devuelto: [], cobrado: [], reintento: [], exportes: 0, escriturasDirectas: 0 };
  const responder = (route: Route, r: Respuesta | undefined, porDefecto: unknown) => {
    if (r === 'red') return route.abort('failed');
    return json(route, r ? r.body : porDefecto, r ? r.status : 200);
  };

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
  await page.route('**/api/cobros/reembolso-manual', route => {
    ll.reembolso.push(JSON.parse(route.request().postData() ?? '{}'));
    return responder(route, opts.reembolso, { ok: true, yaEstaba: false, importe: 45, caja: 'APUNTADA' });
  });
  await page.route('**/api/cobros/marcar-devuelto', route => {
    ll.devuelto.push(JSON.parse(route.request().postData() ?? '{}'));
    return responder(route, opts.devuelto, { ok: true, fechaDevolucion: '2026-10-02', yaEstaba: false });
  });
  await page.route('**/api/cobros/marcar-cobrado', route => {
    const cuerpo = JSON.parse(route.request().postData() ?? '{}') as { reciboIds: string[] };
    ll.cobrado.push(cuerpo);
    return responder(route, opts.cobrado, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })) });
  });
  await page.route('**/api/cobros/reintentar-banco', route => {
    ll.reintento.push(JSON.parse(route.request().postData() ?? '{}'));
    return json(route, { ok: true, intentosReintento: 2 });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, {
    id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000',
    ...(opts.conRemesa ? { sepa_acreedor_id: 'ES00ZZZ00000000', sepa_iban: 'ES9121000418450200051332', sepa_titular: 'Studio Carmen' } : {}),
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/mandatos_sepa**', route => json(route, opts.conRemesa ? [
    { id: 'm-1', studio_id: STUDIO_ID, socio_id: 's2', iban: 'ES9121000418450200051332', ref_mandato: 'REF-1', fecha_firma: '2026-01-01', estado: 'VIGENTE', creada_en: '2026-01-01T00:00:00Z' },
  ] : []));
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      ll.escriturasDirectas++;
      return json(route, { message: 'el panel no debería escribir recibos directamente' }, 400);
    }
    // La lectura de la descarga para la gestoría (lo cobrado, con la clienta).
    if (req.url().includes('fecha_cobro=gte')) {
      ll.exportes++;
      return responder(route, opts.exportar, opts.recibos
        .filter(r => r.estado === 'COBRADO')
        .map(r => ({ ...r, socios: SOCIAS.find(s => s.id === r.socio_id) ?? null })));
    }
    return json(route, opts.recibos);
  });

  await page.goto('/cobros');
  await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
  return ll;
}

const fila = (page: Page, id: string) => page.locator(`[data-recibo="${id}"]`);

async function verTodos(page: Page) {
  await page.getByLabel('Ver').selectOption('TODOS');
}

test.describe('Devolver un cobro: dos hechos, dos botones', () => {
  test('un cobro en efectivo: solo «Le he devuelto el dinero» (ningún banco lo devuelve); con tarjeta, los dos', async ({ page }) => {
    await montar(page, { recibos: [EN_EFECTIVO, CON_TARJETA] });
    await verTodos(page);

    const efectivo = fila(page, 'rec-efectivo');
    await efectivo.hover();
    await expect(efectivo.getByTitle('Le he devuelto el dinero (ya no debe nada)')).toBeVisible();
    await expect(efectivo.getByTitle('El banco lo devolvió (vuelve a deber)')).toHaveCount(0);

    const tarjeta = fila(page, 'rec-tarjeta');
    await tarjeta.hover();
    await expect(tarjeta.getByTitle('Le he devuelto el dinero (ya no debe nada)')).toBeVisible();
    await expect(tarjeta.getByTitle('El banco lo devolvió (vuelve a deber)')).toBeVisible();
  });

  test('«Le he devuelto el dinero» pregunta por dónde salió (sin «sin especificar») y va por el servidor', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO] });
    await verTodos(page);
    await fila(page, 'rec-efectivo').hover();
    await fila(page, 'rec-efectivo').getByTitle('Le he devuelto el dinero (ya no debe nada)').click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('¿Cómo le has devuelto el dinero?');
    await expect(dialogo).toContainText('Lo que compró con este cobro no se le quita');
    await expect(dialogo.getByRole('button', { name: /sin especificar/ })).toHaveCount(0);
    await dialogo.getByRole('button', { name: 'Efectivo', exact: true }).click();

    await expect(page.getByText(/Devolución registrada: 45,00 € a Ana Ruiz\. Apuntado en la caja\./)).toBeVisible({ timeout: 10_000 });
    expect(ll.reembolso).toEqual([{ reciboId: 'rec-efectivo', metodo: 'EFECTIVO' }]);
    expect(ll.devuelto, 'no es «el banco lo devolvió»: eso lo dejaría como deuda').toHaveLength(0);
    expect(ll.escriturasDirectas).toBe(0);
  });

  for (const [caso, respuesta] of [
    ['el servidor dice que no (entró por Stripe)', { status: 409, body: { error: 'Este cobro entró por Stripe: devuélvelo desde la ficha de la clienta («Devolver»), y el recibo se marcará solo.' } }],
    ['el servidor se cae', { status: 500, body: { error: 'No se ha podido registrar la devolución.' } }],
  ] as const) {
    test(`si ${caso}, se dice y el cobro sigue como estaba`, async ({ page }) => {
      const ll = await montar(page, { recibos: [EN_EFECTIVO], reembolso: respuesta });
      await verTodos(page);
      await fila(page, 'rec-efectivo').hover();
      await fila(page, 'rec-efectivo').getByTitle('Le he devuelto el dinero (ya no debe nada)').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Efectivo', exact: true }).click();

      await expect(page.getByText(respuesta.body.error)).toBeVisible({ timeout: 10_000 });
      // Contador: «no lo dio por devuelto» podría ser verdad por no haber intentado nada.
      expect(ll.reembolso.length, 'tiene que haber intentado la devolución').toBeGreaterThan(0);
      await expect(page.getByText(/Devolución registrada/)).toHaveCount(0);
      expect(ll.escriturasDirectas).toBe(0);
    });
  }

  test('si la red se cae, no da la devolución por hecha y manda a comprobarla', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO], reembolso: 'red' });
    await verTodos(page);
    await fila(page, 'rec-efectivo').hover();
    await fila(page, 'rec-efectivo').getByTitle('Le he devuelto el dinero (ya no debe nada)').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Efectivo', exact: true }).click();

    await expect(page.getByText(/No hemos podido confirmar la devolución/)).toBeVisible({ timeout: 10_000 });
    expect(ll.reembolso.length).toBeGreaterThan(0);
    await expect(page.getByText(/Devolución registrada/)).toHaveCount(0);
  });

  test('«El banco lo devolvió» pide confirmar y manda el estado que se veía', async ({ page }) => {
    const ll = await montar(page, { recibos: [CON_TARJETA] });
    await verTodos(page);
    await fila(page, 'rec-tarjeta').hover();
    await fila(page, 'rec-tarjeta').getByTitle('El banco lo devolvió (vuelve a deber)').click();

    // Hasta confirmar, nada.
    await expect(page.getByRole('dialog')).toContainText('vuelve a deber 60,00 €');
    expect(ll.devuelto).toHaveLength(0);
    await page.getByRole('button', { name: 'Sí, lo devolvió el banco' }).click();

    await expect.poll(() => ll.devuelto.length).toBeGreaterThan(0);
    expect(ll.devuelto[0]).toEqual({ reciboId: 'rec-tarjeta', desde: 'COBRADO' });
    expect(ll.escriturasDirectas).toBe(0);
  });
});

test.describe('Lo que está en el banco', () => {
  test('«El banco lo ha cobrado» lo cierra por el servidor, como cobro del banco (sin método del mostrador)', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EL_BANCO] });
    const f = fila(page, 'rec-remesa');
    await f.hover();
    await f.getByTitle('El banco ha cobrado este recibo de la remesa').click();
    expect(ll.cobrado).toHaveLength(0);
    await page.getByRole('button', { name: 'Sí, lo ha cobrado' }).click();

    await expect(page.getByText('Cobro registrado: 60,00 € de Bea López.')).toBeVisible({ timeout: 10_000 });
    expect(ll.cobrado).toEqual([{ reciboIds: ['rec-remesa'], canal: 'banco' }]);
    expect(ll.escriturasDirectas).toBe(0);
  });

  test('si el servidor no lo deja cerrar, se dice y sigue en el banco', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EL_BANCO], cobrado: { status: 409, body: { error: 'Tu rol no puede registrar cobros' } } });
    const f = fila(page, 'rec-remesa');
    await f.hover();
    await f.getByTitle('El banco ha cobrado este recibo de la remesa').click();
    await page.getByRole('button', { name: 'Sí, lo ha cobrado' }).click();

    await expect(page.getByText('Tu rol no puede registrar cobros')).toBeVisible({ timeout: 10_000 });
    expect(ll.cobrado.length, 'tiene que haber intentado cerrarlo').toBeGreaterThan(0);
    await expect(page.getByText(/Cobro registrado/)).toHaveCount(0);
  });

  test('«El banco lo devolvió» desde el banco: vuelve a deber', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EL_BANCO] });
    const f = fila(page, 'rec-remesa');
    await f.hover();
    await f.getByTitle('El banco lo devolvió').click();
    await page.getByRole('button', { name: 'Sí, lo devolvió el banco' }).click();

    await expect.poll(() => ll.devuelto.length).toBeGreaterThan(0);
    expect(ll.devuelto[0]).toEqual({ reciboId: 'rec-remesa', desde: 'EN_CURSO' });
  });

  test('con un cobro de Stripe en vuelo no se ofrece nada: lo cierra Stripe', async ({ page }) => {
    await montar(page, { recibos: [{ ...EN_EL_BANCO, stripe_payment_intent_id: 'pi_1' }] });
    const f = fila(page, 'rec-remesa');
    await f.hover();
    await expect(f.getByText('Lo cierra Stripe')).toBeVisible();
    await expect(f.getByTitle('El banco ha cobrado este recibo de la remesa')).toHaveCount(0);
  });

  test('«Reintentar» vuelve a la próxima remesa por el servidor, y solo si va a entrar en ella', async ({ page }) => {
    const ll = await montar(page, { recibos: [DEVUELTO_POR_EL_BANCO], conRemesa: true });
    await verTodos(page);
    const f = fila(page, 'rec-devuelto');
    await f.hover();
    await f.getByRole('button', { name: 'Reintentar' }).click();
    await page.getByRole('button', { name: 'Sí, a la próxima remesa' }).click();

    await expect.poll(() => ll.reintento.length).toBeGreaterThan(0);
    expect(ll.reintento[0]).toEqual({ reciboId: 'rec-devuelto' });
    expect(ll.escriturasDirectas, 'antes lo escribía el navegador como «Enviado al banco»').toBe(0);
  });

  test('sin domiciliaciones configuradas no se ofrece «Reintentar» (no iría a ningún banco)', async ({ page }) => {
    await montar(page, { recibos: [DEVUELTO_POR_EL_BANCO], conRemesa: false });
    await verTodos(page);
    const f = fila(page, 'rec-devuelto');
    await f.hover();
    await expect(f.getByRole('button', { name: 'Cobrar' })).toBeVisible();
    await expect(f.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  });
});

test.describe('Descargar para la gestoría', () => {
  test('baja lo COBRADO, no lo que te deben', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO, { ...BASE, id: 'rec-debe', socio_id: 's2', concepto: 'Mensual — octubre', importe: 60, estado: 'PENDIENTE', fecha_cobro: null, metodo_cobro: null }] });
    await page.goto('/cobros?tab=cobrado');
    const boton = page.getByRole('button', { name: 'Descargar para la gestoría' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    const descarga = page.waitForEvent('download');
    await boton.click();
    const fichero = await descarga;
    const csv = readFileSync(await fichero.path(), 'utf8');

    expect(ll.exportes).toBeGreaterThan(0);
    expect(csv).toContain('Bono 5 clases');
    expect(csv).not.toContain('Mensual — octubre');
    expect(csv.split('\n')[0]).toContain('Neto (€)');
  });

  test('si la lectura falla, no descarga un fichero a medias', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO], exportar: { status: 500, body: { message: 'boom' } } });
    await page.goto('/cobros?tab=cobrado');
    const boton = page.getByRole('button', { name: 'Descargar para la gestoría' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    let descargas = 0;
    page.on('download', () => { descargas++; });
    await boton.click();

    await expect(page.getByText('No se ha podido preparar el fichero. Inténtalo otra vez en un momento.')).toBeVisible({ timeout: 10_000 });
    expect(ll.exportes, 'tiene que haber intentado leer').toBeGreaterThan(0);
    expect(descargas).toBe(0);
  });
});
