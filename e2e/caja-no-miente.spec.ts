import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La caja no dice «Cobrado» hasta que lo dice el banco.
//
// El TPV anterior tenía dos formas de mentir, y las dos eran un clic:
//   · en Bizum, un botón «Cobro realizado» que registraba la venta como pagada
//     sin preguntarle nada a Stripe (page.frozen.tsx:782);
//   · y un camino de respaldo que hacía lo mismo cuando el checkout ni siquiera
//     respondía (:468).
// Además `finalizarVenta()` no esperaba a que la escritura terminara: el
// overlay de «¡Cobrado!» salía antes de saber si la venta había llegado a la
// base de datos.
//
// ⚠️ Estos tests cuentan las PETICIONES, no solo miran la pantalla. Un test de
// camino de fallo sin contador es hueco: «no mintió» puede ser verdad
// simplemente porque no se intentó nada, y pasaría igual con la pantalla rota.
// Es la lección de #992/#994 que documenta .claude/tentare-os.md.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_DUENA = 'auth-e2e-duena';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID_DUENA, email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21,
};

const EQUIPO = [{
  id: 'ins-cloe', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true,
  rol: 'PROPIETARIO', color: '#343825', auth_user_id: UID_DUENA,
}];

const SOCIOS = [
  { id: 'soc-1', studio_id: STUDIO_ID, nombre: 'María', apellidos: 'García',
    email: 'maria@example.com', activo: true, fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {} },
];

// Lo que María debe. El contexto los carga por PostgREST, no por /api.
const RECIBOS = [
  { id: 'rec-cuota', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: null,
    concepto: 'Cuota de septiembre', importe: 60, estado: 'PENDIENTE',
    fecha_vencimiento: '2026-09-01', fecha_cobro: null, fecha_devolucion: null,
    intentos_reintento: 0, metodo_cobro: null },
];

const CATALOGO = {
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado: true },
  productos: [
    { id: 'p-calcetines', nombre: 'Calcetines Pilates', descripcion: null, categoria: 'PRODUCTO',
      precio: 25, activo: true, stock: 10, stockMinimo: 5, ivaPct: 21,
      imagenUrl: null, sku: null, codigoBarras: null },
    { id: 'p-agotado', nombre: 'Botella agotada', descripcion: null, categoria: 'PRODUCTO',
      precio: 12.5, activo: true, stock: 0, stockMinimo: 0, ivaPct: 21,
      imagenUrl: null, sku: null, codigoBarras: null },
  ],
  planes: [
    { id: 'plan-bono', nombre: 'Bono Reformer 10', descripcion: null, precio: 80,
      tipo: 'BONO', sesiones: 10, validezDias: 90, ivaPct: 21 },
  ],
  caja: { id: 'caja-1', fondoInicial: 100, abiertaEn: '2026-09-07T08:00:00Z', abiertaPor: 'Cloe' },
  hoy: { ventas: 0, total: 0, ticketMedio: 0, porMetodo: [], ultimas: [] },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, UID_DUENA] as const);
}

/** Contadores compartidos: lo que de verdad demuestra que un camino se recorrió. */
type Contadores = { ventas: number; confirmaciones: number; cuerpos: unknown[] };

async function montar(
  page: Page,
  manejarVenta: (route: Route, cuerpo: Record<string, unknown>) => Promise<void> | void,
  manejarConfirmar?: (route: Route, intento: number) => Promise<void> | void,
): Promise<Contadores> {
  const c: Contadores = { ventas: 0, confirmaciones: 0, cuerpos: [] };

  // ⚠️ El ORDEN importa y no es el intuitivo: Playwright da prioridad a la
  // ruta registrada MÁS TARDE. Los comodines van primero y lo específico
  // después, o el `**/api/**` se traga `/api/pos/venta` y todos los contadores
  // se quedan a cero — que es exactamente lo que pasó la primera vez.
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.route('**/api/**', (route) => json(route, {}));

  await page.route('**/api/layout**', (route) =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (route) => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', (route) => json(route, { activa: true, plan: 'ESTUDIO', features: {} }));
  await page.route('**/api/theme**', (route) => json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/rpc/current_studio_id', (route) => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', (route) => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/instructores**', (route) => json(route, EQUIPO));
  await page.route('**/rest/v1/socios**', (route) => json(route, SOCIOS));
  await page.route('**/rest/v1/recibos**', (route) => json(route, RECIBOS));

  await page.route('**/api/pos/catalogo**', (route) => json(route, CATALOGO));
  await page.route('**/api/pos/caja**', (route) => json(route, { caja: CATALOGO.caja, esperado: 100, movimientos: [] }));
  await page.route('**/api/pos/venta/confirmar', async (route) => {
    c.confirmaciones++;
    if (manejarConfirmar) await manejarConfirmar(route, c.confirmaciones);
    else await json(route, { ventaId: 'v1', numero: 1, estado: 'PENDIENTE_PAGO', pagoEstado: 'PROCESANDO', total: 0 });
  });
  // La de venta va la ÚLTIMA porque `**/api/pos/venta/confirmar` también casa
  // con `**/api/pos/venta**`; registrando esta después, la más genérica de las
  // dos gana para la ruta exacta y la de confirmar sigue atendida por la suya.
  await page.route('**/api/pos/venta', async (route) => {
    c.ventas++;
    const cuerpo = JSON.parse(route.request().postData() ?? '{}');
    c.cuerpos.push(cuerpo);
    await manejarVenta(route, cuerpo);
  });

  await seedSesion(page);
  return c;
}

async function abrirCaja(page: Page) {
  await page.goto('/pos');
  await expect(page.getByPlaceholder(/Buscar artículo/i)).toBeVisible({ timeout: 30_000 });
}

async function anadirCalcetines(page: Page) {
  // Ancla al principio del nombre accesible: los botones ± del ticket llevan
  // el artículo en su aria-label («Añadir una unidad de Calcetines Pilates»),
  // que es lo correcto para un lector de pantalla pero casa con un `/…/` suelto.
  await page.getByRole('button', { name: /^Calcetines Pilates/ }).click();
}

// ─── Efectivo ────────────────────────────────────────────────────────────────

test('el cambio que enseña es el correcto, y sale del servidor', async ({ page }) => {
  const c = await montar(page, (route) =>
    json(route, {
      ventaId: 'v1', numero: 1, subtotal: 50, descuento: 0, baseImponible: 41.32,
      ivaTotal: 8.68, total: 50, cambio: 50, estado: 'PAGADA', pagoEstado: 'PAGADO',
      entrega: { bonos: 0, creditos: 0, facturaSellada: true, avisos: [] },
    }));

  await abrirCaja(page);
  await anadirCalcetines(page);
  await anadirCalcetines(page);

  await expect(page.getByRole('button', { name: /Cobrar/ })).toBeVisible();
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();

  // 100 € por un total de 50 € → 50 € de vuelta.
  await page.getByLabel('¿Con cuánto paga?').fill('100');
  await expect(page.getByText('Cambio')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Devuelve')).toBeVisible();

  // El contador prueba que la venta se INTENTÓ de verdad, y el cuerpo prueba
  // que se mandaron ids y cantidades, nunca importes.
  expect(c.ventas).toBeGreaterThan(0);
  const cuerpo = c.cuerpos[0] as Record<string, unknown>;
  expect(cuerpo.metodoPago).toBe('EFECTIVO');
  expect(JSON.stringify(cuerpo.lineas)).toContain('p-calcetines');
  expect(JSON.stringify(cuerpo)).not.toContain('"precio":25');
  expect(cuerpo).not.toHaveProperty('total');
  expect(cuerpo).not.toHaveProperty('subtotal');
});

test('no deja confirmar en efectivo si lo entregado no llega', async ({ page }) => {
  const c = await montar(page, (route) => json(route, {}));

  await abrirCaja(page);
  await anadirCalcetines(page);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();

  await page.getByLabel('¿Con cuánto paga?').fill('10');
  await expect(page.getByText('Falta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();

  // Y no se ha llamado al servidor: el ticket sigue vivo, nada se registró.
  expect(c.ventas).toBe(0);
});

// ─── Datáfono: el corazón del asunto ─────────────────────────────────────────

test('mientras espera al datáfono NUNCA dice que se ha cobrado', async ({ page }) => {
  const c = await montar(
    page,
    (route) => json(route, {
      ventaId: 'v1', numero: 1, subtotal: 25, descuento: 0, baseImponible: 20.66,
      ivaTotal: 4.34, total: 25, cambio: null,
      estado: 'PENDIENTE_PAGO', pagoEstado: 'PROCESANDO',
      pago: { referencia: 'pi_123', url: null },
    }),
    // El servidor sigue diciendo que no está confirmado.
    (route) => json(route, { ventaId: 'v1', numero: 1, estado: 'PENDIENTE_PAGO', pagoEstado: 'PROCESANDO', total: 25 }),
  );

  await abrirCaja(page);
  await anadirCalcetines(page);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Datáfono/ }).click();

  await expect(page.getByText(/Esperando la confirmación del banco/i)).toBeVisible({ timeout: 15_000 });

  // Se deja correr el polling y se vuelve a mirar: en ningún momento aparece
  // «Cobrado», ni el ticket se vacía.
  await page.waitForTimeout(4_000);
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Devuelve')).toHaveCount(0);

  // Y se ha PREGUNTADO de verdad, más de una vez. Sin esto, el test pasaría
  // igual con el polling roto.
  expect(c.ventas).toBe(1);
  expect(c.confirmaciones).toBeGreaterThan(1);
});

test('si el datáfono rechaza la tarjeta, lo dice y no da la venta por buena', async ({ page }) => {
  const c = await montar(
    page,
    (route) => json(route, {
      ventaId: 'v1', numero: 1, subtotal: 25, descuento: 0, baseImponible: 20.66,
      ivaTotal: 4.34, total: 25, cambio: null,
      estado: 'PENDIENTE_PAGO', pagoEstado: 'PROCESANDO',
      pago: { referencia: 'pi_123', url: null },
    }),
    (route) => json(route, {
      ventaId: 'v1', numero: 1, estado: 'ANULADA', pagoEstado: 'RECHAZADO',
      total: 25, motivo: 'La tarjeta ha sido rechazada.',
    }),
  );

  await abrirCaja(page);
  await anadirCalcetines(page);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Datáfono/ }).click();

  await expect(page.getByText(/No se ha completado el cobro/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/rechazada/i)).toBeVisible();
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);

  expect(c.ventas).toBe(1);
  expect(c.confirmaciones).toBeGreaterThan(0);
});

test('si el servidor responde 409 al registrar, el mostrador se entera', async ({ page }) => {
  // Un 4xx del servidor: sin stock. El TPV anterior se lo tragaba y enseñaba
  // el overlay de éxito igualmente.
  const c = await montar(page, (route) =>
    json(route, { error: 'Solo queda 1 de «Calcetines Pilates».', codigo: 'SIN_STOCK' }, 409));

  await abrirCaja(page);
  await anadirCalcetines(page);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('50');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(page.getByText(/No se ha completado el cobro/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Solo queda 1/)).toBeVisible();
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);
  expect(c.ventas).toBe(1);
});

// ─── Reglas del catálogo ─────────────────────────────────────────────────────

test('un artículo agotado no se puede meter en el ticket', async ({ page }) => {
  const c = await montar(page, (route) => json(route, {}));
  await abrirCaja(page);

  const agotado = page.getByRole('button', { name: /Botella agotada/ });
  await expect(agotado).toBeDisabled();
  await expect(page.getByText('Agotado')).toBeVisible();

  // El ticket sigue vacío y no se ha llamado a nadie.
  await expect(page.getByText('Ticket vacío')).toBeVisible();
  expect(c.ventas).toBe(0);
});

test('un bono SÍ se puede cobrar sin ficha, avisando de que queda por asignar', async ({ page }) => {
  // Alguien entra de la calle a pagar una clase de prueba y no da sus datos.
  // Antes esto bloqueaba el botón de cobrar, y el mostrador acababa
  // tecleándolo como importe libre con el concepto a mano: el dinero entraba
  // igual, pero la clase no quedaba registrada como clase en ningún sitio.
  //
  // La regla nueva es «avisa, no impide»: se cobra, y el bono queda sin
  // entregar hasta que alguien le ponga ficha desde Ventas.
  const c = await montar(page, (route) =>
    json(route, {
      ventaId: 'v1', numero: 1, subtotal: 80, descuento: 0, baseImponible: 66.12,
      ivaTotal: 13.88, total: 80, cambio: 20, estado: 'PAGADA', pagoEstado: 'PAGADO',
      entrega: { bonos: 0, creditos: 0, facturaSellada: true, avisos: [] },
    }));
  await abrirCaja(page);

  await page.getByRole('button', { name: /Bono Reformer 10/ }).click();

  // Avisa...
  await expect(page.getByText('Sin ficha: el bono quedará por asignar')).toBeVisible();
  // ...pero NO impide.
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('100');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Sin contador esto sería un test hueco: «no bloqueó» puede ser verdad por
  // no haber intentado nada.
  expect(c.ventas).toBe(1);
  const cuerpo = c.cuerpos[0] as { socioId: string | null };
  expect(
    cuerpo.socioId,
    'la venta sin ficha viaja SIN clienta; inventar una sería peor que no tenerla',
  ).toBeNull();
});

test('desde «Cobrado» se puede sacar la factura, sin salir del mostrador', async ({ page }) => {
  // «¿Me das la factura?» es la pregunta más normal del mostrador. La factura
  // se sellaba desde el primer día, pero había que salir del TPV, entrar en
  // Cobros → Facturas y buscar el número, con la clienta esperando.
  const c = await montar(page, (route) =>
    json(route, {
      ventaId: 'v1', numero: 1, subtotal: 25, descuento: 0, baseImponible: 20.66,
      ivaTotal: 4.34, total: 25, cambio: 0, estado: 'PAGADA', pagoEstado: 'PAGADO',
      entrega: { bonos: 0, creditos: 0, facturaSellada: true, avisos: [] },
    }));

  await page.route('**/api/pos/factura**', (route) =>
    json(route, {
      factura: {
        id: 'fac-1', studioId: STUDIO_ID, reciboId: 'rec-1', numeroCompleto: 'A-2026-0049',
        fechaEmision: '2026-09-07', receptorNombre: 'Cliente de mostrador', receptorNIF: null,
        baseImponible: 20.66, tipoIVA: 21, cuotaIVA: 4.34, total: 25,
        verifactuHash: 'abc', verifactuPrevHash: null, verifactuTs: null, verifactuSeq: 1,
        verifactuEstado: 'PENDIENTE', verifactuCsv: null, serie: 'A', tipo: 'F2',
        rectificaA: null, tipoRectificativa: null, importeRectificacion: null,
      },
      receptor: null,
      numeroVenta: 1,
    }));

  await abrirCaja(page);
  await anadirCalcetines(page);
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('25');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  // El número real, no un botón genérico: si dice «Factura A-2026-0049» es que
  // el documento existe de verdad y se ha leído.
  await expect(page.getByRole('button', { name: /Factura A-2026-0049/ })).toBeEnabled({ timeout: 15_000 });
  expect(c.ventas).toBe(1);
});

test('el ticket enseña el IVA desglosado, no una cifra suelta', async ({ page }) => {
  await montar(page, (route) => json(route, {}));
  await abrirCaja(page);
  await anadirCalcetines(page);

  await expect(page.getByText('Subtotal')).toBeVisible();
  // Exacto: la línea del ticket también dice «25,00 € · IVA 21%». Lo que se
  // comprueba aquí es la fila del desglose de totales.
  await expect(page.getByText('IVA 21%', { exact: true })).toBeVisible();
  await expect(page.getByText('Total', { exact: true })).toBeVisible();
});

test('dos ventas iguales seguidas son DOS ventas, no una repetida', async ({ page }) => {
  // ⚠️ Este test nació al revés y fijaba un bug como si fuera la protección.
  //
  // La clave de idempotencia se ataba solo al CONTENIDO del ticket, así que dos
  // clientas comprando lo mismo —una botella en efectivo, el caso más común de
  // un mostrador— producían la misma clave: el servidor devolvía la venta de la
  // primera, la segunda no se registraba nunca, el stock no bajaba y la
  // pantalla decía «Cobrado» igual. A partir de la primera venta de una forma
  // dada, ninguna igual volvía a existir en ese estudio.
  //
  // Lo que la clave tiene que identificar es ESTE INTENTO DE COBRO, no la forma
  // del carrito.
  const c = await montar(page, (route) =>
    json(route, {
      ventaId: 'v1', numero: 1, subtotal: 25, descuento: 0, baseImponible: 20.66,
      ivaTotal: 4.34, total: 25, cambio: 0, estado: 'PAGADA', pagoEstado: 'PAGADO',
    }));

  const cobrarEnEfectivo = async () => {
    await page.getByRole('button', { name: /Cobrar/ }).click();
    await page.getByRole('button', { name: /^Efectivo/ }).click();
    await page.getByLabel('¿Con cuánto paga?').fill('25');
    await page.getByRole('button', { name: 'Confirmar pago' }).click();
    await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  };

  await abrirCaja(page);
  await anadirCalcetines(page);
  await cobrarEnEfectivo();
  await page.getByRole('button', { name: 'Nueva venta' }).click();
  await anadirCalcetines(page);
  await cobrarEnEfectivo();

  expect(c.ventas).toBe(2);
  const a = c.cuerpos[0] as { idempotenciaClave: string };
  const b = c.cuerpos[1] as { idempotenciaClave: string };
  expect(
    a.idempotenciaClave,
    'dos ventas distintas con el mismo carrito NO pueden compartir clave',
  ).not.toBe(b.idempotenciaClave);
});


test('el importe libre se cobra, y va como línea LIBRE con su concepto', async ({ page }) => {
  // Es el ÚNICO sitio donde el precio lo pone el cliente. Se comprueba que
  // viaja etiquetado como LIBRE —el servidor lo acota aparte— y no disfrazado
  // de artículo de catálogo.
  const c = await montar(page, (route) =>
    json(route, {
      ventaId: 'v1', numero: 1, subtotal: 12, descuento: 0, baseImponible: 9.92,
      ivaTotal: 2.08, total: 12, cambio: 0, estado: 'PAGADA', pagoEstado: 'PAGADO',
    }));

  await abrirCaja(page);
  await page.getByRole('button', { name: /Importe libre/ }).click();
  await page.getByLabel('Concepto del importe libre').fill('Arreglo de cinta');
  // Exacto: «Concepto del importe libre» contiene esta misma cadena.
  await page.getByLabel('Importe libre', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();

  await expect(page.getByText('Arreglo de cinta')).toBeVisible();
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('12');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(c.ventas).toBe(1);
  const cuerpo = c.cuerpos[0] as { lineas: { tipo: string; nombre?: string; precio?: number }[] };
  expect(cuerpo.lineas[0].tipo).toBe('LIBRE');
  expect(cuerpo.lineas[0].nombre).toBe('Arreglo de cinta');
  expect(cuerpo.lineas[0].precio).toBe(12);
});

test('dentro del MISMO intento la clave no cambia (doble toque, reintento de red)', async ({ page }) => {
  // La otra mitad: mientras no se vacíe el ticket ni se toque el carrito, dos
  // envíos son el mismo cobro. Aquí el primer intento falla con un error de
  // servidor y se reintenta desde la misma hoja, sin tocar nada.
  let intento = 0;
  const c = await montar(page, (route) => {
    intento++;
    if (intento === 1) return json(route, { error: 'Se ha caído la conexión.' }, 500);
    return json(route, {
      ventaId: 'v1', numero: 1, subtotal: 25, descuento: 0, baseImponible: 20.66,
      ivaTotal: 4.34, total: 25, cambio: 0, estado: 'PAGADA', pagoEstado: 'PAGADO',
    });
  });

  await abrirCaja(page);
  await anadirCalcetines(page);
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('25');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(page.getByText(/No se ha completado el cobro/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Probar otra vez' }).click();
  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('25');
  await page.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(c.ventas).toBe(2);
  const a = c.cuerpos[0] as { idempotenciaClave: string };
  const b = c.cuerpos[1] as { idempotenciaClave: string };
  expect(
    a.idempotenciaClave,
    'reintentar el mismo cobro tiene que llevar la misma clave, o se cobraría dos veces',
  ).toBe(b.idempotenciaClave);
});


test('lo que la socia debe se ve y se cobra desde el TPV, con el ticket VACÍO', async ({ page }) => {
  // «Vengo a pagar la cuota» es de lo más normal del mostrador, y obligaba a
  // salir a /cobros — donde además ese efectivo no se apuntaba en la caja, así
  // que el arqueo del día salía sobrado sin explicación.
  //
  // ⚠️ El ticket VACÍO es la parte que importa del test. La primera versión
  // metió este panel dentro del pie del ticket, que entero está detrás de
  // `carrito.length > 0`: quien viene solo a pagar la cuota no lleva nada en
  // el ticket, así que no se habría visto NUNCA cuando más falta hace.
  await montar(page, (route) => json(route, {}));
  await abrirCaja(page);

  // Se elige a la socia desde el mismo buscador, sin añadir nada al ticket.
  await page.getByPlaceholder(/Buscar artículo/i).fill('María');
  await page.getByRole('button', { name: /María García/ }).click();

  await expect(page.getByText('Ticket vacío')).toBeVisible();
  await expect(page.getByText(/Debe 60/)).toBeVisible();
  await expect(page.getByText('Cuota de septiembre')).toBeVisible();
  await expect(page.getByRole('button', { name: /Efectivo/ })).toBeEnabled();

  // Y solo efectivo: marcar una tarjeta como pagada sin que ningún proveedor
  // lo confirme es justo lo que este rediseño existe para impedir.
  await expect(page.getByText(/Solo efectivo desde aquí/)).toBeVisible();
});
