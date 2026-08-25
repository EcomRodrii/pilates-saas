import { test, expect, type Page, type Route } from '@playwright/test';

// ⚠️ EN CUARENTENA (2026-08-25) — nunca ha pasado, ni en la rama de #1404 que
// lo introdujo: el archivo llegó a main con marcadores de conflicto sin
// resolver, así que su propio CI nunca pudo compilar ni correr esto.
//
// El diseño mismo del test es incompatible con cómo autentica este repo.
// `seedAuth` solo escribe una sesión FALSA en localStorage (el sitio donde
// vive la sesión de Supabase del NAVEGADOR); `makeRequestEquipo` deja pasar
// la petición a `/api/equipo*` con `route.continue()` para golpear el
// servidor Next.js REAL — y ese servidor valida con
// `requireAuthInServerAction()` (lib/auth-server-action.ts), que exige la
// cabecera `Authorization: Bearer <jwt>` con un JWT que Supabase Auth
// reconozca de verdad. Un `fetch()` de `page.evaluate` no manda esa
// cabecera, y aunque la mandara, 'e2e-fake-token' no es un JWT real —
// siempre 401. `mockBackendEquipo` mockea `**/rest/v1/**` (la REST API de
// Supabase) pensando que así sustituye la base de datos, pero esas llamadas
// las hace el SERVIDOR desde Node, no el navegador — `page.route` no puede
// interceptarlas. Confirmado en vivo: los 68 tests de este archivo fallan
// con 401/status-inesperado en la primera petición real, no un flake.
//
// Ningún patrón equivalente existe hoy en el repo (rutas de staff se
// prueban con datos reales sembrados en Supabase, no con sesión falseada +
// mocks de red del navegador) — arreglarlo de verdad necesita diseño propio
// (¿un JWT de prueba firmado en CI? ¿otro punto de intercepción?), no un
// parche. Se deja en cuarentena (`test.describe.skip`) para no bloquear CI
// mientras se decide cómo abordarlo — no se ha borrado ni se ha "arreglado
// a ciegas": los casos de prueba documentados aquí siguen siendo válidos
// como especificación de comportamiento, solo la mecánica de ejecución está
// rota.
const STUDIO_ID = 'studio-equipo-test';
const STUDIO_SLUG = 'estudio-equipo-test';
const STORAGE_KEY = 'sb-example-auth-token';
const AHORA = '2026-08-25T10:00:00';

const PROPIETARIA_ID = 'auth-propietaria-equipo-test';
const MANAGER_ID = 'auth-manager-equipo-test';
const RECEPCION_ID = 'auth-recepcion-equipo-test';
const INSTRUCTOR_ID = 'auth-instructor-equipo-test';

const STUDIO = {
  id: STUDIO_ID,
  nombre: 'Estudio Prueba Equipo',
  slug: STUDIO_SLUG,
  owner_auth_user_id: PROPIETARIA_ID,
  email: 'estudio@test.com',
  moneda: 'EUR',
  activo: true,
  suscripcion_id: 'sub-trial-123',
  trial_ends_at: '2026-09-25T10:00:00Z',
};

const INSTRUCTORA_ACTIVA = {
  id: 'ins-activa-001',
  studio_id: STUDIO_ID,
  nombre: 'Ana García',
  email: 'ana@test.com',
  rol: 'INSTRUCTOR',
  activo: true,
  auth_user_id: INSTRUCTOR_ID,
  telefono: '+34 600 111 222',
  color: '#F7A6C4',
};

const PROPIETARIA = {
  id: 'ins-propietaria-001',
  studio_id: STUDIO_ID,
  nombre: 'María Dueña',
  email: 'maria@test.com',
  rol: 'PROPIETARIO',
  activo: true,
  auth_user_id: PROPIETARIA_ID,
  telefono: null,
  color: '#2C352C',
};

const MANAGER = {
  id: 'ins-manager-001',
  studio_id: STUDIO_ID,
  nombre: 'Carlos Manager',
  email: 'carlos@test.com',
  rol: 'MANAGER',
  activo: true,
  auth_user_id: MANAGER_ID,
  telefono: null,
  color: '#7C6A52',
};

const RECEPCION = {
  id: 'ins-recepcion-001',
  studio_id: STUDIO_ID,
  nombre: 'Laura Recepción',
  email: 'laura@test.com',
  rol: 'RECEPCION',
  activo: true,
  auth_user_id: RECEPCION_ID,
  telefono: null,
  color: '#6B7A64',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function seedAuth(page: Page, uid: string, email: string) {
  await page.addInitScript(([key, id, mail]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token',
      refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800,
      expires_in: 999999999,
      token_type: 'bearer',
      user: {
        id,
        email: mail,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, uid, email] as const);
}

async function mockBackendEquipo(
  page: Page,
  { rol = 'PROPIETARIO', instructoras: _instructoras = [INSTRUCTORA_ACTIVA] } = {},
) {
  await page.clock.setFixedTime(new Date(AHORA));

  // Tipado explícito: PROPIETARIA/MANAGER/RECEPCION llevan telefono: null y
  // INSTRUCTORA_ACTIVA un literal string — sin ensanchar aquí, TS infiere el
  // tipo del array del primer elemento y el resto de `.push()` no compila.
  const allInstructoras: (typeof INSTRUCTORA_ACTIVA | typeof PROPIETARIA)[] = [PROPIETARIA];
  if (rol === 'MANAGER') allInstructoras.push(MANAGER, INSTRUCTORA_ACTIVA);
  else if (rol === 'RECEPCION') allInstructoras.push(RECEPCION, INSTRUCTORA_ACTIVA);
  else if (rol === 'INSTRUCTOR') allInstructoras.push(INSTRUCTORA_ACTIVA);
  else allInstructoras.push(MANAGER, RECEPCION, INSTRUCTORA_ACTIVA);

  await page.route('**/api/**', (route) => json(route, {}));
  await page.route('**/api/layout**', (route) =>
    json(route, {
      orden: [],
      ocultos: [],
      menuPosition: 'lateral',
      home: { orden: [], ocultos: [] },
    }),
  );
  await page.route('**/api/billing/estado**', (route) =>
    json(route, { bloqueado: false }),
  );
  await page.route('**/api/theme**', (route) =>
    json(route, {
      primary: '#2C352C',
      secondary: '#6B7A64',
      logoUrl: null,
      radius: 12,
    }),
  );
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.route('**/rest/v1/studios**', (route) => json(route, STUDIO));
  await page.route('**/rest/v1/rpc/current_studio_id', (route) => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', (route) =>
    json(route, allInstructoras),
  );
}

async function makeRequestEquipo(
  page: Page,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown; requestCount: number }> {
  let requestCount = 0;

  await page.route(`**/api/equipo${endpoint}`, (route) => {
    requestCount++;
    route.continue();
  });

  const response = await page.evaluate(
    async (args: { method: string; url: string; payload: Record<string, unknown> | undefined }) => {
      const { method: meth, url, payload } = args;
      const opts: RequestInit = { method: meth };
      if (payload) opts.body = JSON.stringify(payload);

      const res = await fetch(url, opts);
      return {
        status: res.status,
        data: await res.json().catch(() => null),
      };
    },
    { method, url: `http://localhost:3000/api/equipo${endpoint}`, payload: body },
  );

  return { ...response, requestCount };
}

test.describe.skip('POST /api/equipo (crear instructora)', () => {
  test('happy path: crear instructora con datos válidos → 200', async ({
    page,
  }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '', {
      method: 'POST',
      nombre: 'Nueva Instructora',
      email: 'nueva@test.com',
      rol: 'INSTRUCTOR',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty('ok');
  });

  test('sin permiso: RECEPCION intenta crear → 403', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'RECEPCION' });
    await seedAuth(page, RECEPCION_ID, 'laura@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '', {
      method: 'POST',
      nombre: 'Nueva Instructora',
      email: 'nueva@test.com',
      rol: 'INSTRUCTOR',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(403);
    expect(result.data).toHaveProperty('error');
  });

  test('datos incompletos → 400', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '', {
      method: 'POST',
      nombre: '',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty('error');
  });

  test('email duplicado → 409', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '', {
      method: 'POST',
      nombre: 'Ana Duplicada',
      email: 'ana@test.com',
      rol: 'INSTRUCTOR',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(409);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('PATCH /api/equipo (editar instructora)', () => {
  test('happy path: editar nombre → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '', {
      method: 'PATCH',
      id: INSTRUCTORA_ACTIVA.id,
      nombre: 'Ana García Actualizada',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty('ok');
  });

  test('propia ficha: INSTRUCTOR edita su nombre → 200', async ({
    page,
  }) => {
    await mockBackendEquipo(page, { rol: 'INSTRUCTOR' });
    await seedAuth(page, INSTRUCTOR_ID, 'ana@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '', {
      method: 'PATCH',
      id: INSTRUCTORA_ACTIVA.id,
      nombre: 'Ana García Nuevo Nombre',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty('ok');
  });

  test('sin permiso: editar ficha de otra (INSTRUCTOR) → 403', async ({
    page,
  }) => {
    await mockBackendEquipo(page, { rol: 'INSTRUCTOR' });
    await seedAuth(page, INSTRUCTOR_ID, 'ana@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '', {
      method: 'PATCH',
      id: MANAGER.id,
      nombre: 'Carlos Editado',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(403);
    expect(result.data).toHaveProperty('error');
  });

  test('última propietaria: intentar desactivar → 409', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '', {
      method: 'PATCH',
      id: PROPIETARIA.id,
      activo: false,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(409);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('DELETE /api/equipo (baja instructora)', () => {
  test('happy path: baja de instructora → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'DELETE', '', {
      method: 'DELETE',
      id: INSTRUCTORA_ACTIVA.id,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty('ok');
  });

  test('sin permiso: RECEPCION intenta baja → 403', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'RECEPCION' });
    await seedAuth(page, RECEPCION_ID, 'laura@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'DELETE', '', {
      method: 'DELETE',
      id: INSTRUCTORA_ACTIVA.id,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(403);
    expect(result.data).toHaveProperty('error');
  });

  test('última propietaria: intentar baja → 409', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'DELETE', '', {
      method: 'DELETE',
      id: PROPIETARIA.id,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(409);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('POST /api/equipo/invitar (enviar invitación)', () => {
  test('happy path: enviar invitación → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/invitar', {
      instructorId: INSTRUCTORA_ACTIVA.id,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
  });

  test('ya tiene acceso → 409', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/invitar', {
      instructorId: PROPIETARIA.id,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(409);
    expect(result.data).toHaveProperty('error');
  });

  test('sin email en ficha → 400', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/invitar', {
      instructorId: 'ins-sin-email',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty('error');
  });

  test('no está en equipo → 404', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/invitar', {
      instructorId: 'ins-no-existe',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(404);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('GET /api/equipo/tarifas', () => {
  test('happy path: PROPIETARIO ve todas → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'GET', '/tarifas');

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });

  test('INSTRUCTOR ve solo suya → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'INSTRUCTOR' });
    await seedAuth(page, INSTRUCTOR_ID, 'ana@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'GET', '/tarifas');

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });

  test('RECEPCION sin permiso → 403', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'RECEPCION' });
    await seedAuth(page, RECEPCION_ID, 'laura@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'GET', '/tarifas');

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(403);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('PATCH /api/equipo/tarifas', () => {
  test('happy path: fijar tarifa → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '/tarifas', {
      method: 'PATCH',
      instructorId: INSTRUCTORA_ACTIVA.id,
      tarifa: 45.50,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
  });

  test('sin permiso → 403', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'RECEPCION' });
    await seedAuth(page, RECEPCION_ID, 'laura@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '/tarifas', {
      method: 'PATCH',
      instructorId: INSTRUCTORA_ACTIVA.id,
      tarifa: 45.50,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(403);
    expect(result.data).toHaveProperty('error');
  });

  test('valor fuera de rango → 400', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'PATCH', '/tarifas', {
      method: 'PATCH',
      instructorId: INSTRUCTORA_ACTIVA.id,
      tarifa: -10,
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('GET /api/equipo/rendimiento', () => {
  test('happy path: ver rendimiento → 200', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'GET', '/rendimiento');

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty('items');
  });

  test('sin permiso: RECEPCION → 403', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'RECEPCION' });
    await seedAuth(page, RECEPCION_ID, 'laura@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'GET', '/rendimiento');

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(403);
    expect(result.data).toHaveProperty('error');
  });
});

test.describe.skip('POST /api/equipo/reclamar', () => {
  test('happy path: reclamar acceso con token válido → 200', async ({
    page,
  }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/reclamar', {
      instructorId: INSTRUCTORA_ACTIVA.id,
      token: 'valid-token-abc123',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(200);
  });

  test('enlace no válido → 400', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/reclamar', {
      instructorId: INSTRUCTORA_ACTIVA.id,
      token: 'invalid-token',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty('error');
  });

  test('ficha inactiva → 404', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/reclamar', {
      instructorId: 'ins-inactiva-999',
      token: 'valid-token-abc123',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(404);
    expect(result.data).toHaveProperty('error');
  });

  test('ya reclamada → 409', async ({ page }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    const result = await makeRequestEquipo(page, 'POST', '/reclamar', {
      instructorId: PROPIETARIA.id,
      token: 'valid-token-abc123',
    });

    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.status).toBe(409);
    expect(result.data).toHaveProperty('error');
  });

  test('rate limit: 25 requests en 60s → última falla con 429', async ({
    page,
  }) => {
    await mockBackendEquipo(page, { rol: 'PROPIETARIO' });
    await seedAuth(page, PROPIETARIA_ID, 'maria@test.com');
    await page.goto('/dashboard');

    for (let i = 0; i < 24; i++) {
      await makeRequestEquipo(page, 'POST', '/reclamar', {
        instructorId: 'ins-test-' + i,
        token: 'token-' + i,
      });
    }

    const lastResult = await makeRequestEquipo(page, 'POST', '/reclamar', {
      instructorId: 'ins-test-25',
      token: 'token-25',
    });

    expect(lastResult.requestCount).toBeGreaterThan(0);
    expect(lastResult.status).toBe(429);
  });
});
