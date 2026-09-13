import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "El reformer me cuesta el doble de producir que el mat."
//
// Un plan cubría TODAS las clases del estudio, sin excepción. Para una dueña con
// reformer eso rompe su tarifa: un Bono 10 Reformer a 130 € servía igual para
// Mat a 12 €, así que o cobraba el mat de más o el reformer de menos. No es un
// capricho de configuración, es la base de su precio.
//
// Esta suite fija el contrato de la pantalla donde lo decide (Paquetes,
// /productos — la única pantalla de tarifas desde el 13-sep):
//   1. puede acotar un plan a ciertos tipos de clase, y lo acotado se GUARDA
//      (con las filas que toca, no solo pintado);
//   2. no marcar nada sigue significando "vale para todas" — que es lo que
//      hacen todos los planes que ya existían, y no deben cambiar de sentido.
//
// Mismo enfoque que guardar-salas.spec.ts: env dummy + backend interceptado.
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

const TIPOS_CLASE = [
  { id: 'tc-reformer', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#6D28D9' },
  { id: 'tc-mat', studio_id: STUDIO_ID, nombre: 'Mat', duracion_min: 50, color: '#F7A6C4' },
];

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
 * Backend interceptado. Tanto `planes_tarifa` como `plan_tipos_clase` viven en
 * arrays del test: lo que la app escriba es lo que un reload devuelve, que es
 * justo lo que hay que comprobar (que se guardó de verdad, no que se pintó).
 */
async function mockBackend(page: Page, opts: {
  planesIniciales?: Record<string, unknown>[];
  vinculosIniciales?: Record<string, unknown>[];
} = {}) {
  const planes: Record<string, unknown>[] = [...(opts.planesIniciales ?? [])];
  const vinculos: Record<string, unknown>[] = [...(opts.vinculosIniciales ?? [])];

  // OJO: Playwright resuelve las rutas en orden INVERSO al de registro, así que
  // los comodines van PRIMERO y las específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS_CLASE));

  await page.route('**/rest/v1/planes_tarifa**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      planes.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'PATCH') {
      const cambios = JSON.parse(req.postData() || '{}');
      const id = decodeURIComponent(req.url().match(/id=eq\.([^&]+)/)?.[1] ?? '');
      const i = planes.findIndex(p => p.id === id);
      if (i >= 0) planes[i] = { ...planes[i], ...cambios };
      // Las filas TOCADAS, como PostgREST con `.select()`: la escritura ahora
      // distingue «0 filas» de «escrito» para no cantar «Tarifa actualizada»
      // cuando la RLS rechaza.
      return json(route, i >= 0 ? [{ id }] : [], 200);
    }
    return json(route, planes);
  });

  await page.route('**/rest/v1/plan_tipos_clase**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      vinculos.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'DELETE') {
      // El guardado sincroniza: borra los vínculos del plan y reinserta.
      const planId = decodeURIComponent(req.url().match(/plan_id=eq\.([^&]+)/)?.[1] ?? '');
      for (let i = vinculos.length - 1; i >= 0; i--) {
        if (vinculos[i].plan_id === planId) vinculos.splice(i, 1);
      }
      return route.fulfill({ status: 204, contentType: 'application/json', body: '[]' });
    }
    return json(route, vinculos);
  });

  return { planes, vinculos };
}

function planRow(id: string, nombre: string): Record<string, unknown> {
  return {
    id, studio_id: STUDIO_ID, nombre, descripcion: null, precio: 130,
    tipo: 'BONO', sesiones: 10, validez_dias: 90, limite_semanal: null, activo: true,
  };
}

async function abrirPlanes(page: Page) {
  // Las tarifas viven solo en Paquetes desde el 13-sep (Configuración → Planes
  // y tarifas se quitó). Paquetes abre en «Suscripciones»: los planes de este
  // spec son bonos, así que se entra en su pestaña.
  await page.goto('/productos');
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Bonos/ }).click();
}

test.describe('Un bono que solo vale para ciertas clases', () => {
  test('acotar un plan a Reformer guarda el vínculo y sigue ahí al recargar', async ({ page }) => {
    const { vinculos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirPlanes(page);

    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await page.getByPlaceholder('Ej. Bono 4 clases').fill('Bono 10 Reformer');
    await page.getByPlaceholder('0,00').first().fill('130');
    await page.getByPlaceholder('4').fill('10');

    // Por defecto sirve para todas; acotarlo es una decisión explícita.
    await expect(page.getByRole('radio', { name: /Todas las clases/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: /Solo algunas clases/ }).click();
    const reformer = page.getByRole('checkbox', { name: 'Reformer' });
    await expect(reformer).not.toBeChecked();
    await reformer.check();

    await page.getByRole('button', { name: 'Crear bono de sesiones' }).click();

    // Lo que importa: llegó a la BD como fila de vínculo, no solo a la pantalla.
    await expect.poll(() => vinculos.length, { timeout: 15_000 }).toBe(1);
    expect(vinculos[0]).toMatchObject({ tipo_clase_id: 'tc-reformer', studio_id: STUDIO_ID });

    // La comprobación de la dueña: recargar y ver si le dijimos la verdad.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Bonos/ }).click();
    await page.getByRole('button', { name: 'Editar plan' }).first().click();
    await expect(page.getByRole('checkbox', { name: 'Reformer' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Mat' })).not.toBeChecked();
  });

  test('sin marcar nada, el plan sigue sirviendo para todas las clases', async ({ page }) => {
    // Compatibilidad hacia atrás: los planes que ya existían no tienen vínculos
    // y no deben empezar a excluir clases por su cuenta.
    const { vinculos } = await mockBackend(page, {
      planesIniciales: [planRow('plan-viejo', 'Bono 10 sesiones')],
    });
    await seedSesionDeDuena(page);
    await abrirPlanes(page);

    await page.getByRole('button', { name: 'Editar plan' }).first().click();
    await expect(page.getByRole('radio', { name: /Todas las clases/ })).toHaveAttribute('aria-checked', 'true');
    // Sin «Solo algunas clases» no se enseña la lista de clases: no excluye nada.
    await expect(page.getByRole('checkbox', { name: 'Reformer' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0, { timeout: 15_000 });
    expect(vinculos).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Y que se VEA sin abrir la tarifa.
//
// La restricción se guardaba bien, pero la lista de tarifas no decía a qué
// clases servía: para saber si un bono estaba acotado había que abrirlo uno por
// uno. Con ocho o diez tarifas, lo único que separa un bono caro de una fuga de
// ingresos quedaba escondido justo donde irías a auditarlo.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('La cobertura se ve en la lista de tarifas', () => {
  test('un plan sin acotar dice que sirve para todas', async ({ page }) => {
    await mockBackend(page, { planesIniciales: [planRow('plan-1', 'Bono 10 sesiones')] });
    await seedSesionDeDuena(page);
    await abrirPlanes(page);

    await expect(page.getByTestId('cobertura-plan')).toHaveText('Sirve para todas las clases');
  });

  test('un plan acotado nombra las clases que cubre, sin tener que abrirlo', async ({ page }) => {
    await mockBackend(page, {
      planesIniciales: [planRow('plan-1', 'Bono 10 Reformer')],
      vinculosIniciales: [{ plan_id: 'plan-1', tipo_clase_id: 'tc-reformer', studio_id: STUDIO_ID }],
    });
    await seedSesionDeDuena(page);
    await abrirPlanes(page);

    await expect(page.getByTestId('cobertura-plan')).toHaveText('Solo para Reformer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El tipo de tarifa se enseñaba con la constante de la base de datos.
// «PUNTUAL» no es una palabra que use una dueña de estudio: dice «clase suelta».
// ─────────────────────────────────────────────────────────────────────────────
test.describe('El tipo de tarifa se dice en castellano', () => {
  test('la tarjeta no enseña la constante en mayúsculas', async ({ page }) => {
    await mockBackend(page, { planesIniciales: [planRow('plan-1', 'Bono 10 sesiones')] });
    await seedSesionDeDuena(page);
    await abrirPlanes(page);

    await expect(page.getByText('Bono 10 sesiones')).toBeVisible();
    await expect(page.getByText('BONO', { exact: true })).toHaveCount(0);
  });

  test('las pestañas de tipo tampoco', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirPlanes(page);

    for (const nombre of [/^Suscripciones/, /^Bonos/, /^Bajo demanda/]) {
      await expect(page.getByRole('button', { name: nombre })).toBeVisible();
    }
    for (const constante of ['MENSUAL', 'BONO', 'PUNTUAL']) {
      await expect(page.getByRole('button', { name: constante, exact: true })).toHaveCount(0);
    }
  });
});
