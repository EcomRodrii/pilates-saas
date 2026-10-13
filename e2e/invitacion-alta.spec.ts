import { test, expect, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El otro lado de la invitación: el de la persona invitada.
//
// El enlace del correo lleva un token firmado que identifica su ficha, y ese
// token tiene que sobrevivir hasta DESPUÉS del alta — es lo que vincula la ficha
// (junto con el correo de la ficha, desde el 13-oct-2026). Antes se perdía al
// salir de /invitacion, y la cuenta quedaba suelta, sin estudio: le pasó a dos
// instructoras y hubo que enlazarlas a mano.
//
// Y al llegar a /login aterrizaba en "Iniciar sesión" — un formulario para
// entrar con una cuenta que todavía no existe. El `?alta=1` viajaba desde el
// principio; simplemente nadie lo leía.
//
// Detectado en producción tras esto: una propietaria invitó a alguien como
// PROPIETARIO, el alta y el código OTP fueron perfectos, pero la cuenta acabó
// sin vincular a ningún estudio — sessionStorage se había perdido en el salto
// de /invitacion a /login sin dejar traza de la causa exacta (partición de
// almacenamiento del navegador, un cliente de correo reescribiendo el
// enlace...). El token ahora viaja TAMBIÉN por la URL (`&token=`), y /login
// lo vuelve a guardar en sessionStorage al montar — una segunda vía que no
// depende de que ese storage sobreviva el salto.
//
// 13-oct-2026: abrir /invitacion no es aceptarla. El token se guarda al PULSAR,
// y /login no canjea un `?token=` que llega con una sesión ya abierta (esa
// sesión no viene de pulsar en la invitación): la manda a /invitacion.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = 'payload-de-prueba.firma-de-prueba';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('Invitación: alta de la persona invitada', () => {
  test('el token sobrevive al salto de /invitacion a /login, y llega en modo alta', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/api/public/invitacion**', route => json(route, {
      yaVinculada: false, nombre: 'Marta', email: 'marta@example.com', estudio: 'Studio Carmen',
    }));

    await page.goto(`/invitacion?token=${encodeURIComponent(TOKEN)}`);
    await expect(page.getByText(/te han dado de alta en Studio Carmen/i)).toBeVisible({ timeout: 30_000 });

    // Abrir la invitación no es aceptarla: hasta que no pulsa, no se guarda nada.
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBeNull();

    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();

    await expect(page).toHaveURL(/\/login\?/, { timeout: 30_000 });
    // Sigue ahí tras el salto de página, listo para viajar en la metadata del alta.
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBe(TOKEN);
    // Y el botón de continuar llevó el token también en la URL de destino —
    // la segunda vía, no solo sessionStorage.
    await expect(page).toHaveURL(new RegExp(`token=${encodeURIComponent(TOKEN)}`));
    // Y el formulario que se ve es el de CREAR, no el de entrar.
    await expect(page.getByRole('heading', { name: 'Crear cuenta de equipo' })).toBeVisible();
  });

  test('regresión: si sessionStorage se pierde en el salto, la URL rescata el token igual', async ({ page }) => {
    // Reproduce el caso real: nunca se pasa por /invitacion en esta pestaña
    // (o su sessionStorage no sobrevivió), así que se llega a /login SOLO con
    // el token en la URL — exactamente como lo deja /invitacion ahora.
    await page.route('**/api/**', route => json(route, {}));
    await page.goto(`/login?destino=/dashboard&alta=1&token=${encodeURIComponent(TOKEN)}`);

    await expect(page.getByRole('heading', { name: 'Crear cuenta de equipo' })).toBeVisible({ timeout: 30_000 });
    // La URL, no sessionStorage, es la única fuente aquí — y aun así queda
    // guardado, listo para viajar en la metadata del alta (en cuanto se sabe
    // que no había sesión abierta).
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pending_invitacion')), { timeout: 15_000 }).toBe(TOKEN);
  });

  test('«Ya tengo cuenta» abre el login en «iniciar sesión» con el token guardado', async ({ page }) => {
    // Antes solo había «Crear mi cuenta», y quien ya tenía cuenta chocaba con
    // «ya existe una cuenta con ese email» (15-sep-2026).
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/api/public/invitacion**', route => json(route, {
      yaVinculada: false, nombre: 'Marta', email: 'marta@example.com', estudio: 'Studio Carmen', rol: 'RECEPCION', slug: 'studio-carmen',
    }));

    await page.goto(`/invitacion?token=${encodeURIComponent(TOKEN)}`);
    await page.getByTestId('invitacion-ya-tengo-cuenta').click({ timeout: 30_000 });

    await expect(page).toHaveURL(/\/login\?/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/alta=1/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBe(TOKEN);
  });

  test('la invitación de una instructora lleva a la app del estudio, no a crear cuenta de Tentare', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/api/public/invitacion**', route => json(route, {
      yaVinculada: false, nombre: 'Marta', email: 'marta@example.com', estudio: 'Studio Carmen', rol: 'INSTRUCTOR', slug: 'studio-carmen',
    }));

    await page.goto(`/invitacion?token=${encodeURIComponent(TOKEN)}`);
    const ir = page.getByTestId('invitacion-ir-a-la-app');
    await expect(ir).toHaveText('Entrar en la app de Studio Carmen', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Crear mi cuenta' })).toHaveCount(0);

    // El token viaja a la app del estudio, que es quien lo guarda y lo usa.
    const destino = page.waitForURL(/\/portal\/studio-carmen\/acceso\/invitacion/, { timeout: 30_000 });
    await ir.click();
    await destino;
  });

  test('sin ?alta=1 el login sigue abriendo en "iniciar sesión"', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({ timeout: 30_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Con una sesión ya abierta, un enlace no se canjea sin pasar por la invitación
// (13-oct-2026). La pareja va junta a propósito: el «no reclamó» del primero solo
// prueba algo si, en el mismo montaje, el segundo SÍ reclama.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';
const MOTIVO_CORREO = 'Esta invitación es para otro correo. Entra con el correo en el que la has recibido, o pídele a tu estudio que cambie el de tu ficha y te la envíe de nuevo.';

async function sesionAbierta(page: import('@playwright/test').Page, opciones: { tokenGuardado?: boolean } = {}) {
  await page.addInitScript(([key, token, guardado]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e-otra', email: 'otra@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: { nombre: 'Otra' }, created_at: '2026-01-01T00:00:00Z',
      },
    }));
    // Lo que deja «Crear mi cuenta» / «Ya tengo cuenta» al pulsarlo en /invitacion.
    if (guardado) sessionStorage.setItem('pending_invitacion', token as string);
  }, [STORAGE_KEY, TOKEN, opciones.tokenGuardado ?? false] as const);
}

/** Cuenta las peticiones a `/api/equipo/reclamar` y contesta lo que se le diga. */
async function contarReclamos(page: import('@playwright/test').Page, respuesta: { status: number; body: unknown }) {
  const reclamos: string[] = [];
  await page.route('**/api/equipo/reclamar**', route => {
    reclamos.push(route.request().postData() ?? '');
    return json(route, respuesta.body, respuesta.status);
  });
  return reclamos;
}

test.describe('Invitación: una sesión ya abierta no se une sola', () => {
  test('/login?token= con la sesión abierta manda a la invitación y NO reclama', async ({ page }) => {
    await sesionAbierta(page);
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/api/public/invitacion**', route => json(route, {
      yaVinculada: false, nombre: 'Marta', email: 'ma•••@example.com', estudio: 'Studio Carmen', rol: 'RECEPCION', slug: 'studio-carmen',
    }));
    const reclamos = await contarReclamos(page, { status: 200, body: { vinculadas: 1 } });

    await page.goto(`/login?token=${encodeURIComponent(TOKEN)}`);

    await expect(page).toHaveURL(new RegExp(`/invitacion\\?token=${encodeURIComponent(TOKEN)}`), { timeout: 30_000 });
    // La invitación dice de qué estudio se trata y ofrece cerrar la sesión que hay.
    await expect(page.getByRole('button', { name: 'Cerrar sesión y crear mi cuenta' })).toBeVisible({ timeout: 30_000 });
    expect(reclamos, 'con una sesión que ya estaba abierta, el enlace no se canjea sin aceptarlo').toHaveLength(0);
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBeNull();
  });

  test('control: tras pulsar en la invitación, al entrar SÍ se reclama', async ({ page }) => {
    await sesionAbierta(page, { tokenGuardado: true });
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/rest/v1/**', route => json(route, []));
    // Sin destino resuelto, /login no navega y se puede mirar lo que pasó.
    await page.route('**/api/auth/destino-post-login**', () => new Promise(() => {}));
    const reclamos = await contarReclamos(page, { status: 200, body: { vinculadas: 1, estudioId: 'studio-test' } });

    await page.goto('/login');

    await expect.poll(() => reclamos.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(JSON.parse(reclamos[0])).toEqual({ token: TOKEN });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBeNull();
  });

  test('si el servidor dice que la invitación no es para esta cuenta, se dice y no se sigue al panel', async ({ page }) => {
    await sesionAbierta(page, { tokenGuardado: true });
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/rest/v1/**', route => json(route, []));
    let destinos = 0;
    await page.route('**/api/auth/destino-post-login**', route => { destinos += 1; return json(route, { destino: '/dashboard' }); });
    // Cerrar la sesión local también avisa a gotrue.
    let cierres = 0;
    await page.route('**/auth/v1/logout**', route => { cierres += 1; return route.fulfill({ status: 204 }); });
    const reclamos = await contarReclamos(page, { status: 409, body: { error: MOTIVO_CORREO } });

    await page.goto('/login');

    const aviso = page.getByTestId('invitacion-rechazada');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText(MOTIVO_CORREO);
    expect(reclamos.length, 'el rechazo viene de un intento de verdad').toBeGreaterThan(0);
    expect(destinos, 'no se manda al panel a una cuenta que no se ha unido').toBe(0);
    expect(cierres, 'y no se deja abierta la sesión de esa cuenta').toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/login/);
    // Un «no» definitivo no se queda en la pestaña: volver a entrar no choca con él otra vez.
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBeNull();
    await aviso.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});

test.describe('Invitación: un enlace que ya no vale', () => {
  test('si la ruta pública dice que ya no está disponible, se dice (y lo dijo de verdad)', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    let consultas = 0;
    await page.route('**/api/public/invitacion**', route => {
      consultas += 1;
      return json(route, { error: 'Esta invitación ya no está disponible.' }, 404);
    });

    await page.goto(`/invitacion?token=${encodeURIComponent(TOKEN)}`);

    await expect(page.getByRole('heading', { name: 'Invitación no disponible' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Esta invitación ya no está disponible.')).toBeVisible();
    expect(consultas).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Crear mi cuenta' })).toHaveCount(0);
  });
});
