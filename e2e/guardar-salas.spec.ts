import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Nunca enseñes en pantalla algo que no has guardado."
//
// Las salas NO se guardaban: `addSala` solo tocaba el estado local y en todo el
// repo no existía un solo insert sobre `salas`. La UI decía "1 salas
// configuradas" y al recargar no había nada — y como `sesiones.sala_id` tiene
// una FK contra `salas`, esa sala fantasma también reventaba la creación de
// clases.
//
// Esta suite fija las dos mitades del contrato:
//   1. si la base de datos ACEPTA, la sala se guarda de verdad y sigue ahí al
//      recargar la página (la comprobación que hacía la clienta a mano);
//   2. si la base de datos RECHAZA, la sala NO aparece en pantalla y se explica
//      el motivo real — nada de "revisa tu conexión" cuando es un permiso.
//
// Mismo enfoque que booking.spec.ts: env dummy + todo el backend interceptado,
// así que es determinista y no toca datos reales.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
// Deriva de NEXT_PUBLIC_SUPABASE_URL (https://example.supabase.co) en
// playwright.config.ts: supabase-js compone la clave con el subdominio.
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Studio Carmen',
  slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID,
  email: 'carmen@example.com',
  moneda: 'EUR',
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

/**
 * Intercepta todo el backend. `salas` vive en un array del propio test: los
 * POST que la app acepte se quedan ahí, así que un reload posterior devuelve
 * exactamente lo que se guardó — que es justo lo que queremos comprobar.
 */
async function mockBackend(page: Page, opts: {
  fallaInsert?: { status: number; body: unknown };
  fallaDelete?: { status: number; body: unknown };
  salasIniciales?: Record<string, unknown>[];
  sesiones?: Record<string, unknown>[];
} = {}) {
  const salasGuardadas: Record<string, unknown>[] = [...(opts.salasIniciales ?? [])];
  const borradas: string[] = [];

  // OJO con el orden: Playwright resuelve las rutas en orden INVERSO al de
  // registro, así que los comodines van PRIMERO y las específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  // Cualquier otra tabla del arranque del contexto: vacía y sin ruido.
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Sesiones del estudio: por defecto ninguna. Un test puede sembrar clases que
  // referencian una sala para probar que su borrado queda bloqueado.
  await page.route('**/rest/v1/sesiones**', route => json(route, opts.sesiones ?? []));

  await page.route('**/rest/v1/salas**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      if (opts.fallaInsert) return json(route, opts.fallaInsert.body, opts.fallaInsert.status);
      const payload = JSON.parse(req.postData() || '{}');
      salasGuardadas.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'DELETE') {
      // Simula el rechazo de la BD (p.ej. FK 23503 si la sala tiene clases que
      // el cliente no tenía en memoria) para comprobar el mensaje del borrado.
      if (opts.fallaDelete) return json(route, opts.fallaDelete.body, opts.fallaDelete.status);
      const id = decodeURIComponent(req.url().match(/id=eq\.([^&]+)/)?.[1] ?? '');
      if (id) {
        borradas.push(id);
        const i = salasGuardadas.findIndex(s => s.id === id);
        if (i >= 0) salasGuardadas.splice(i, 1);
      }
      return route.fulfill({ status: 204, contentType: 'application/json', body: '[]' });
    }
    return json(route, salasGuardadas);
  });

  return { salasGuardadas, borradas };
}

// Una sala ya guardada (forma de la BD: snake_case, como la devuelve PostgREST).
function salaRow(id: string, nombre: string): Record<string, unknown> {
  return { id, studio_id: STUDIO_ID, nombre, capacidad: 10, color: '#F7A6C4' };
}

// Una clase que ocupa la sala `salaId`. Solo necesita forma válida para mapSesion.
function sesionRow(id: string, salaId: string): Record<string, unknown> {
  return {
    id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: salaId,
    instructor_id: 'inst-1', inicio: '2026-08-01T09:00:00+00:00',
    fin: '2026-08-01T10:00:00+00:00', aforo_maximo: 10, cancelada: false,
  };
}

async function abrirSalas(page: Page) {
  await page.goto('/configuracion?tab=salas');
  await expect(page.getByRole('button', { name: 'Nueva sala' })).toBeVisible({ timeout: 30_000 });
}

async function rellenarYGuardar(page: Page, nombre: string) {
  await page.getByRole('button', { name: 'Nueva sala' }).click();
  await page.getByPlaceholder('Ej: Sala Reformer').fill(nombre);
  await page.getByRole('button', { name: 'Crear sala' }).click();
}

test.describe('Guardar una sala', () => {
  test('cuando la base de datos acepta, la sala sigue ahí al recargar', async ({ page }) => {
    const { salasGuardadas } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await expect(page.getByText('0 salas configuradas')).toBeVisible();
    await rellenarYGuardar(page, 'Sala Reformer');

    // Se confirma con el nombre, no con un "correctamente" genérico.
    await expect(page.getByText('"Sala Reformer" ya está guardada')).toBeVisible();
    await expect(page.getByText('1 sala configurada')).toBeVisible();

    // Llegó a la base de datos con la forma correcta.
    expect(salasGuardadas).toHaveLength(1);
    expect(salasGuardadas[0]).toMatchObject({ nombre: 'Sala Reformer', studio_id: STUDIO_ID });

    // La comprobación de la clienta: recargar y ver si le dijimos la verdad.
    await page.reload();
    await expect(page.getByRole('cell', { name: 'Sala Reformer' })).toBeVisible({ timeout: 30_000 });
  });

  test('cuando la base de datos rechaza, no se pinta nada y se dice el motivo real', async ({ page }) => {
    await mockBackend(page, {
      fallaInsert: {
        status: 403,
        body: { code: '42501', message: 'new row violates row-level security policy for table "salas"' },
      },
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await rellenarYGuardar(page, 'Sala Fantasma');

    // El motivo real (permisos), no "revisa tu conexión". Se comprueba en los
    // dos sitios donde antes se mentía: el aviso del propio modal y el toast
    // global del contexto, que ignoraba el error y siempre culpaba a la red.
    const avisoModal = page.getByRole('dialog').getByRole('alert');
    await expect(avisoModal).toContainText('No se ha guardado');
    await expect(avisoModal).toContainText('permiso');
    await expect(page.getByText('conexión')).toHaveCount(0);

    // Y sobre todo: la sala NO existe en ninguna parte de la pantalla.
    await expect(page.getByText('0 salas configuradas')).toBeVisible();
    await expect(page.getByText('"Sala Fantasma" ya está guardada')).toHaveCount(0);

    // El modal sigue abierto con lo escrito: no se pierde el trabajo.
    await expect(page.getByPlaceholder('Ej: Sala Reformer')).toHaveValue('Sala Fantasma');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Borrar una sala. `sesiones.sala_id` la referencia con FK NO ACTION, así que
// una sala CON clases no se puede borrar. Antes eso daba mala UX: el diálogo
// prometía que el borrado seguía adelante y, al fallar, el mensaje era el de un
// INSERT ("vuelve a crearlo"). Ahora: se avisa antes (sin diálogo destructivo),
// el texto del diálogo es honesto, y si aun así la BD rechaza, el mensaje es el
// del borrado.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Borrar una sala', () => {
  test('una sala con clases avisa y NO abre el borrado destructivo', async ({ page }) => {
    const { borradas } = await mockBackend(page, {
      salasIniciales: [salaRow('sala-1', 'Sala Reformer')],
      sesiones: [sesionRow('ses-1', 'sala-1')],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await expect(page.getByRole('cell', { name: 'Sala Reformer' })).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar sala' }).first().click();

    // Aviso claro con el motivo y qué hacer...
    await expect(page.getByText('No se puede borrar la sala')).toBeVisible();
    await expect(page.getByText(/Hay 1 clase asociada a «Sala Reformer»/)).toBeVisible();
    await expect(page.getByText(/Reasígnalas a otra sala o elimínalas primero/)).toBeVisible();
    // ...y NUNCA el diálogo destructivo ni un intento de borrado.
    await expect(page.getByText('¿Eliminar sala?')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toHaveCount(0);
    expect(borradas).toHaveLength(0);
  });

  test('una sala sin clases se borra tras un aviso honesto', async ({ page }) => {
    const { borradas } = await mockBackend(page, {
      salasIniciales: [salaRow('sala-vacia', 'Sala Vacía')],
      sesiones: [],
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await expect(page.getByRole('cell', { name: 'Sala Vacía' })).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar sala' }).first().click();

    // Diálogo destructivo con texto honesto: sin la falsa promesa de antes.
    await expect(page.getByText('¿Eliminar sala?')).toBeVisible();
    await expect(page.getByText(/de forma permanente/)).toBeVisible();
    await expect(page.getByText(/no se verán afectadas automáticamente/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();

    await expect(page.getByText('Sala eliminada')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sala Vacía' })).toHaveCount(0);
    expect(borradas).toEqual(['sala-vacia']);
  });

  test('si la BD rechaza el borrado (FK 23503), el mensaje es el del borrado, no el de crear', async ({ page }) => {
    // Pre-check en verde (el cliente no ve clases) pero la BD sí las tiene: se
    // llega al DELETE y este falla con 23503 — la red de seguridad de dbDeleteSala.
    await mockBackend(page, {
      salasIniciales: [salaRow('sala-x', 'Sala X')],
      sesiones: [],
      fallaDelete: {
        status: 409,
        body: {
          code: '23503',
          message: 'update or delete on table "salas" violates foreign key constraint "sesiones_sala_id_fkey" on table "sesiones"',
        },
      },
    });
    await seedSesionDeDuena(page);
    await abrirSalas(page);

    await page.getByRole('button', { name: 'Eliminar sala' }).first().click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();

    // El mensaje propio del borrado...
    await expect(page.getByText(/No puedes borrar una sala con clases asignadas/)).toBeVisible();
    // ...y NUNCA el texto pensado para un INSERT ("vuelve a crearlo").
    await expect(page.getByText(/vuelve a crearlo/i)).toHaveCount(0);
    // La sala sigue en la tabla: el borrado no se dio por bueno.
    await expect(page.getByRole('cell', { name: 'Sala X' })).toBeVisible();
  });
});
