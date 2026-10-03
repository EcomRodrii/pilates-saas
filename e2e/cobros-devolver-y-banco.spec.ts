import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Cobros: el dinero que sale y lo que está en el banco (2-oct-2026).
//
//  · «Le he devuelto el dinero» y «El banco lo devolvió» son hechos opuestos y
//    tienen cada uno su botón. Antes un solo «Devolver» dejaba como DEUDA un
//    cobro en efectivo que el estudio había devuelto en mano.
//  · Lo que está «En el banco» (una remesa) tiene salida: «lo ha cobrado» o «lo
//    devolvió». Antes se quedaba ahí para siempre. Solo si pudo salir en una
//    remesa (el estudio las hace y la clienta tiene domiciliación); si no, «No
//    llegó a ir al banco» lo devuelve a sin cobrar.
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

// «Lo que he cobrado» abre en el mes de hoy: los cobros van fechados hoy (hora del estudio).
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
  { id: 's2', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'López', email: 'bea@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];

const BASE = {
  studio_id: STUDIO_ID, suscripcion_id: null, fecha_vencimiento: '2026-09-20', fecha_devolucion: null,
  intentos_reintento: 0, sepa_estado: null, importe_devuelto: 0, stripe_payment_intent_id: null,
};
const EN_EFECTIVO = { ...BASE, id: 'rec-efectivo', socio_id: 's1', concepto: 'Bono 5 clases', importe: 45, estado: 'COBRADO', fecha_cobro: HOY, metodo_cobro: 'EFECTIVO' };
const CON_TARJETA = { ...BASE, id: 'rec-tarjeta', socio_id: 's2', concepto: 'Mensual — septiembre', importe: 60, estado: 'COBRADO', fecha_cobro: HOY, metodo_cobro: 'TARJETA' };
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
  /** Escrituras directas a `rest/v1/recibos`: tienen que ser 0 (salvo «No llegó a ir al banco»). */
  escriturasDirectas: number;
  /** «No llegó a ir al banco»: EN_CURSO → PENDIENTE, la única escritura del navegador que queda. */
  aPendiente: { url: string; cuerpo: Fila }[];
}

async function montar(page: Page, opts: {
  recibos: Fila[];
  ruta?: string;
  reembolso?: Respuesta;
  devuelto?: Respuesta;
  cobrado?: Respuesta;
  exportar?: Respuesta;
  conRemesa?: boolean;
}): Promise<Llamadas> {
  const ll: Llamadas = { reembolso: [], devuelto: [], cobrado: [], reintento: [], exportes: 0, escriturasDirectas: 0, aPendiente: [] };
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
    { id: 'm-1', studio_id: STUDIO_ID, socio_id: 's2', iban_ultimos4: '1332', ref_mandato: 'REF-1', fecha_firma: '2026-01-01', estado: 'VIGENTE', creada_en: '2026-01-01T00:00:00Z' },
  ] : []));
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    const cuerpo = req.method() === 'PATCH' ? JSON.parse(req.postData() ?? '{}') as Fila : null;
    if (cuerpo?.estado === 'PENDIENTE' && req.url().includes('estado=eq.EN_CURSO')) {
      ll.aPendiente.push({ url: decodeURIComponent(req.url()), cuerpo });
      return json(route, opts.recibos.filter(r => req.url().includes(String(r.id))).map(r => ({ id: r.id })));
    }
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

  await page.goto(opts.ruta ?? '/cobros');
  await expect(page.getByRole('button', { name: 'Quién me debe' })).toBeVisible({ timeout: 30_000 });
  return ll;
}

const fila = (page: Page, id: string) => page.locator(`[data-recibo="${id}"]`);

/** Abre el ⋯ de un recibo y elige una acción (por cómo empieza su texto). */
/** El ⋯ al centro de la pantalla: en la esquina de abajo vive la burbuja de ayuda del panel. */
async function abrirMenu(page: Page, id: string) {
  const boton = fila(page, id).getByRole('button', { name: /^Acciones de/ });
  await boton.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await boton.click();
}

async function accion(page: Page, id: string, texto: string) {
  await abrirMenu(page, id);
  await page.getByRole('menuitem', { name: new RegExp(`^${texto}`) }).click();
}

/** Lo que ofrece el ⋯ de un recibo (activo o apagado), y lo cierra. */
async function opciones(page: Page, id: string): Promise<string[]> {
  await abrirMenu(page, id);
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const textos = await menu.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return textos.map(t => t.split('\n')[0].trim());
}

const enLoCobrado = { ruta: '/cobros?tab=cobrado' };

test.describe('Devolver un cobro: dos hechos, dos acciones', () => {
  test('un cobro en efectivo: solo «Le he devuelto el dinero» (ningún banco lo devuelve); con tarjeta, los dos', async ({ page }) => {
    await montar(page, { recibos: [EN_EFECTIVO, CON_TARJETA], ...enLoCobrado });
    await expect(fila(page, 'rec-efectivo')).toBeVisible({ timeout: 15_000 });

    const efectivo = await opciones(page, 'rec-efectivo');
    expect(efectivo).toContain('Le he devuelto el dinero');
    expect(efectivo).not.toContain('El banco lo devolvió');

    const tarjeta = await opciones(page, 'rec-tarjeta');
    expect(tarjeta).toContain('Le he devuelto el dinero');
    expect(tarjeta).toContain('El banco lo devolvió');
  });

  test('«Le he devuelto el dinero» pregunta por dónde salió (sin «sin especificar») y va por el servidor', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO], ...enLoCobrado });
    await accion(page, 'rec-efectivo', 'Le he devuelto el dinero');

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
      const ll = await montar(page, { recibos: [EN_EFECTIVO], reembolso: respuesta, ...enLoCobrado });
      await accion(page, 'rec-efectivo', 'Le he devuelto el dinero');
      await page.getByRole('dialog').getByRole('button', { name: 'Efectivo', exact: true }).click();

      await expect(page.getByText(respuesta.body.error)).toBeVisible({ timeout: 10_000 });
      // Contador: «no lo dio por devuelto» podría ser verdad por no haber intentado nada.
      expect(ll.reembolso.length, 'tiene que haber intentado la devolución').toBeGreaterThan(0);
      await expect(page.getByText(/Devolución registrada/)).toHaveCount(0);
      expect(ll.escriturasDirectas).toBe(0);
    });
  }

  test('si la red se cae, no da la devolución por hecha y manda a comprobarla', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO], reembolso: 'red', ...enLoCobrado });
    await accion(page, 'rec-efectivo', 'Le he devuelto el dinero');
    await page.getByRole('dialog').getByRole('button', { name: 'Efectivo', exact: true }).click();

    await expect(page.getByText(/No hemos podido confirmar la devolución/)).toBeVisible({ timeout: 10_000 });
    expect(ll.reembolso.length).toBeGreaterThan(0);
    await expect(page.getByText(/Devolución registrada/)).toHaveCount(0);
  });

  test('«El banco lo devolvió» pide confirmar y manda el estado que se veía', async ({ page }) => {
    const ll = await montar(page, { recibos: [CON_TARJETA], ...enLoCobrado });
    await accion(page, 'rec-tarjeta', 'El banco lo devolvió');

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
  const enElBanco = (page: Page) => page.getByRole('region', { name: 'En el banco' });

  test('«El banco lo ha cobrado» lo cierra por el servidor, como cobro del banco (sin método del mostrador)', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EL_BANCO], conRemesa: true });
    await enElBanco(page).getByRole('button', { name: 'El banco lo ha cobrado' }).click({ timeout: 15_000 });
    expect(ll.cobrado).toHaveLength(0);
    await page.getByRole('button', { name: 'Sí, lo ha cobrado' }).click();

    await expect(page.getByText('Cobro registrado: 60,00 € de Bea López.')).toBeVisible({ timeout: 10_000 });
    expect(ll.cobrado).toEqual([{ reciboIds: ['rec-remesa'], canal: 'banco' }]);
    expect(ll.escriturasDirectas).toBe(0);
  });

  test('si el servidor no lo deja cerrar, se dice y sigue en el banco', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EL_BANCO], conRemesa: true, cobrado: { status: 409, body: { error: 'Tu rol no puede registrar cobros' } } });
    await enElBanco(page).getByRole('button', { name: 'El banco lo ha cobrado' }).click({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sí, lo ha cobrado' }).click();

    await expect(page.getByText('Tu rol no puede registrar cobros')).toBeVisible({ timeout: 10_000 });
    expect(ll.cobrado.length, 'tiene que haber intentado cerrarlo').toBeGreaterThan(0);
    await expect(page.getByText(/Cobro registrado/)).toHaveCount(0);
  });

  test('«El banco lo devolvió» desde el banco: vuelve a deber', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EL_BANCO], conRemesa: true });
    await enElBanco(page).getByRole('button', { name: 'El banco lo devolvió' }).click({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sí, lo devolvió el banco' }).click();

    await expect.poll(() => ll.devuelto.length).toBeGreaterThan(0);
    expect(ll.devuelto[0]).toEqual({ reciboId: 'rec-remesa', desde: 'EN_CURSO' });
  });

  test('con un cobro de Stripe en vuelo, o un reintento programado, no se ofrece nada: lo cierra Stripe', async ({ page }) => {
    await montar(page, {
      recibos: [{ ...EN_EL_BANCO, stripe_payment_intent_id: 'pi_1' }, { ...EN_EL_BANCO, id: 'rec-reintento', proximo_reintento: '2026-10-05' }],
      conRemesa: true,
    });
    for (const id of ['rec-remesa', 'rec-reintento']) {
      const f = fila(page, id);
      await expect(f.getByText('Lo cierra Stripe'), id).toBeVisible({ timeout: 15_000 });
      await expect(f.getByRole('button', { name: 'El banco lo ha cobrado' }), id).toHaveCount(0);
      await expect(f.getByRole('button', { name: /^Acciones de/ }), id).toHaveCount(0);
    }
  });

  test('⚠️ lo que no pudo salir en una remesa no lo cobra ni lo devuelve «el banco»: solo «No llegó a ir al banco»', async ({ page }) => {
    // Un EN_CURSO del «Reintentar» de antes (el estudio sin domiciliaciones):
    // darlo por cobrado inventaría un ingreso y una factura.
    const ll = await montar(page, { recibos: [EN_EL_BANCO], conRemesa: false });
    const f = fila(page, 'rec-remesa');
    await expect(f).toBeVisible({ timeout: 15_000 });
    await expect(f.getByRole('button', { name: 'El banco lo ha cobrado' })).toHaveCount(0);
    await expect(f.getByRole('button', { name: 'El banco lo devolvió' })).toHaveCount(0);
    await accion(page, 'rec-remesa', 'No llegó a ir al banco');

    // Hasta confirmar, nada.
    await expect(page.getByRole('dialog')).toContainText('vuelve a «Sin cobrar»');
    expect(ll.aPendiente).toHaveLength(0);
    await page.getByRole('button', { name: 'Sí, vuelve a sin cobrar' }).click();

    await expect.poll(() => ll.aPendiente.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(ll.aPendiente[0].cuerpo).toEqual({ estado: 'PENDIENTE' });
    // Solo desde EN_CURSO y sin ningún cobro en marcha, en el propio UPDATE.
    for (const filtro of ['estado=eq.EN_CURSO', 'stripe_payment_intent_id=is.null', 'checkout_session_id=is.null', 'cobro_mostrador_pi=is.null', 'proximo_reintento=is.null']) {
      expect(ll.aPendiente[0].url, filtro).toContain(filtro);
    }
    expect(ll.cobrado.length + ll.devuelto.length + ll.escriturasDirectas).toBe(0);
  });

  test('con remesas, la clienta sin domiciliación tampoco: solo «No llegó a ir al banco»', async ({ page }) => {
    // El mandato del montaje es de Bea (s2): este recibo es de Ana.
    await montar(page, { recibos: [{ ...EN_EL_BANCO, socio_id: 's1' }], conRemesa: true });
    await expect(fila(page, 'rec-remesa')).toBeVisible({ timeout: 15_000 });
    // Las domiciliaciones llegan en la segunda ola: hasta entonces, nada se decide.
    await expect.poll(async () => opciones(page, 'rec-remesa'), { timeout: 15_000 }).toEqual(['No llegó a ir al banco']);
    await expect(fila(page, 'rec-remesa').getByRole('button', { name: 'El banco lo ha cobrado' })).toHaveCount(0);
  });

  test('«Reintentar por el banco» vuelve a la próxima remesa por el servidor, y solo si va a entrar en ella', async ({ page }) => {
    const ll = await montar(page, { recibos: [DEVUELTO_POR_EL_BANCO], conRemesa: true });
    await page.getByRole('button', { name: 'Abrir la ficha de Bea López' }).click({ timeout: 15_000 });
    await expect.poll(async () => opciones(page, 'rec-devuelto'), { timeout: 15_000 }).toContain('Reintentar por el banco');
    await accion(page, 'rec-devuelto', 'Reintentar por el banco');
    await page.getByRole('button', { name: 'Sí, a la próxima remesa' }).click();

    await expect.poll(() => ll.reintento.length).toBeGreaterThan(0);
    expect(ll.reintento[0]).toEqual({ reciboId: 'rec-devuelto' });
    expect(ll.escriturasDirectas, 'antes lo escribía el navegador como «Enviado al banco»').toBe(0);
  });

  test('sin domiciliaciones configuradas no se ofrece «Reintentar por el banco» (no iría a ningún banco)', async ({ page }) => {
    await montar(page, { recibos: [DEVUELTO_POR_EL_BANCO], conRemesa: false });
    await page.getByRole('button', { name: 'Abrir la ficha de Bea López' }).click({ timeout: 15_000 });
    const lista = await opciones(page, 'rec-devuelto');
    expect(lista).toContain('Cobrar solo este recibo');
    expect(lista).not.toContain('Reintentar por el banco');
  });
});

test.describe('Descargar para la gestoría', () => {
  test('baja lo COBRADO, no lo que te deben', async ({ page }) => {
    const ll = await montar(page, { recibos: [EN_EFECTIVO, { ...BASE, id: 'rec-debe', socio_id: 's2', concepto: 'Mensual — octubre', importe: 60, estado: 'PENDIENTE', fecha_cobro: null, metodo_cobro: null }], ...enLoCobrado });
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
    const ll = await montar(page, { recibos: [EN_EFECTIVO], exportar: { status: 500, body: { message: 'boom' } }, ...enLoCobrado });
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
