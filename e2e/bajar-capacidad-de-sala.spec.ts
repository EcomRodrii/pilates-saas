import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Bajar la capacidad de una sala no puede dejar clases sobrevendidas en silencio.
//
// `aforo_efectivo()` parte de `sesiones.aforo_maximo` y solo descuenta averías
// de máquina — nunca mira `salas.capacidad`. Así que retirabas dos reformers,
// bajabas la sala de 12 a 10, y las clases ya programadas seguían admitiendo
// reservas hasta 12. El martes se presentaban dos personas de más y nadie había
// avisado. La información estaba a mano (el borrado de sala ya cuenta sus
// clases), simplemente no se usaba al guardar la capacidad.
//
// Esta suite fija el contrato:
//   1. bajar la capacidad con clases futuras de aforo mayor AVISA antes de guardar;
//   2. avisa distinto —y más fuerte— si esas clases ya tienen reservas;
//   3. «Ajustar también esas clases» baja su aforo, pero NUNCA por debajo de las
//      plazas ya confirmadas: ajustar no puede echar a nadie;
//   4. «Cambiar solo la sala» guarda la sala y deja las clases en paz;
//   5. SUBIR la capacidad, o bajarla sin clases afectadas, no molesta con nada.
//
// Mismo enfoque que guardar-salas.spec.ts: env dummy y backend interceptado, así
// que es determinista y no toca datos reales.
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

// Lejos en el futuro: el aviso solo mira clases que aún no han pasado.
const FUTURO = '2099-08-01T09:00:00+00:00';
const FUTURO_FIN = '2099-08-01T10:00:00+00:00';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

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

function salaRow(id: string, nombre: string, capacidad: number) {
  return { id, studio_id: STUDIO_ID, nombre, capacidad, color: '#F7A6C4' };
}

function sesionRow(id: string, salaId: string, aforo: number) {
  return {
    id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: salaId,
    instructor_id: 'inst-1', inicio: FUTURO, fin: FUTURO_FIN,
    aforo_maximo: aforo, cancelada: false,
  };
}

function reservaRow(id: string, sesionId: string) {
  return {
    id, studio_id: STUDIO_ID, sesion_id: sesionId, socio_id: `soc-${id}`,
    estado: 'CONFIRMADA', posicion_espera: null, creado_en: '2026-01-01T00:00:00Z',
  };
}

/** Devuelve lo que la app ha escrito en `salas` y en `sesiones` (PATCH). */
async function mockBackend(page: Page, opts: {
  salas: Record<string, unknown>[];
  sesiones?: Record<string, unknown>[];
  reservas?: Record<string, unknown>[];
}) {
  const salasPatch: Record<string, unknown>[] = [];
  const sesionesPatch: { id: string; body: Record<string, unknown> }[] = [];

  // Playwright resuelve las rutas en orden INVERSO: comodines primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/reservas**', route => json(route, opts.reservas ?? []));

  await page.route('**/rest/v1/sesiones**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const id = decodeURIComponent(req.url().match(/id=eq\.([^&]+)/)?.[1] ?? '');
      sesionesPatch.push({ id, body: JSON.parse(req.postData() || '{}') });
      return json(route, [], 200);
    }
    return json(route, opts.sesiones ?? []);
  });

  await page.route('**/rest/v1/salas**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      salasPatch.push(JSON.parse(req.postData() || '{}'));
      return json(route, [], 200);
    }
    return json(route, opts.salas);
  });

  return { salasPatch, sesionesPatch };
}

async function abrirSalas(page: Page) {
  await page.goto('/configuracion?tab=salas');
  await expect(page.getByRole('button', { name: 'Nueva sala' })).toBeVisible({ timeout: 30_000 });
}

async function editarCapacidad(page: Page, nuevaCapacidad: string) {
  await page.getByRole('button', { name: 'Editar sala' }).first().click();
  await page.getByLabel('Capacidad (personas)').fill(nuevaCapacidad);
  await page.getByRole('button', { name: 'Guardar' }).click();
}

test.describe('Bajar la capacidad de una sala', () => {
  test('avisa de las clases futuras que se quedan por encima', async ({ page }) => {
    await mockBackend(page, {
      salas: [salaRow('sala-1', 'Sala Reformer', 12)],
      sesiones: [sesionRow('ses-1', 'sala-1', 12), sesionRow('ses-2', 'sala-1', 12)],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await editarCapacidad(page, '10');

    await expect(page.getByText('Tienes clases con más plazas que la sala')).toBeVisible();
    await expect(page.getByText(/2 clases futuras/)).toBeVisible();
  });

  test('dice cuántas de esas clases YA tienen reservas: es lo que duele', async ({ page }) => {
    await mockBackend(page, {
      salas: [salaRow('sala-1', 'Sala Reformer', 12)],
      sesiones: [sesionRow('ses-1', 'sala-1', 12), sesionRow('ses-2', 'sala-1', 12)],
      reservas: [reservaRow('r1', 'ses-1')],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await editarCapacidad(page, '10');

    await expect(page.getByText(/1 de ellas ya tiene reservas/)).toBeVisible();
  });

  test('«ajustar» baja el aforo de las clases, pero NUNCA por debajo de lo ya confirmado', async ({ page }) => {
    // ses-1 tiene 3 confirmadas y se baja la sala a 2: ajustarla a 2 dejaría a
    // una clienta fuera de un aforo que ya ocupa. Se queda en 3, que es el
    // mínimo honesto — no entra nadie más y nadie pierde su plaza.
    const { sesionesPatch } = await mockBackend(page, {
      salas: [salaRow('sala-1', 'Sala Reformer', 12)],
      sesiones: [sesionRow('ses-1', 'sala-1', 12), sesionRow('ses-2', 'sala-1', 12)],
      reservas: [reservaRow('r1', 'ses-1'), reservaRow('r2', 'ses-1'), reservaRow('r3', 'ses-1')],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await editarCapacidad(page, '2');
    await page.getByRole('button', { name: 'Ajustar también esas clases' }).click();

    await expect(page.getByText(/2 clases ajustadas/)).toBeVisible();

    const ses1 = sesionesPatch.find(p => p.id === 'ses-1');
    const ses2 = sesionesPatch.find(p => p.id === 'ses-2');
    // La que tiene 3 confirmadas se queda en 3, no en 2.
    expect(ses1?.body.aforo_maximo).toBe(3);
    // La vacía sí baja a la capacidad nueva.
    expect(ses2?.body.aforo_maximo).toBe(2);
  });

  test('«cambiar solo la sala» guarda la sala y no toca ninguna clase', async ({ page }) => {
    const { salasPatch, sesionesPatch } = await mockBackend(page, {
      salas: [salaRow('sala-1', 'Sala Reformer', 12)],
      sesiones: [sesionRow('ses-1', 'sala-1', 12)],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await editarCapacidad(page, '10');
    await page.getByRole('button', { name: 'Cambiar solo la sala' }).click();

    await expect(page.getByText('Sala actualizada')).toBeVisible();
    expect(salasPatch.at(-1)?.capacidad).toBe(10);
    expect(sesionesPatch).toHaveLength(0);
  });

  test('SUBIR la capacidad no molesta con ningún aviso', async ({ page }) => {
    const { salasPatch } = await mockBackend(page, {
      salas: [salaRow('sala-1', 'Sala Reformer', 10)],
      sesiones: [sesionRow('ses-1', 'sala-1', 10)],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await editarCapacidad(page, '14');

    await expect(page.getByText('Sala actualizada')).toBeVisible();
    await expect(page.getByText('Tienes clases con más plazas que la sala')).toBeHidden();
    expect(salasPatch.at(-1)?.capacidad).toBe(14);
  });

  test('bajarla sin clases que se pasen tampoco molesta', async ({ page }) => {
    await mockBackend(page, {
      salas: [salaRow('sala-1', 'Sala Reformer', 12)],
      sesiones: [sesionRow('ses-1', 'sala-1', 6)], // ya cabía de sobra
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await editarCapacidad(page, '10');

    await expect(page.getByText('Sala actualizada')).toBeVisible();
    await expect(page.getByText('Tienes clases con más plazas que la sala')).toBeHidden();
  });
});
