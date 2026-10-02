import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Añadir a la clase» cobra la clase suelta en el mostrador, de verdad (maqueta
// aprobada del rediseño del Calendario, 1-oct-2026). Antes quedaba un recibo
// PENDIENTE para cobrarlo luego en Cobros.
//
// Lo que tiene que ser cierto, con dinero de por medio:
//  · PRIMERO la plaza y DESPUÉS el cobro: cobrar antes dejaría dinero sin clase
//    si se llena entre medias.
//  · El cobro lo confirma el SERVIDOR (`/api/cobros/marcar-cobrado`), con el
//    método que se eligió: un recibo no nace cobrado desde el navegador.
//  · Si la plaza no se da, no se crea recibo ni se cobra. Los caminos de fallo
//    llevan contador (regla del repo): «no cobró» sin comprobar que se INTENTÓ
//    reservar puede ser verdad por no haber hecho nada.
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
function sesion(aforo: number) {
  return {
    id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio: INICIO.toISOString(), fin: new Date(INICIO.getTime() + 55 * 60_000).toISOString(), aforo_maximo: aforo, cancelada: false,
    notas: null, serie_id: null, precio_puntual: null,
  };
}
const RESERVAS = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00`, posicion_espera: null, spot_id: null }];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const RESERVA_OK = { ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: 'res-e2e', repetida: false };

async function montarCalendario(page: Page, opts: {
  aforo?: number; reserva?: { status: number; body: unknown }; cobroSinDetalle?: boolean;
  /** Recibos que ya hay (lo que lee el panel al cargar). */
  recibosGuardados?: Record<string, unknown>[];
} = {}) {
  const ses = sesion(opts.aforo ?? 4);
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
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));
  await page.route('**/rest/v1/socios**', route => json(route, [socia('s1', 'Ana'), socia('s2', 'Bea'), socia('s3', 'Cris')]));
  await page.route('**/rest/v1/sesiones**', route => json(route, [ses]));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [{
      id: ses.id, studioId: ses.studio_id, tipoClaseId: ses.tipo_clase_id, salaId: ses.sala_id,
      instructorId: ses.instructor_id, inicio: ses.inicio, fin: ses.fin, aforoMaximo: ses.aforo_maximo,
      cancelada: false, notas: null, precioPuntual: null, serieId: null,
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
    reservas.push(route.request().postDataJSON() as Record<string, unknown>);
    const r = opts.reserva ?? { status: 200, body: RESERVA_OK };
    return json(route, r.body, r.status);
  });
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() === 'GET' && opts.recibosGuardados) return json(route, opts.recibosGuardados);
    if (req.method() !== 'POST') return route.fallback();
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

async function abrirBea(page: Page) {
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Añadir clienta a la clase' }).click();
  // Bea no trae bono: su fila lo dice y se despliega para cobrarle.
  const bea = page.getByRole('button', { name: /Bea Ruiz/ });
  await expect(bea).toContainText('No tiene bono ni cuota que valga para esta clase');
  await bea.click();
}

test.describe('Cobrar la clase suelta al añadir a una clienta', () => {
  test('quien viene con su cuota dice con qué viene y entra de un toque, sin cobrar', async ({ page }) => {
    const { reservas, recibos, cobros } = await montarCalendario(page);
    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Añadir clienta a la clase' }).click();
    const cris = page.getByRole('button', { name: /Cris Ruiz/ });
    await expect(cris).toContainText('Con su Mensual');
    await cris.click();

    await expect(page.getByText('Cris añadida a la clase')).toBeVisible({ timeout: 30_000 });
    expect(reservas[0]).toMatchObject({ sesionId: 'ses-1', socioId: 's3' });
    expect(reservas[0].comoClaseSuelta).toBeUndefined();
    expect(recibos).toHaveLength(0);
    expect(cobros).toHaveLength(0);
  });

  test('a quien no trae bono se le cobra en el mostrador: primero la plaza, luego el cobro por el servidor', async ({ page }) => {
    const { orden, reservas, recibos, cobros } = await montarCalendario(page);
    await abrirBea(page);
    // Ningún método viene marcado: sin elegirlo no se cobra.
    const cobrar = page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ });
    await expect(cobrar).toBeDisabled();
    await page.getByRole('button', { name: 'Bizum', exact: true }).click();
    await cobrar.click();

    await expect(page.getByText('15,00 € cobrados por Bizum · Bea añadida a la clase')).toBeVisible({ timeout: 30_000 });
    expect(orden).toEqual(['reserva', 'recibo', 'cobro']);
    // Pide al servidor que mire su cartera de ahora: si ya traía con qué venir, no se cobra.
    expect(reservas[0]).toMatchObject({ sesionId: 'ses-1', socioId: 's2', comoClaseSuelta: true });
    // El recibo nace PENDIENTE (el navegador no puede crearlo cobrado), cuelga
    // de la reserva y dice qué clase es; lo cobra el servidor con el método.
    expect(recibos[0]).toMatchObject({ id: `rec-suelta-${reservas[0].reservaId}`, socio_id: 's2', importe: 15, estado: 'PENDIENTE' });
    expect(String(recibos[0].concepto)).toMatch(/^Clase suelta — Reformer, /);
    expect(cobros[0]).toEqual({ reciboIds: [recibos[0].id], metodo: 'BIZUM' });
  });

  test('si el servidor no confirma el cobro, la pantalla no dice «cobrados»', async ({ page }) => {
    const { recibos, cobros } = await montarCalendario(page, { cobroSinDetalle: true });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText(/no consta el cobro/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/cobrados en efectivo/)).toHaveCount(0);
    expect(recibos.length, 'el recibo se creó').toBe(1);
    expect(cobros.length, 'se intentó cobrar').toBe(1);
  });

  test('«cóbraselo después» la apunta y le deja el recibo pendiente, sin cobrar', async ({ page }) => {
    const { orden, reservas, recibos, cobros } = await montarCalendario(page);
    await abrirBea(page);
    await page.getByRole('button', { name: /cóbraselo después/ }).click();

    await expect(page.getByText('Bea añadida · recibo de 15,00 € pendiente en Cobros')).toBeVisible({ timeout: 30_000 });
    expect(orden).toEqual(['reserva', 'recibo']);
    // También cuelga de la reserva: al quitarla de la clase se avisa de que lo tiene pendiente.
    expect(recibos[0]).toMatchObject({ id: `rec-suelta-${reservas[0].reservaId}`, socio_id: 's2', importe: 15, estado: 'PENDIENTE' });
    expect(cobros).toHaveLength(0);
  });

  test('si el servidor ve que ya traía bono (la pantalla tenía su cartera vieja), no se cobra ni se deja recibo', async ({ page }) => {
    const { reservas, recibos, cobros } = await montarCalendario(page, {
      // Renovó el bono desde su app y el iPad aún no lo sabe: el servidor lo lee al reservar.
      reserva: { status: 200, body: { ...RESERVA_OK, cubiertaPor: { tipo: 'BONO', plan: 'Bono 10 clases' } } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText('Bea entra con su Bono 10 clases, que ya cubría esta clase: no se le ha cobrado nada'))
      .toBeVisible({ timeout: 30_000 });
    expect(reservas.length, 'tiene que haber reservado').toBe(1);
    expect(recibos).toHaveLength(0);
    expect(cobros).toHaveLength(0);
  });

  test('si el servidor no da la plaza, no se crea recibo ni se cobra nada', async ({ page }) => {
    const { reservas, recibos, cobros } = await montarCalendario(page, {
      reserva: { status: 409, body: { error: 'Esta clienta ya tiene una reserva a esa hora.' } },
    });
    await abrirBea(page);
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar 15,00 € y añadirla/ }).click();

    await expect(page.getByText(/No se le ha cobrado nada/)).toBeVisible({ timeout: 30_000 });
    expect(reservas.length, 'tiene que haber intentado reservar').toBeGreaterThan(0);
    expect(recibos).toHaveLength(0);
    expect(cobros).toHaveLength(0);
  });

  // Ana tiene su clase suelta en un recibo que cuelga de su reserva (`rec-suelta-r1`).
  async function quitarAAna(page: Page, recibo: Record<string, unknown>) {
    await montarCalendario(page, {
      recibosGuardados: [{
        id: 'rec-suelta-r1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: null, concepto: 'Clase suelta — Reformer',
        importe: 15, importe_devuelto: 0, fecha_vencimiento: HOY, fecha_cobro: null, metodo_cobro: null, intentos_reintento: 0,
        ...recibo,
      }],
    });
    // Después del arnés: si no, su catch-all de `/api/**` la tapa.
    const cancelaciones: unknown[] = [];
    await page.route('**/api/reservas/cancelar', route => {
      cancelaciones.push(route.request().postDataJSON());
      return json(route, { ok: true, recuperacionCreada: false, recuperacionCaducaEl: null, recuperacionAlCerrarSemana: false });
    });
    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    const ana = page.locator('li[data-reserva-id]', { has: page.getByRole('link', { name: 'Ana Ruiz' }) });
    await ana.getByRole('button', { name: /Más acciones de/ }).click({ timeout: 30_000 });
    await page.getByRole('menuitem', { name: /Quitar de la clase/ }).click();
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();
    return cancelaciones;
  }

  test('quitar a quien pagó su clase suelta avisa de lo que pagó (no le devuelve nada solo)', async ({ page }) => {
    // Con 5 € ya devueltos, lo que pagó de verdad son 10 € (lo neto, no el importe).
    const cancelaciones = await quitarAAna(page, { estado: 'COBRADO', importe_devuelto: 5, fecha_cobro: HOY, metodo_cobro: 'EFECTIVO' });
    await expect(page.getByText(/Pagó 10,00 € por esta clase: si se lo devuelves, márcalo en Cobros/)).toBeVisible({ timeout: 30_000 });
    expect(cancelaciones).toEqual([{ reservaId: 'r1' }]);
  });

  test('quitar a quien la tenía pendiente de cobro avisa de que el recibo sigue ahí', async ({ page }) => {
    const cancelaciones = await quitarAAna(page, { estado: 'PENDIENTE' });
    await expect(page.getByText(/Tenía 15,00 € pendientes por esta clase: si ya no se los cobras, elimina el recibo en Cobros/))
      .toBeVisible({ timeout: 30_000 });
    expect(cancelaciones).toEqual([{ reservaId: 'r1' }]);
  });

  test('con la clase llena no se ofrece cobrar: va a la lista de espera sin cargo', async ({ page }) => {
    await montarCalendario(page, { aforo: 1 });
    await abrirBea(page);
    await expect(page.getByRole('button', { name: 'Apuntarla a la lista de espera' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cobrar .* y añadirla/ })).toHaveCount(0);
  });
});
