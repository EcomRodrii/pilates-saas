import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La promesa del rediseño del panel de tipo de clase, escrita como contrato:
//
//   "Pongo el nombre, elijo duración/nivel/aforo y listo" — sin abrir ninguna
//   sección avanzada, y sin que por ello se fije ninguna regla a espaldas de la
//   propietaria.
//
// El riesgo real que cubre no es visual. Es que un formulario con divulgación
// progresiva tiene 8 reglas que la propietaria NO ve al crear: si alguna dejara
// de mandarse como `null` —un `0` por defecto, un `false` de un tri-estado mal
// inicializado— la clase nueva nacería con una regla propia que nadie eligió y
// dejaría de seguir al estudio para siempre, en silencio. Eso no se ve en
// pantalla: solo se ve en lo que sale hacia la BD, que es lo que se mira aquí.
//
// La otra mitad (dejar de heredar al EDITAR) vive en
// `cancelacion-por-tipo-de-clase.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// El estudio trae valores NO triviales en todas las reglas heredables: si el
// formulario colara alguno como override, se vería como ese mismo número
// viajando en el INSERT en vez de un null.
const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  cancelacion_ventana_horas: 12, reserva_exigir_plan: true,
  reserva_ventana_minima_minutos: 120, reserva_antelacion_maxima_dias: 30,
  permite_lista_espera: true, requiere_aprobacion: false,
  lista_espera_plazo_aceptacion_minutos: 30, minimo_asistentes_por_clase: 2,
  penalizacion_importe_eur: 10,
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

async function mockBackend(page: Page) {
  const tipos: Record<string, unknown>[] = [];

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
    return json(route, tipos);
  });

  return { tipos };
}

async function abrirClases(page: Page) {
  await page.goto('/configuracion?tab=clases');
  await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Crear un tipo de clase normal', () => {
  test('nombre + duración + nivel + plazas: sin abrir nada avanzado, todo lo demás hereda', async ({ page }) => {
    const { tipos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirClases(page);

    await page.getByRole('button', { name: 'Nuevo tipo de clase' }).click();

    await page.getByLabel('Nombre de la clase').fill('Reformer Iniciación');
    await page.getByRole('button', { name: '50 min', exact: true }).click();
    await page.getByRole('button', { name: 'Principiante', exact: true }).click();
    await page.getByLabel('Plazas por defecto').fill('8');

    await page.getByRole('button', { name: 'Crear tipo de clase' }).click();

    await expect.poll(() => tipos.length, { timeout: 15_000 }).toBe(1);

    // Lo elegido llega tal cual…
    expect(tipos[0]).toMatchObject({
      nombre: 'Reformer Iniciación',
      duracion_minutos: 50,
      nivel: 'PRINCIPIANTE',
      aforo_por_defecto: 8,
    });

    // …y NINGUNA de las 8 reglas que no se tocaron viaja con valor. `null` es
    // lo único que significa "sigue al estudio": un 0 o un false aquí serían
    // una regla propia que nadie pidió.
    for (const columna of [
      'ventana_cancelacion_horas',
      'reserva_exigir_plan',
      'reserva_ventana_minima_minutos',
      'reserva_antelacion_maxima_dias',
      'permite_lista_espera',
      'requiere_aprobacion',
      'lista_espera_plazo_aceptacion_minutos',
      'minimo_asistentes_por_clase',
      'penalizacion_importe_eur',
      'especialidad_network',
    ]) {
      expect(tipos[0][columna], `${columna} debería heredar del estudio`).toBeNull();
    }
  });

  test('sin nombre no se guarda nada y se dice por qué, junto al campo', async ({ page }) => {
    // El fallo que esto evita no es el error feo: es que el panel se cierre
    // "guardando" una clase que la BD nunca aceptó.
    const { tipos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirClases(page);

    await page.getByRole('button', { name: 'Nuevo tipo de clase' }).click();
    await page.getByRole('button', { name: 'Crear tipo de clase' }).click();

    await expect(page.getByText('Ponle un nombre a la clase — es lo primero que ve tu alumna.')).toBeVisible();
    // El panel sigue abierto y no ha salido ni una escritura.
    await expect(page.getByLabel('Nombre de la clase')).toBeVisible();
    expect(tipos).toHaveLength(0);

    // Y en cuanto se corrige, guarda: el error no deja el formulario bloqueado.
    await page.getByLabel('Nombre de la clase').fill('Mat');
    await page.getByRole('button', { name: 'Crear tipo de clase' }).click();
    await expect.poll(() => tipos.length, { timeout: 15_000 }).toBe(1);
  });
});
