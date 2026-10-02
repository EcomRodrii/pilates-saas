import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Añadir a la clase» cobra la clase suelta en el mostrador, de verdad (maqueta
// aprobada del rediseño del Calendario, 1-oct-2026), y desde el 2-oct la clase
// suelta es la tarifa PUNTUAL de una sesión que gasta la reserva: le vale la
// política de cancelación del estudio como a un bono (decisión del fundador).
//
// Lo que tiene que ser cierto, con dinero de por medio:
//  · PRIMERO la plaza y DESPUÉS el cobro. La venta (la clase suelta y su recibo
//    pendiente) la hace el SERVIDOR al reservar; el navegador no crea recibos.
//  · El cobro lo confirma el SERVIDOR (`/api/cobros/marcar-cobrado`), con el
//    método que se eligió: un recibo no nace cobrado desde el navegador.
//  · Si la plaza no se da, no se cobra. Los caminos de fallo llevan contador
//    (regla del repo): «no cobró» sin comprobar que se INTENTÓ reservar puede
//    ser verdad por no haber hecho nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// El día del ESTUDIO, no el de UTC (la semana del Calendario empieza hoy en Madrid).
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 4, color: '#6366F1' }];
const INSTRUCTORES = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null }];

function socia(id: string, nombre: string) {
  return { id, studio_id: STUDIO_ID, nombre, apellidos: 'Ruiz', email: `${id}@example.com`, telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] };
}

// Ana (ya en la clase) y Cris traen su cuota; Bea no trae nada. La clase suelta del estudio, 15 €.
const PLANES = [
  { id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true },
  { id: 'plan-suelta', studio_id: STUDIO_ID, nombre: 'Clase suelta', descripcion: null, precio: 15, tipo: 'PUNTUAL', sesiones: 1, validez_dias: 30, limite_semanal: null, activo: true },
];
const SUSCRIPCIONES = ['s1', 's3'].map(socioId => ({ id: `sus-${socioId}`, studio_id: STUDIO_ID, socio_id: socioId, plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-01-01', fecha_fin: '2030-01-01', sesiones_restantes: null, stripe_subscription_id: null }));

// La clase, dentro de dos horas en punto: ni ya empezada (sería un walk-in, con
// su check-in por medio) ni fuera de la semana que se ve, sea la hora que sea.
const INICIO = (() => { const d = new Date(Date.now() + 2 * 3_600_000); d.setUTCMinutes(0, 0, 0); return d; })();
function sesion(aforo: number, precioPuntual: number | null) {
  return {
    id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio: INICIO.toISOString(), fin: new Date(INICIO.getTime() + 55 * 60_000).toISOString(), aforo_maximo: aforo, cancelada: false,
    notas: null, serie_id: null, precio_puntual: precioPuntual,
  };
}
const RESERVAS = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00`, posicion_espera: null, spot_id: null }];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Lo que contesta el servidor al reservar: con `claseSuelta`, la venta (el
// recibo pendiente que cuelga de la reserva) como la hace `crearReservaMostrador`.
function reservaOk(cuerpo: Record<string, unknown>) {
  const suelta = cuerpo.claseSuelta as { importeEsperado: number } | undefined;
  return {
    ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: cuerpo.reservaId, repetida: false, cubiertaPor: null,
    venta: suelta ? { reciboId: `rec-suelta-${cuerpo.reservaId}`, importe: suelta.importeEsperado, concepto: 'Clase suelta — Reformer' } : null,
    avisoVenta: null,
  };
}

async function montarCalendario(page: Page, opts: {
  aforo?: number;
  /** El servidor contesta esto en vez de la reserva con su venta. */
  reserva?: { status: number; body: unknown };
  /**
   * Lo que pasa en cada intento de reservar, por orden: `red` corta la
   * conexión (no llega respuesta) y `ok` contesta la reserva con su venta.
   */
  intentos?: ('red' | 'ok')[];
  cobroSinDetalle?: boolean;
  /** Recibos que ya hay (lo que lee el panel al cargar). */
  recibosGuardados?: Record<string, unknown>[];
  /** El precio propio de la sesión (un taller). */
  precioPuntual?: number | null;
  planes?: Record<string, unknown>[];
} = {}) {
  const ses = sesion(opts.aforo ?? 4, opts.precioPuntual ?? null);
  const orden: string[] = [];
  const reservas: Record<string, unknown>[] = [];
  const recibos: Record<string, unknown>[] = [];
  const cobros: { reciboIds: string[]; metodo: string | null }[] = [];

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, opts.planes ?? PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));
  await page.route('**/rest/v1/socios**', route => json(route, [socia('s1', 'Ana'), socia('s2', 'Bea'), socia('s3', 'Cris')]));
  await page.route('**/rest/v1/sesiones**', route => json(route, [ses]));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [{
      id: ses.id, studioId: ses.studio_id, tipoClaseId: ses.tipo_clase_id, salaId: ses.sala_id,
      instructorId: ses.instructor_id, inicio: ses.inicio, fin: ses.fin, aforoMaximo: ses.aforo_maximo,
      cancelada: false, notas: null, precioPuntual: ses.precio_puntual, serieId: null,
      incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
    }],
    reservas: RESERVAS.map(r => ({
      id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
      spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: r.creada_en,
    })),
    sustituciones: [],
    salas: SALAS.map(r => ({ id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color })),
    instructores: INSTRUCTORES.map(r => ({
      id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono,
      color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol, authUserId: r.auth_user_id,
    })),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/api/reservas/crear', route => {
    orden.push('reserva');
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    reservas.push(cuerpo);
    const intento = opts.intentos?.[reservas.length - 1];
    if (intento === 'red') return route.abort('failed');
    if (opts.reserva && !intento) return json(route, opts.reserva.body, opts.reserva.status);
    return json(route, reservaOk(cuerpo));
  });
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() === 'GET' && opts.recibosGuardados) return json(route, opts.recibosGuardados);
    if (req.method() !== 'POST') return route.fallback();
    // El navegador NO debería llegar aquí: la venta la hace el servidor.
    orden.push('recibo');
    const cuerpo = req.postDataJSON() as Record<string, unknown> | Record<string, unknown>[];
    recibos.push(...(Array.isArray(cuerpo) ? cuerpo : [cuerpo]));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  await page.route('**/api/cobros/marcar-cobrado', route => {
    orden.push('cobro');
    const cuerpo = route.request().postDataJSON() as { reciboIds: string[]; metodo: string | null };
    cobros.push(cuerpo);
    // Un 200 sin detalle por recibo es «no sé», nunca «cobrado».
    if (opts.cobroSinDetalle) return json(route, {});
    return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })) });
  });

  await page.goto('/calendario');
  return { orden, reservas, recibos, cobros };
}

async function abrirAnadir(page: Page) {
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Añadir clienta a la clase' }).click();
}

async function abrirBea(page: Page) {
  await abrirAnadir(page);
  // Bea no trae bono: su fila lo dice y se despliega para cobrarle.
  const bea = page.getByRole('button', { name: /Bea Ruiz/ });
  await expect(bea).toContainText('No tiene bono ni cuota que valga para esta clase');
  await bea.click();
}

test.describe('Cobrar la clase suelta al añadir a una clienta', () => {
  test('quien viene con su cuota dice con qué viene y entra de un toque, sin vender ni cobrar', async ({ page }) => {
    const { reservas, recibos, cobros } = await montarCalendario(page);
    await abrirAnadir(page);
    const cris = page.getByRole('button', { name: /Cris Ruiz/ });
    await expect(cris).toContainText('Con su Mensual');
    await cris.click();

    await expect(page.getByText('Cris añadida a la clase')).toBeVisible({ timeout: 30_000 });
    expect(reservas[0]).toMatchObject({ sesionId: 'ses-1', socioId: 's3' });
    expect(reservas[0].claseSuelta).toBeUndefined();
    expect(recibos).toHaveLength(0);
    expect(cobros).toHaveLength(0);
  });

  test('a quien no trae bono se le vende la clase suelta al reservar y se cobra después, por el servidor y con el método', async ({ page }) => {
    const { orden, reservas, recibos, cobros } = await montarCalendario(page);
    await abrirBea(page);
    // Ningún método viene marcado: sin elegirlo no se cobra.
    const cobrar = page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ });
    await expect(cobrar).toBeDisabled();
    await page.getByRole('button', { name: 'Bizum', exact: true }).click();
    await cobrar.click();

    await expect(page.getByText('15,00 € cobrados por Bizum · Bea añadida a la clase')).toBeVisible({ timeout: 30_000 });
    // Plaza primero (con la venta dentro) y cobro después; el navegador no crea recibos.
    expect(orden).toEqual(['reserva', 'cobro']);
    // `comoClaseSuelta` va con ella: si se volviera al servidor de antes, sabría no gastarle un bono además.
    expect(reservas[0]).toMatchObject({ sesionId: 'ses-1', socioId: 's2', claseSuelta: { importeEsperado: 15 }, comoClaseSuelta: true });
    expect(recibos).toHaveLength(0);
    expect(cobros[0]).toEqual({ reciboIds: [`rec-suelta-${reservas[0].reservaId}`], metodo: 'BIZUM' });
  });

  test('el precio propio de la sesión (un taller) es el que dice el botón y el que se pide', async ({ page }) => {
    const { reservas } = await montarCalendario(page, { precioPuntual: 25 });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 25,00 € y añadirla/ }).click();
    await expect(page.getByText('25,00 € cobrados en efectivo · Bea añadida a la clase')).toBeVisible({ timeout: 30_000 });
    expect(reservas[0]).toMatchObject({ claseSuelta: { importeEsperado: 25 } });
  });

  test('si el servidor no confirma el cobro, la pantalla no dice «cobrados»', async ({ page }) => {
    const { cobros } = await montarCalendario(page, { cobroSinDetalle: true });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText(/no consta el cobro/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/cobrados en efectivo/)).toHaveCount(0);
    expect(cobros.length, 'se intentó cobrar').toBe(1);
  });

  test('«cóbraselo después» la apunta con su clase suelta y el recibo pendiente, sin cobrar', async ({ page }) => {
    const { orden, reservas, recibos, cobros } = await montarCalendario(page);
    await abrirBea(page);
    await page.getByRole('button', { name: /cóbraselo después/ }).click();

    await expect(page.getByText('Bea añadida · recibo de 15,00 € pendiente en Cobros')).toBeVisible({ timeout: 30_000 });
    expect(orden).toEqual(['reserva']);
    expect(reservas[0]).toMatchObject({ socioId: 's2', claseSuelta: { importeEsperado: 15 } });
    expect(recibos).toHaveLength(0);
    expect(cobros).toHaveLength(0);
  });

  test('si el servidor ve que ya traía bono (la pantalla tenía su cartera vieja), no se cobra', async ({ page }) => {
    const { reservas, cobros } = await montarCalendario(page, {
      // Renovó el bono desde su app y el iPad aún no lo sabe: el servidor lo lee al reservar y no vende.
      reserva: { status: 200, body: { ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: 'x', repetida: false, cubiertaPor: { tipo: 'BONO', plan: 'Bono 10 clases' }, venta: null, avisoVenta: null } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText('Bea entra con su Bono 10 clases, que ya cubría esta clase: no se le ha cobrado nada'))
      .toBeVisible({ timeout: 30_000 });
    expect(reservas.length, 'tiene que haber reservado').toBe(1);
    expect(cobros).toHaveLength(0);
  });

  for (const [caso, respuesta] of [
    ['el servidor no da la plaza', { status: 400, body: { error: 'Esta clienta ya tiene una reserva a esa hora.' } }],
    ['el precio ha cambiado', { status: 409, body: { error: 'El precio de esta clase ha cambiado: ahora son 18,00 €. Vuelve a abrirla para cobrar el de ahora.' } }],
    ['el servidor se cae', { status: 500, body: { error: 'No se ha podido apuntar. Inténtalo otra vez.' } }],
  ] as const) {
    test(`si ${caso}, no se cobra nada y se dice`, async ({ page }) => {
      const { reservas, cobros } = await montarCalendario(page, { reserva: respuesta });
      await abrirBea(page);
      await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
      await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

      await expect(page.getByText(/No se le ha cobrado nada/)).toBeVisible({ timeout: 30_000 });
      expect(reservas.length, 'tiene que haber intentado reservar').toBeGreaterThan(0);
      expect(cobros).toHaveLength(0);
    });
  }

  // La venta ocurre en el servidor ANTES de contestar: si la respuesta se
  // pierde, puede haber quedado apuntada con su recibo pendiente.
  test('si la red corta al reservar, se reintenta con la MISMA reserva y se cobra una sola vez', async ({ page }) => {
    const { reservas, cobros } = await montarCalendario(page, { intentos: ['red', 'ok'] });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Bizum', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText('15,00 € cobrados por Bizum · Bea añadida a la clase')).toBeVisible({ timeout: 30_000 });
    expect(reservas).toHaveLength(2);
    expect(reservas[1].reservaId, 'el reintento lleva el mismo id: el servidor reconoce su reserva y su venta').toBe(reservas[0].reservaId);
    expect(cobros).toHaveLength(1);
  });

  test('si la red corta dos veces, no promete «no se le ha cobrado nada»: manda a mirar la clase', async ({ page }) => {
    const { reservas, cobros } = await montarCalendario(page, { intentos: ['red', 'red'] });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText(/No se ha podido confirmar si Bea ha quedado apuntada: mira la clase antes de cobrarle/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/No se le ha cobrado nada/)).toHaveCount(0);
    expect(reservas).toHaveLength(2);
    expect(cobros).toHaveLength(0);
  });

  test('si se llegó a vender y no se pudo deshacer, lo dice en vez de «no se le ha cobrado nada»', async ({ page }) => {
    const { reservas, cobros } = await montarCalendario(page, {
      reserva: { status: 500, body: { error: 'No se ha podido apuntar. Inténtalo otra vez.', reciboPendiente: true } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText(/Ha quedado un recibo pendiente de esta clase suelta que sobra: elimínalo en «Quién me debe»/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/No se le ha cobrado nada/)).toHaveCount(0);
    expect(reservas.length, 'tiene que haber intentado reservar').toBeGreaterThan(0);
    expect(cobros).toHaveLength(0);
  });

  test('si ya estaba apuntada por un intento anterior, se cobra la clase suelta de AQUEL, no otra', async ({ page }) => {
    const { reservas, cobros } = await montarCalendario(page, {
      reserva: { status: 200, body: {
        ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: 'res-anterior', repetida: true, cubiertaPor: null,
        venta: { reciboId: 'rec-suelta-res-anterior', importe: 15, concepto: 'Clase suelta — Reformer' }, avisoVenta: null,
      } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText('15,00 € cobrados en efectivo · Bea ya estaba en la clase')).toBeVisible({ timeout: 30_000 });
    expect(reservas).toHaveLength(1);
    expect(cobros).toEqual([{ reciboIds: ['rec-suelta-res-anterior'], metodo: 'EFECTIVO' }]);
  });

  test('si el servidor no puede comprobar cómo quedó la clase suelta, no se cobra y se manda a mirar', async ({ page }) => {
    const { reservas, cobros } = await montarCalendario(page, {
      reserva: { status: 200, body: {
        ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: 'x', repetida: false, cubiertaPor: null, venta: null,
        avisoVenta: 'no se ha podido comprobar si ha entrado con su clase suelta: mira su ficha y «Quién me debe» antes de cobrarle.',
      } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText(/Bea está en la clase, pero no se ha podido comprobar si ha entrado con su clase suelta/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Nuevo cobro/)).toHaveCount(0);
    expect(reservas.length, 'tiene que haber intentado reservar').toBeGreaterThan(0);
    expect(cobros).toHaveLength(0);
  });

  test('si entra con la clase suelta que recuperó, no se le cobra otra y se recuerda lo que aún debe de aquella', async ({ page }) => {
    const { cobros } = await montarCalendario(page, {
      reserva: { status: 200, body: {
        ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: 'x', repetida: false,
        cubiertaPor: { tipo: 'BONO', plan: 'Clase suelta', suelta: { debe: 15 } }, venta: null, avisoVenta: null,
      } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText('Bea entra con la clase suelta que recuperó: no se le cobra otra. Sigue debiendo 15,00 € de aquella, en «Quién me debe»'))
      .toBeVisible({ timeout: 30_000 });
    expect(cobros).toHaveLength(0);
  });

  test('con la clase llena no se ofrece cobrar: va a la lista de espera sin cargo', async ({ page }) => {
    await montarCalendario(page, { aforo: 1 });
    await abrirBea(page);
    await expect(page.getByRole('button', { name: 'Apuntarla a la lista de espera' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cobrar .* y añadirla/ })).toHaveCount(0);
  });

  test('si la tarifa de clase suelta no vale para este tipo de clase, no se ofrece cobrar y se dice qué hacer', async ({ page }) => {
    await montarCalendario(page, { planes: [PLANES[0], { ...PLANES[1] }] });
    // La tarifa solo vale para Mat (otra clase): la de Reformer no se puede vender desde aquí.
    await page.route('**/rest/v1/plan_tipos_clase**', route => json(route, [{ plan_id: 'plan-suelta', tipo_clase_id: 'tc-mat', limite_semanal: null }]));
    await page.reload();
    await abrirBea(page);
    await expect(page.getByText(/Tu tarifa de clase suelta no vale para este tipo de clase/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Cobrar .* y añadirla/ })).toHaveCount(0);
  });

  // Ana tiene su clase suelta en un recibo que cuelga de su reserva (`rec-suelta-r1`).
  async function quitarAAna(page: Page, recibo: Record<string, unknown>, cancelar: Record<string, unknown>) {
    await montarCalendario(page, {
      recibosGuardados: [{
        id: 'rec-suelta-r1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: 'sus-suelta-r1', concepto: 'Clase suelta — Reformer',
        importe: 15, importe_devuelto: 0, fecha_vencimiento: HOY, fecha_cobro: null, metodo_cobro: null, intentos_reintento: 0,
        ...recibo,
      }],
    });
    // Después del arnés: si no, su catch-all de `/api/**` la tapa.
    const cancelaciones: unknown[] = [];
    await page.route('**/api/reservas/cancelar', route => {
      cancelaciones.push(route.request().postDataJSON());
      return json(route, { ok: true, recuperacionCreada: false, recuperacionCaducaEl: null, recuperacionAlCerrarSemana: false, eraConfirmada: true, ...cancelar });
    });
    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    const ana = page.locator('li[data-reserva-id]', { has: page.getByRole('link', { name: 'Ana Ruiz' }) });
    await ana.getByRole('button', { name: /Más acciones de/ }).click({ timeout: 30_000 });
    await page.getByRole('menuitem', { name: /Quitar de la clase/ }).click();
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();
    return cancelaciones;
  }

  test('quitarla a tiempo: recupera su clase suelta para otro día, y el dinero no se devuelve solo', async ({ page }) => {
    const cancelaciones = await quitarAAna(page, { estado: 'COBRADO', fecha_cobro: HOY, metodo_cobro: 'EFECTIVO' }, { bonoDevuelto: true, tardia: false });
    await expect(page.getByText(/Recupera su clase suelta para otro día\. Si prefieres devolverle el dinero, márcalo en Cobros/)).toBeVisible({ timeout: 30_000 });
    expect(cancelaciones).toEqual([{ reservaId: 'r1' }]);
  });

  test('quitarla fuera de plazo sin haberla pagado: la pierde y sigue debiéndola', async ({ page }) => {
    const cancelaciones = await quitarAAna(page, { estado: 'PENDIENTE' }, { bonoDevuelto: false, tardia: true });
    await expect(page.getByText(/Fuera de plazo: pierde la clase suelta, y sigue debiendo 15,00/)).toBeVisible({ timeout: 30_000 });
    expect(cancelaciones).toEqual([{ reservaId: 'r1' }]);
  });

  test('un recibo suelto de antes (sin clase suelta) solo avisa de lo pagado, neto de lo devuelto', async ({ page }) => {
    const cancelaciones = await quitarAAna(page, {
      suscripcion_id: null, estado: 'COBRADO', importe_devuelto: 5, fecha_cobro: HOY, metodo_cobro: 'EFECTIVO',
    }, { bonoDevuelto: false, tardia: false });
    await expect(page.getByText(/Pagó 10,00 € por esta clase: si se lo devuelves, márcalo en Cobros/)).toBeVisible({ timeout: 30_000 });
    expect(cancelaciones).toEqual([{ reservaId: 'r1' }]);
  });
});
