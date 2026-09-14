import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La bandeja única de la home («lo que espera tu visto bueno») y el contador
// sobre Inicio (lib/estado-estudio.ts, /api/estado-estudio).
//
// Lo que se fija aquí:
//   · lo que espera decisión, lo que Tentare está haciendo y lo resuelto se ven
//     separados, y el contador del menú suma SOLO lo primero;
//   · sin nada pendiente dice «nada espera tu visto bueno» — nunca «todo bien»;
//   · si el endpoint falla, la home (la pantalla principal del negocio) sigue en
//     pie y no se inventa un cero;
//   · el menú reorganizado: «Inicio» con un solo nombre, Comunidad sin entrada
//     duplicada y Mensajería visible en el modo por defecto.
//
// Montaje propio y no `montarHome` (e2e/hoy-home-mock.ts): allí el comodín
// `**/api/**` se registra dentro y ganaría a cualquier mock que se pusiera antes.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const CON_PENDIENTES = {
  aplica: true,
  nDecidir: 3,
  titulo: '3 cosas esperan tu visto bueno',
  decidir: [
    { id: 'sustitucionesPorDecidir', n: 1, texto: 'Una clase sin cubrir necesita que decidas', href: '/sustituciones' },
    { id: 'reservasPorAprobar', n: 2, texto: '2 reservas esperan tu aprobación', href: null },
  ],
  enMarcha: [
    { id: 'sustitucionesBuscando', n: 1, texto: 'Buscando sustituta para una clase', href: '/sustituciones' },
  ],
  resuelto: [
    { id: 'sustitucionesCubiertas24h', n: 1, texto: 'Una clase cubierta por una sustituta', href: '/sustituciones' },
  ],
};

const SIN_NADA = {
  aplica: true, nDecidir: 0, titulo: 'Nada espera tu visto bueno', decidir: [], enMarcha: [], resuelto: [],
};

async function montar(
  page: Page,
  estado: { cuerpo?: unknown; status?: number },
  rest: Record<string, unknown> = {},
  extra?: (page: Page) => Promise<void>,
) {
  const intentos = { n: 0 };

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

  // El genérico PRIMERO: Playwright resuelve la última ruta que encaje.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/api/estado-estudio**', route => {
    intentos.n++;
    return json(route, estado.cuerpo ?? {}, estado.status ?? 200);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Tablas concretas que una prueba quiere sembrar (después del genérico: gana).
  for (const [tabla, filas] of Object.entries(rest)) {
    await page.route(`**/rest/v1/${tabla}**`, route => json(route, filas));
  }
  // Rutas de API concretas de una prueba (después del genérico: gana).
  if (extra) await extra(page);

  await page.goto('/dashboard');
  return intentos;
}

test.describe('Estado del estudio en Inicio', () => {
  test('separa lo que espera tu decisión de lo que Tentare hace y ya ha hecho', async ({ page }) => {
    await montar(page, { cuerpo: CON_PENDIENTES });

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja).toBeVisible({ timeout: 30_000 });
    await expect(bandeja.getByText('3 cosas esperan tu visto bueno')).toBeVisible();

    // Lo que espera decisión lleva a donde se resuelve: otra pantalla, o su
    // tarjeta dentro de la propia bandeja.
    await expect(bandeja.getByRole('link', { name: /Una clase sin cubrir necesita que decidas/ }))
      .toHaveAttribute('href', '/sustituciones');
    await expect(bandeja.getByRole('link', { name: /2 reservas esperan tu aprobación/ }))
      .toHaveAttribute('href', '#decidir-reservas');

    await expect(bandeja.getByText('Tentare lo está haciendo')).toBeVisible();
    await expect(bandeja.getByText('Buscando sustituta para una clase')).toBeVisible();
    await expect(bandeja.getByText('Resuelto por Tentare')).toBeVisible();
    await expect(bandeja.getByText('Una clase cubierta por una sustituta')).toBeVisible();
  });

  test('el contador de Inicio suma solo lo que espera decisión (3), no lo que está en marcha', async ({ page }) => {
    await montar(page, { cuerpo: CON_PENDIENTES });
    const inicio = page.getByRole('link', { name: /^Inicio/ }).first();
    await expect(inicio).toBeVisible({ timeout: 30_000 });
    await expect(inicio).toContainText('3');
    await expect(inicio.getByText('3 por decidir')).toBeAttached();
  });

  test('sin nada pendiente lo dice sin exagerar: nunca «todo bien»', async ({ page }) => {
    await montar(page, { cuerpo: SIN_NADA });
    await expect(page.getByText('Nada espera tu visto bueno')).toBeVisible({ timeout: 30_000 });
    // Una sola línea, no una tarjeta que diga lo mismo cada mañana.
    await expect(page.getByRole('region', { name: 'Lo que espera tu visto bueno' })).toHaveCount(0);
    await expect(page.getByText(/todo bien|todo bajo control|todo en orden/i)).toHaveCount(0);
  });

  test('si el endpoint falla, la home sigue en pie y no se inventa un «nada pendiente»', async ({ page }) => {
    const intentos = await montar(page, { cuerpo: { error: 'boom' }, status: 500 });
    // El menú y la home siguen montados.
    await expect(page.getByRole('link', { name: /^Inicio/ }).first()).toBeVisible({ timeout: 30_000 });
    // ⚠️ Sin contador, «no mintió» podría ser cierto por no haberlo intentado.
    await expect.poll(() => intentos.n).toBeGreaterThan(0);
    await expect(page.getByText('Nada espera tu visto bueno')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Lo que espera tu visto bueno' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Un solo sitio para decidir: las tarjetas que resuelven lo que la bandeja
// cuenta sin enlace (reservas por aprobar, penalizaciones, devoluciones, canjes,
// bajas del equipo) viven DENTRO de ella, bajo «Decidir», y ya no sueltas más
// abajo en la home.
// ─────────────────────────────────────────────────────────────────────────────

const PENALIZACION = { id: 'pen-1', socio_id: 'soc-1', importe: 12, tipo: 'NO_SHOW', detectada_en: '2026-09-10T09:00:00Z' };
const CON_PENALIZACION_REST = {
  penalizaciones: [PENALIZACION],
  socios: [{ id: 'soc-1', nombre: 'María', apellidos: 'Soler' }],
};

test.describe('Lo que se aprueba, dentro de la bandeja', () => {
  test('la penalización pendiente se aprueba DENTRO de la región, y su línea lleva a la tarjeta', async ({ page }) => {
    await montar(page, {
      cuerpo: {
        aplica: true, nDecidir: 1, titulo: 'Una cosa espera tu visto bueno',
        decidir: [{ id: 'penalizacionesPorAprobar', n: 1, texto: 'Una penalización espera tu visto bueno para cobrarse', href: null }],
        enMarcha: [], resuelto: [],
      },
    }, CON_PENALIZACION_REST);

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja.getByText('1 penalización pendiente de aprobar')).toBeVisible({ timeout: 30_000 });
    await expect(bandeja.getByText('María Soler')).toBeVisible();
    await expect(bandeja.getByRole('button', { name: 'Aprobar y cobrar' })).toBeVisible();
    // Una sola vez en la página: no queda una copia suelta más abajo.
    await expect(page.getByText('1 penalización pendiente de aprobar')).toHaveCount(1);

    // La línea ya no es texto muerto: lleva a su tarjeta y le pasa el foco.
    const linea = bandeja.getByRole('link', { name: /Una penalización espera tu visto bueno/ });
    await expect(linea).toHaveAttribute('href', '#decidir-penalizaciones');
    await linea.click();
    await expect(page.locator('#decidir-penalizaciones')).toBeFocused();
    await expect(page).not.toHaveURL(/#decidir-/);
  });

  test('si el recuento aún dice «nada» y la tarjeta sí tiene algo, se ve la tarjeta y no se afirma «nada»', async ({ page }) => {
    // El recuento lleva hasta 30 s de caché y la tarjeta lee en vivo: pueden
    // no coincidir un momento. Lo que no puede pasar es enseñar las dos cosas.
    await montar(page, { cuerpo: SIN_NADA }, CON_PENALIZACION_REST);

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja.getByText('1 penalización pendiente de aprobar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nada espera tu visto bueno')).toBeHidden();
  });

  const CON_BAJA = {
    aplica: true, nDecidir: 1, titulo: 'Una cosa espera tu visto bueno',
    decidir: [{ id: 'bajasPorRevisar', n: 1, texto: 'Una baja de última hora del equipo por revisar', href: null }],
    enMarcha: [], resuelto: [],
  };
  const BAJA = {
    id: 'bi-1', instructora: 'Laura Martín', clase: 'Reformer', inicio: '2026-09-18T08:00:00Z',
    antelacionMinutos: 180, motivo: 'Asunto personal · Un imprevisto',
  };

  function mockBajas(respuestaPost: { status: number; body: unknown }) {
    const intentos = { post: 0, cuerpo: null as null | Record<string, unknown> };
    let pendiente = true;
    const registrar = async (page: Page) => {
      await page.route('**/api/equipo/bajas-instructora**', route => {
        if (route.request().method() === 'POST') {
          intentos.post++;
          intentos.cuerpo = JSON.parse(route.request().postData() || '{}');
          pendiente = false;
          return json(route, respuestaPost.body, respuestaPost.status);
        }
        return json(route, { bajas: pendiente ? [BAJA] : [] });
      });
    };
    return { intentos, registrar };
  }

  test('la baja de última hora del equipo se revisa dentro de la bandeja, con su nota', async ({ page }) => {
    const { intentos, registrar } = mockBajas({ status: 200, body: { ok: true } });
    await montar(page, { cuerpo: CON_BAJA }, {}, registrar);

    const tarjeta = page.getByTestId('bajas-por-revisar');
    await expect(tarjeta).toContainText('Laura Martín · Reformer', { timeout: 30_000 });
    await expect(tarjeta).toContainText('Avisó con 3 h de antelación');
    await expect(tarjeta).toContainText('Asunto personal · Un imprevisto');
    await expect(tarjeta).toContainText('no descuenta nada');
    await expect(tarjeta).not.toContainText(/sanci|penaliz|no justific/i);

    const linea = page.getByRole('region', { name: 'Lo que espera tu visto bueno' })
      .getByRole('link', { name: /Una baja de última hora del equipo/ });
    await expect(linea).toHaveAttribute('href', '#decidir-bajas-equipo');

    await tarjeta.getByLabel(/Nota para la instructora/).fill('Lo vemos el jueves');
    await tarjeta.getByRole('button', { name: 'Lo hablamos', exact: true }).click();

    await expect(page.getByTestId('bajas-por-revisar')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('Anotado: lo habláis')).toBeVisible();
    expect(intentos.post).toBe(1);
    expect(intentos.cuerpo).toEqual({ id: 'bi-1', decision: 'LO_HABLAMOS', nota: 'Lo vemos el jueves' });
  });

  test('si otra persona ya la revisó, lo dice y quita la fila en vez de anunciar que se ha guardado', async ({ page }) => {
    const { intentos, registrar } = mockBajas({
      status: 409, body: { error: 'Esta baja ya no está pendiente de revisar. Recarga la página.' },
    });
    await montar(page, { cuerpo: CON_BAJA }, {}, registrar);

    const tarjeta = page.getByTestId('bajas-por-revisar');
    await tarjeta.getByRole('button', { name: 'Todo en orden', exact: true }).click({ timeout: 30_000 });

    await expect(page.getByText('Esta baja ya no está pendiente de revisar')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Anotado: todo en orden')).toHaveCount(0);
    await expect(page.getByTestId('bajas-por-revisar')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reservas pendientes de aprobación, decididas dentro de la bandeja.
//
// Cada prueba de camino de fallo lleva su contador de POST: «no dijo aprobada»
// o «la fila sigue ahí» son verdad también si nunca se intentó nada.
// ─────────────────────────────────────────────────────────────────────────────

// Relativa al reloj real: la tarjeta descarta las clases que ya empezaron.
const EN_TRES_DIAS = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
const RESERVA_PENDIENTE = {
  id: 'res-pend-1', studio_id: STUDIO_ID, sesion_id: 'ses-pend-1', socio_id: 'soc-1',
  estado: 'PENDIENTE_APROBACION', sesiones: { inicio: EN_TRES_DIAS, tipos_clase: { nombre: 'Reformer' } },
};
const CON_RESERVA_REST = {
  reservas: [RESERVA_PENDIENTE],
  socios: [{ id: 'soc-1', nombre: 'María', apellidos: 'Soler' }],
};
const CON_RESERVA = {
  aplica: true, nDecidir: 1, titulo: 'Una cosa espera tu visto bueno',
  decidir: [{ id: 'reservasPorAprobar', n: 1, texto: 'Una reserva espera tu aprobación', href: null }],
  enMarcha: [], resuelto: [],
};
const LIMITE_SEMANAL = 'La socia ya alcanzó el límite semanal de su plan y no tiene recuperaciones disponibles. La reserva sigue pendiente: libera una clase de esa semana o recházala.';

function mockResolver(respuesta: { status: number; body: unknown } | 'sin-red', retrasoMs = 0) {
  const intentos = { post: 0, cuerpos: [] as unknown[] };
  const registrar = async (page: Page) => {
    await page.route('**/api/reservas/resolver-pendiente**', async route => {
      intentos.post++;
      intentos.cuerpos.push(JSON.parse(route.request().postData() || '{}'));
      if (retrasoMs) await new Promise(r => setTimeout(r, retrasoMs));
      if (respuesta === 'sin-red') return route.abort('failed');
      return json(route, respuesta.body, respuesta.status);
    });
  };
  return { intentos, registrar };
}

test.describe('Reservas por aprobar, dentro de la bandeja', () => {
  test('se aprueba DENTRO de la región, va la primera y su línea lleva a la tarjeta', async ({ page }) => {
    const { intentos, registrar } = mockResolver({ status: 200, body: { ok: true, estado: 'CONFIRMADA' } });
    await montar(page, { cuerpo: CON_RESERVA }, CON_RESERVA_REST, registrar);

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    const tarjeta = bandeja.getByTestId('reservas-por-aprobar');
    await expect(tarjeta).toContainText('María Soler · Reformer', { timeout: 30_000 });
    await expect(page.locator('[data-acciones-en-linea] > *').first()).toHaveAttribute('data-testid', 'reservas-por-aprobar');
    await expect(tarjeta.getByRole('link', { name: 'Ver clase' })).toHaveAttribute('href', '/calendario?sesion=ses-pend-1');

    const linea = bandeja.getByRole('link', { name: /Una reserva espera tu aprobación/ });
    await expect(linea).toHaveAttribute('href', '#decidir-reservas');
    await linea.click();
    await expect(page.locator('#decidir-reservas')).toBeFocused();

    await tarjeta.getByRole('button', { name: /^Aprobar la reserva de María Soler/ }).click();

    await expect(page.getByTestId('reservas-por-aprobar')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('Reserva aprobada: tiene su plaza confirmada')).toBeVisible();
    expect(intentos.post).toBe(1);
    expect(intentos.cuerpos[0]).toEqual({ reservaId: 'res-pend-1', aprobar: true });
  });

  test('409 (ya no estaba pendiente): quita la fila sin decir «aprobada»', async ({ page }) => {
    const { intentos, registrar } = mockResolver({ status: 409, body: { error: 'Esta reserva ya no está pendiente de aprobación' } });
    await montar(page, { cuerpo: CON_RESERVA }, CON_RESERVA_REST, registrar);

    const tarjeta = page.getByTestId('reservas-por-aprobar');
    await expect(tarjeta).toContainText('María Soler · Reformer', { timeout: 30_000 });
    await expect(page.getByText(/aprobada/i)).toHaveCount(0);
    await tarjeta.getByRole('button', { name: /^Aprobar la reserva/ }).click();

    await expect(page.getByTestId('reservas-por-aprobar')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/ya no está pendiente de aprobación/)).toBeVisible();
    await expect(page.getByText(/aprobada/i)).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
    expect(intentos.cuerpos[0]).toEqual({ reservaId: 'res-pend-1', aprobar: true });
  });

  test('400 por el límite semanal: la fila se queda con el motivo del servidor', async ({ page }) => {
    const { intentos, registrar } = mockResolver({ status: 400, body: { error: LIMITE_SEMANAL } });
    await montar(page, { cuerpo: CON_RESERVA }, CON_RESERVA_REST, registrar);

    const tarjeta = page.getByTestId('reservas-por-aprobar');
    await tarjeta.getByRole('button', { name: /^Aprobar la reserva/ }).click({ timeout: 30_000 });

    await expect(tarjeta.getByRole('alert')).toHaveText(LIMITE_SEMANAL, { timeout: 15_000 });
    await expect(tarjeta).toContainText('María Soler · Reformer');
    await expect(tarjeta.getByRole('button', { name: /^Aprobar la reserva/ })).toBeEnabled();
    await expect(page.getByText(/aprobada/i)).toHaveCount(0);
    expect(intentos.post).toBe(1);
    expect(intentos.cuerpos[0]).toEqual({ reservaId: 'res-pend-1', aprobar: true });
  });

  test('sin red: la fila se queda y pide volver a intentarlo', async ({ page }) => {
    const { intentos, registrar } = mockResolver('sin-red');
    await montar(page, { cuerpo: CON_RESERVA }, CON_RESERVA_REST, registrar);

    const tarjeta = page.getByTestId('reservas-por-aprobar');
    await tarjeta.getByRole('button', { name: /^Rechazar la reserva/ }).click({ timeout: 30_000 });

    await expect(tarjeta.getByRole('alert')).toHaveText('No se ha podido guardar. Vuelve a intentarlo', { timeout: 15_000 });
    await expect(tarjeta).toContainText('María Soler · Reformer');
    await expect(page.getByText('Reserva rechazada')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
    expect(intentos.cuerpos[0]).toEqual({ reservaId: 'res-pend-1', aprobar: false });
  });

  test('doble toque: exactamente un POST, y los botones se apagan mientras viaja', async ({ page }) => {
    const { intentos, registrar } = mockResolver({ status: 200, body: { ok: true, estado: 'LISTA_ESPERA' } }, 1500);
    await montar(page, { cuerpo: CON_RESERVA }, CON_RESERVA_REST, registrar);

    const tarjeta = page.getByTestId('reservas-por-aprobar');
    const aprobar = tarjeta.getByRole('button', { name: /^Aprobar la reserva/ });
    await expect(aprobar).toBeEnabled({ timeout: 30_000 });
    // Dos clics en el mismo tick: antes de que React repinte el botón apagado.
    await aprobar.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });

    await expect(tarjeta.getByRole('button', { name: /^Rechazar la reserva/ })).toBeDisabled();
    await expect(page.getByTestId('reservas-por-aprobar')).toHaveCount(0, { timeout: 15_000 });
    // Aprobar con la clase llena no es «aprobada con plaza»: lo dice.
    await expect(page.getByText(/pasa a la lista de espera/)).toBeVisible();
    expect(intentos.post).toBe(1);
    expect(intentos.cuerpos).toEqual([{ reservaId: 'res-pend-1', aprobar: true }]);
  });

  test('una instructora no ve la tarjeta ni la pide, aunque haya reservas pendientes', async ({ page }) => {
    const consultas = { reservas: 0, deLaTarjeta: 0, post: 0 };
    const registrar = async (p: Page) => {
      await p.route('**/rest/v1/reservas**', route => {
        consultas.reservas++;
        if (decodeURIComponent(route.request().url()).includes('sesiones!inner')) consultas.deLaTarjeta++;
        return json(route, [RESERVA_PENDIENTE]);
      });
      await p.route('**/api/reservas/resolver-pendiente**', route => { consultas.post++; return json(route, {}); });
    };
    await montar(page, { cuerpo: { ...SIN_NADA, aplica: false } }, {
      socios: CON_RESERVA_REST.socios,
      // Otra dueña, y esta cuenta es una instructora del equipo.
      studios: { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: 'auth-e2e-otra' },
      instructores: [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Laura', activo: true, rol: 'INSTRUCTOR', color: '#5A6142', auth_user_id: AUTH_UID }],
    }, registrar);

    await expect(page.getByRole('link', { name: /^Inicio/ }).first()).toBeVisible({ timeout: 30_000 });
    // ⚠️ Sin esto, «no la ve» podría ser verdad por no haber cargado nada:
    // las reservas pendientes SÍ se le sirvieron al panel.
    await expect.poll(() => consultas.reservas, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('reservas-por-aprobar')).toHaveCount(0);
    expect(consultas.deLaTarjeta).toBe(0);
    expect(consultas.post).toBe(0);
  });
});

test.describe('Menú reorganizado', () => {
  test('«Inicio» con un solo nombre, Comunidad sin entrada duplicada, Mensajería visible por defecto', async ({ page }) => {
    await montar(page, { cuerpo: SIN_NADA });
    await expect(page.getByRole('link', { name: /^Inicio/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Mensajería/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Comunidad', exact: true })).toHaveCount(0);
  });
});
