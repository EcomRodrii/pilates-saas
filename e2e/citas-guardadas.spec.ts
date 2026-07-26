import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La última escritura optimista que quedaba fuera de los módulos congelados.
//
// `addCita`, `updateCita`, `completarCita` y `cancelarCita` pintaban primero y
// escribían después sin mirar el resultado. Una cita es una hora bloqueada de
// una instructora y, con `precio`/`pagada`, también dinero:
//
//   · si el alta falla y aun así aparece en la agenda, se bloquea a la
//     instructora para algo que no existe;
//   · si «pagada» falla y aun así se pinta el check, nadie va a reclamar ese
//     dinero — el estudio lo da por cobrado.
//
// Ojo con el diagnóstico: un toast SÍ saltaba (`reportDbError` avisa al
// listener global). Lo que fallaba no era el silencio, era que la pantalla
// seguía enseñando lo que no se había guardado, y el toast se va solo a los
// pocos segundos. Quien mira la agenda al día siguiente ve la cita fantasma y
// ningún aviso.
//
// Mismo contrato que en salas (#378): si la base de datos rechaza, no se pinta
// nada y el motivo se queda en pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Studio Carmen',
  slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID,
  email: 'carmen@example.com',
  moneda: 'EUR',
};

const SOCIO_ROW = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Marta', apellidos: 'Ruiz',
  email: 'marta@example.com', activo: true, fecha_alta: '2026-01-10T09:00:00+00:00',
  campos_extra: {},
};

const INSTRUCTOR_ROW = {
  id: 'inst-1', studio_id: STUDIO_ID, nombre: 'Laura', email: 'laura@example.com',
  activo: true, rol: 'INSTRUCTOR',
};

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token',
      refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800,
      expires_in: 999999999,
      token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockBackend(page: Page, opts: {
  fallaInsert?: { status: number; body: unknown };
  fallaUpdate?: { status: number; body: unknown };
  citasIniciales?: Record<string, unknown>[];
} = {}) {
  const citasGuardadas: Record<string, unknown>[] = [...(opts.citasIniciales ?? [])];
  const parches: Record<string, unknown>[] = [];

  // Playwright resuelve las rutas en orden INVERSO al de registro: comodines
  // primero, específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO_ROW]));
  await page.route('**/rest/v1/instructores**', route => json(route, [INSTRUCTOR_ROW]));

  await page.route('**/rest/v1/citas**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      if (opts.fallaInsert) return json(route, opts.fallaInsert.body, opts.fallaInsert.status);
      const payload = JSON.parse(req.postData() || '{}');
      citasGuardadas.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'PATCH') {
      if (opts.fallaUpdate) return json(route, opts.fallaUpdate.body, opts.fallaUpdate.status);
      parches.push(JSON.parse(req.postData() || '{}'));
      return json(route, [], 200);
    }
    return json(route, citasGuardadas);
  });

  return { citasGuardadas, parches };
}

/** Una cita futura ya guardada, para probar las acciones de la fila. */
function citaRow(id: string, pagada: boolean): Record<string, unknown> {
  return {
    id, studio_id: STUDIO_ID, socio_id: 'soc-1', instructor_id: 'inst-1',
    tipo: 'PRIVADA', inicio: '2027-03-01T09:00:00+00:00', fin: '2027-03-01T10:00:00+00:00',
    notas: null, estado: 'PENDIENTE', precio: 45, pagada,
    creado_en: '2026-07-01T09:00:00+00:00',
  };
}

async function abrirCitas(page: Page) {
  await page.goto('/citas');
  await expect(page.getByRole('button', { name: /Nueva cita/i }).first())
    .toBeVisible({ timeout: 30_000 });
}

async function rellenarNuevaCita(page: Page) {
  await page.getByRole('button', { name: /Nueva cita/i }).first().click();
  await page.getByRole('combobox', { name: 'Clienta' }).selectOption('soc-1');
  await page.getByRole('combobox', { name: 'Instructor' }).selectOption('inst-1');
  await page.getByLabel('Fecha').fill('2027-03-01');
  await page.getByLabel('Hora').fill('09:00');
}

test.describe('Crear una cita', () => {
  test('cuando la base de datos acepta, la cita se guarda de verdad', async ({ page }) => {
    const { citasGuardadas } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirCitas(page);

    await rellenarNuevaCita(page);
    await page.getByRole('button', { name: 'Guardar cita' }).click();

    await expect.poll(() => citasGuardadas.length, { timeout: 15_000 }).toBe(1);
    expect(citasGuardadas[0]).toMatchObject({ socio_id: 'soc-1', instructor_id: 'inst-1', studio_id: STUDIO_ID });
    // El modal se cierra solo cuando ya está guardada.
    await expect(page.getByRole('button', { name: 'Guardar cita' })).toHaveCount(0);
  });

  test('cuando la base de datos rechaza, no se pinta la cita y se dice el motivo', async ({ page }) => {
    await mockBackend(page, {
      fallaInsert: {
        status: 403,
        body: { code: '42501', message: 'new row violates row-level security policy for table "citas"' },
      },
    });
    await seedSesionDeDuena(page);
    await abrirCitas(page);

    await rellenarNuevaCita(page);
    await page.getByRole('button', { name: 'Guardar cita' }).click();

    // El motivo real (permisos), no "revisa tu conexión".
    const aviso = page.getByRole('dialog').getByRole('alert');
    await expect(aviso).toContainText('No se ha guardado');
    await expect(aviso).toContainText('permiso');
    await expect(page.getByText('conexión')).toHaveCount(0);

    // La cita fantasma NO aparece en la agenda. Se mira el email porque el
    // nombre también sale en el desplegable de clientas del propio modal.
    await expect(page.getByText('marta@example.com')).toHaveCount(0);
    // …y el formulario sigue relleno: no se pierde el trabajo por un fallo ajeno.
    await expect(page.getByLabel('Fecha')).toHaveValue('2027-03-01');
  });
});

test.describe('Marcar una cita como pagada', () => {
  test('si el cobro no se guarda, no se pinta como pagada', async ({ page }) => {
    // El peor de los silencios: el estudio da por cobrados 45 € que nunca se
    // registraron, así que nadie va a reclamarlos.
    await mockBackend(page, {
      citasIniciales: [citaRow('cita-1', false)],
      fallaUpdate: { status: 403, body: { code: '42501', message: 'permission denied for table citas' } },
    });
    await seedSesionDeDuena(page);
    await abrirCitas(page);

    await expect(page.getByText('marta@example.com')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pendiente de cobro' }).first().click();

    const aviso = page.getByRole('alert').filter({ hasText: 'No se ha guardado' });
    await expect(aviso).toContainText('permiso');
    // Y sigue sin constar como pagada, que es lo que evita el agujero.
    await expect(page.getByRole('button', { name: 'Pendiente de cobro' }).first()).toBeVisible();
  });

  test('si se guarda, el cambio queda registrado', async ({ page }) => {
    const { parches } = await mockBackend(page, { citasIniciales: [citaRow('cita-1', false)] });
    await seedSesionDeDuena(page);
    await abrirCitas(page);

    await expect(page.getByText('marta@example.com')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pendiente de cobro' }).first().click();

    await expect.poll(() => parches.length, { timeout: 15_000 }).toBe(1);
    expect(parches[0]).toMatchObject({ pagada: true });
    await expect(page.getByRole('alert').filter({ hasText: 'No se ha guardado' })).toHaveCount(0);
  });
});
