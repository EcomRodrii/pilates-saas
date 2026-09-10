import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Pasar lista por tipo de clase (migr 20260909210000, #1819).
//
// El estudio ya podía decidir si se pasa lista, pero para todos sus tipos de
// clase a la vez. Ahora cada uno puede llevarle la contraria: se pasa en el
// Reformer de 6 plazas y no en el Mat de 25.
//
// ⚠️ Esto NO es un interruptor cosmético, y por eso hay E2E. Con la lista
// apagada, un barrido marca ASISTIDA toda reserva confirmada al terminar la
// clase — y ASISTIDA es lo que dispara créditos, racha, logros y el premio de
// referido. Un ajuste que se pinta pero no se guarda dejaría al estudio creyendo
// que ha apagado algo que sigue encendido.
//
// Esta suite fija tres contratos:
//   1. apagarla en un tipo de clase LLEGA A LA BD (`requiere_checkin_qr: false`)
//      y sigue ahí al recargar;
//   2. no tocarla sigue significando "hereda del estudio" — ningún tipo de clase
//      existente cambia de comportamiento;
//   3. al apagarla se EXPLICA lo que implica. Era parte del encargo: sin ese
//      texto, la propietaria no tiene forma de saber que las alumnas van a
//      recibir sus créditos solas.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  // El estudio SÍ pasa lista: así el override a "no" es un cambio de verdad y
  // no una coincidencia con el valor heredado.
  requiere_checkin_qr: true,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

/** Un tipo de clase SIN override: es lo que tienen hoy los 36 de producción. */
function tipoClaseRow(id: string, nombre: string): Record<string, unknown> {
  return {
    id, studio_id: STUDIO_ID, nombre, color: '#F7A6C4', duracion_minutos: 55,
    descripcion: null, nivel: 'TODOS', foto_url: null, requiere_checkin_qr: null,
  };
}

async function mockBackend(page: Page, opts: { tiposIniciales?: Record<string, unknown>[] } = {}) {
  const tipos: Record<string, unknown>[] = [...(opts.tiposIniciales ?? [])];

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

  await page.route('**/rest/v1/tipos_clase**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      tipos.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'PATCH') {
      const cambios = JSON.parse(req.postData() || '{}');
      const id = decodeURIComponent(req.url().match(/id=eq\.([^&]+)/)?.[1] ?? '');
      const i = tipos.findIndex(t => t.id === id);
      if (i >= 0) tipos[i] = { ...tipos[i], ...cambios };
      return json(route, [], 200);
    }
    return json(route, tipos);
  });

  return { tipos };
}

async function abrirClases(page: Page) {
  await page.goto('/configuracion?tab=clases');
  await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
}

// Anclado al principio: el disparador de sección tiene por nombre accesible el
// título MÁS su resumen, y «Reservas» a secas es una palabra demasiado corta
// para fiarse (hoy no colisiona con nada del menú — comprobado —, pero mañana).
const SECCION_RESERVAS = '^Reservas';
const PERSONALIZAR = 'Personalizar: ¿Hay que pasar lista en esta clase?';
const GRUPO = '¿Hay que pasar lista en esta clase?';

/** Despliega la sección y sale de la herencia: los dos gestos que pide el panel. */
async function abrirAjusteDeLista(page: Page) {
  await page.getByRole('button', { name: new RegExp(SECCION_RESERVAS) }).click();
  await page.getByRole('button', { name: PERSONALIZAR }).click();
}

test.describe('Pasar lista por tipo de clase', () => {
  test('apagarla se guarda de verdad y sigue apagada al recargar', async ({ page }) => {
    const { tipos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirClases(page);

    await page.getByRole('button', { name: 'Nuevo tipo de clase' }).click();
    await page.getByPlaceholder('Ej: Reformer Avanzado').fill('Mat abierto');

    await abrirAjusteDeLista(page);
    await page.getByRole('group', { name: GRUPO }).getByRole('button', { name: 'No hace falta' }).click();

    await page.getByRole('button', { name: 'Crear tipo de clase' }).click();

    // Llegó a la BD como su propio campo. `false` y no `null`: son cosas
    // distintas — `null` es "hereda", y el estudio aquí SÍ pasa lista.
    await expect.poll(() => tipos.length, { timeout: 15_000 }).toBe(1);
    expect(tipos[0]).toMatchObject({ nombre: 'Mat abierto', requiere_checkin_qr: false });

    // Y se ve en la tarjeta sin abrir la clase.
    await expect(page.getByText('Sin pasar lista')).toBeVisible();

    // La comprobación de la dueña: recargar y ver si le dijimos la verdad.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Sin pasar lista')).toBeVisible();
  });

  test('sin tocarla, sigue heredando del estudio', async ({ page }) => {
    // Compatibilidad hacia atrás: los 36 tipos de clase que hay en producción
    // no deben empezar a comportarse distinto por su cuenta.
    await mockBackend(page, { tiposIniciales: [tipoClaseRow('tc-mat', 'Mat')] });
    await seedSesionDeDuena(page);
    await abrirClases(page);

    await expect(page.getByText('Mat')).toBeVisible();
    // Ningún chip: ni "Se pasa lista" ni "Sin pasar lista". Hereda.
    await expect(page.getByText(/Se pasa lista|Sin pasar lista/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: new RegExp(SECCION_RESERVAS) }).click();

    // Heredada: no hay control que tocar, hay una frase que leer — y el botón
    // para salirse, que es justo lo que prueba que sigue heredando.
    await expect(page.getByRole('button', { name: PERSONALIZAR })).toBeVisible();
    await expect(page.getByRole('group', { name: GRUPO })).toHaveCount(0);
  });

  test('al apagarla se explica que las alumnas cobran créditos solas', async ({ page }) => {
    // Sin este texto, el interruptor parece que solo esconde el escáner. Lo que
    // hace de verdad es dar por asistida a todo el mundo, con lo que eso
    // arrastra: créditos, racha y logros sin que nadie escanee nada.
    await mockBackend(page, { tiposIniciales: [tipoClaseRow('tc-mat', 'Mat')] });
    await seedSesionDeDuena(page);
    await abrirClases(page);

    await page.getByRole('button', { name: 'Editar' }).first().click();
    await abrirAjusteDeLista(page);

    // Con "Sí" no hace falta explicar nada: es el comportamiento de siempre.
    await expect(page.getByText(/recibirán créditos, racha y logros solas/i)).toHaveCount(0);

    await page.getByRole('group', { name: GRUPO }).getByRole('button', { name: 'No hace falta' }).click();
    await expect(page.getByText(/recibirán créditos, racha y logros solas/i)).toBeVisible();
  });
});
