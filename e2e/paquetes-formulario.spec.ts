import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Que una propietaria que no ha visto Tentare en su vida cree un bono sin
// pararse a pensar qué significa cada campo.»
//
// La pantalla de tarifas de /productos era una columna con los diez campos de
// la tabla puestos en fila, todos visibles a la vez: crear una cuota mensual
// pedía «número de sesiones» y «caduca a los (días)», que en un mensual no
// quieren decir nada. Esta suite fija el contrato del rediseño:
//
//   1. el formulario SE ADAPTA al tipo — nada que no aplique está en pantalla;
//   2. el precio se escribe como se escribe en español, con COMA, y llega
//      entero a la base de datos (`parseFloat('40,50')` son 40 €: 50 céntimos
//      perdidos en silencio en cada venta);
//   3. los errores salen pegados a su campo, no como una frase suelta;
//   4. «todas las clases» es una decisión explícita, no la letra pequeña de
//      no haber marcado nada;
//   5. cerrar con cambios sin guardar pregunta antes de tirarlos.
//
// Mismo enfoque que planes-por-tipo-de-clase.spec.ts: env dummy + backend
// interceptado, y se comprueba lo que se ESCRIBE, no lo que se pinta.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
};

const TIPOS_CLASE = [
  { id: 'tc-reformer', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#6D28D9' },
  { id: 'tc-mat', studio_id: STUDIO_ID, nombre: 'Mat', duracion_min: 50, color: '#F7A6C4' },
];

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

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockBackend(page: Page, planesIniciales: Record<string, unknown>[] = []) {
  const planes: Record<string, unknown>[] = [...planesIniciales];
  const vinculos: Record<string, unknown>[] = [];

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
      // Devuelve las filas TOCADAS, como hace PostgREST con `.select()`. Devolver
      // `[]` era irrealista y, desde que la escritura distingue «0 filas» de
      // «escrito» —para no cantar «Tarifa actualizada» cuando la RLS rechaza—,
      // este mock hacía fallar el guardado en el test y solo en el test.
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
      return route.fulfill({ status: 204, contentType: 'application/json', body: '[]' });
    }
    return json(route, vinculos);
  });

  return { planes, vinculos };
}

async function abrirFormulario(page: Page) {
  await page.goto('/productos');
  const crear = page.getByRole('button', { name: 'Crear', exact: true });
  await expect(crear).toBeVisible({ timeout: 30_000 });
  await crear.click();
  await expect(page.getByRole('dialog', { name: 'Nueva tarifa' })).toBeVisible();
}

const dialogo = (page: Page) => page.getByRole('dialog', { name: 'Nueva tarifa' });

test.describe('Crear una tarifa sin tener que pensar', () => {
  test('un bono de 4 sesiones se crea eligiendo tipo y rellenando 4 cosas', async ({ page }) => {
    const { planes } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    await d.getByRole('radio', { name: /Bono de sesiones/ }).click();
    await d.getByLabel('Nombre', { exact: false }).first().fill('Bono 4 clases');
    // ⚠️ Con COMA: es como se escribe un precio en España.
    await d.getByLabel('Precio', { exact: false }).first().fill('40,50');
    await d.getByLabel('Sesiones que incluye').fill('4');
    await d.getByLabel('Caducidad').fill('60');

    await d.getByRole('button', { name: 'Crear bono de sesiones' }).click();
    await expect(d).toBeHidden();

    expect(planes).toHaveLength(1);
    const guardado = planes[0];
    expect(guardado.nombre).toBe('Bono 4 clases');
    // El corazón del test: 40,50 € son 40.5, no 40.
    expect(guardado.precio).toBe(40.5);
    expect(guardado.tipo).toBe('BONO');
    expect(guardado.sesiones).toBe(4);
    expect(guardado.validez_dias).toBe(60);
    expect(guardado.activo).toBe(true);
  });

  test('una cuota mensual no pregunta por sesiones ni por caducidad', async ({ page }) => {
    const { planes } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    // Arranca en mensual: los campos de bono no deben existir siquiera.
    await expect(d.getByRole('radio', { name: /Cuota mensual/ })).toHaveAttribute('aria-checked', 'true');
    await expect(d.getByLabel('Sesiones que incluye')).toHaveCount(0);
    await expect(d.getByLabel('Caducidad')).toHaveCount(0);
    // Y el precio dice que es al mes, no un pago suelto.
    await expect(d.getByText('Precio al mes')).toBeVisible();

    // Al cambiar a bono aparecen, y al volver desaparecen otra vez.
    await d.getByRole('radio', { name: /Bono de sesiones/ }).click();
    await expect(d.getByLabel('Sesiones que incluye')).toBeVisible();
    await d.getByRole('radio', { name: /Cuota mensual/ }).click();
    await expect(d.getByLabel('Sesiones que incluye')).toHaveCount(0);

    await d.getByLabel('Nombre', { exact: false }).first().fill('Mensual ilimitado');
    await d.getByLabel('Precio', { exact: false }).first().fill('59');
    await d.getByRole('button', { name: 'Crear cuota mensual' }).click();
    await expect(d).toBeHidden();

    expect(planes).toHaveLength(1);
    expect(planes[0].tipo).toBe('MENSUAL');
    // Un mensual no caduca por días ni consume sesiones: se guarda vacío
    // aunque antes se hubiera escrito algo en la pestaña de bono.
    expect(planes[0].sesiones).toBeNull();
    expect(planes[0].validez_dias).toBeNull();
  });

  test('una clase suelta se guarda como una sesión sin preguntarlo', async ({ page }) => {
    const { planes } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    await d.getByRole('radio', { name: /Clase suelta/ }).click();
    // Una clase suelta es UNA sesión por definición: preguntarlo es ruido.
    await expect(d.getByLabel('Sesiones que incluye')).toHaveCount(0);
    await d.getByLabel('Nombre', { exact: false }).first().fill('Clase suelta');
    await d.getByLabel('Precio', { exact: false }).first().fill('15');
    await d.getByRole('button', { name: 'Crear clase suelta' }).click();
    await expect(d).toBeHidden();

    expect(planes).toHaveLength(1);
    expect(planes[0].tipo).toBe('PUNTUAL');
    expect(planes[0].sesiones).toBe(1);
  });
});

test.describe('Que no se pueda guardar un disparate', () => {
  test('los errores salen pegados a su campo, no en una frase suelta', async ({ page }) => {
    const { planes } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    // Nada más abrir no hay nada en rojo: gritar por campos que aún no has
    // tocado es ruido, no ayuda.
    await expect(d.getByRole('alert')).toHaveCount(0);

    await d.getByRole('button', { name: /^Crear/ }).click();
    // No se ha guardado nada y el nombre está marcado como inválido.
    expect(planes).toHaveLength(0);
    const nombre = d.getByLabel('Nombre', { exact: false }).first();
    await expect(nombre).toHaveAttribute('aria-invalid', 'true');
    await expect(d.getByRole('alert').filter({ hasText: 'Ponle un nombre a la tarifa' })).toBeVisible();

    // Al arreglarlo, ese error desaparece y queda el que sigue faltando.
    await nombre.fill('Bono 10');
    await expect(nombre).toHaveAttribute('aria-invalid', 'false');
    await expect(d.getByRole('alert').filter({ hasText: 'Falta el precio' })).toBeVisible();
  });

  test('⚠️ un 0 en la caducidad se rechaza, no se guarda como «no caduca»', async ({ page }) => {
    const { planes } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    await d.getByRole('radio', { name: /Bono de sesiones/ }).click();
    await d.getByLabel('Nombre', { exact: false }).first().fill('Bono raro');
    await d.getByLabel('Precio', { exact: false }).first().fill('40');
    await d.getByLabel('Sesiones que incluye').fill('4');
    await d.getByLabel('Caducidad').fill('0');

    await d.getByRole('button', { name: /^Crear/ }).click();
    // Antes esto se guardaba como null, o sea «sin caducidad»: exactamente lo
    // contrario de lo que acaba de escribir la propietaria.
    expect(planes).toHaveLength(0);
    await expect(d.getByRole('alert').filter({ hasText: /mayor que 0/ })).toBeVisible();
  });
});

test.describe('Lo que la clienta va a ver', () => {
  test('el resumen se escribe solo mientras se rellena', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);
    const resumen = d.locator('aside');

    await d.getByRole('radio', { name: /Bono de sesiones/ }).click();
    await d.getByLabel('Nombre', { exact: false }).first().fill('Bono 4 clases');
    await d.getByLabel('Precio', { exact: false }).first().fill('40,50');
    await d.getByLabel('Sesiones que incluye').fill('4');

    await expect(resumen.getByText('Bono 4 clases')).toBeVisible();
    await expect(resumen.getByText('40,50', { exact: false })).toBeVisible();
    // Las condiciones las redacta la app: nadie tiene que repetirlas a mano en
    // la descripción, que era lo que pasaba («Válido 2 meses» escrito a pelo).
    await expect(resumen.getByText('4 sesiones')).toBeVisible();
    await expect(resumen.getByText('Sin fecha de caducidad')).toBeVisible();

    await d.getByLabel('Caducidad').fill('60');
    await expect(resumen.getByText('Válido durante 60 días desde la compra')).toBeVisible();
  });

  test('«todas las clases» es una decisión que se toma, no la falta de otra', async ({ page }) => {
    const { vinculos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);
    const resumen = d.locator('aside');

    // Por defecto: todas, y el resumen lo dice con todas las letras.
    await expect(d.getByRole('radio', { name: /Todas las clases/ })).toHaveAttribute('aria-checked', 'true');
    await expect(resumen.getByText('Todas tus clases')).toBeVisible();

    await d.getByRole('radio', { name: /Solo algunas clases/ }).click();
    await d.getByRole('checkbox', { name: 'Reformer' }).check();
    await expect(resumen.getByText('Reformer')).toBeVisible();

    await d.getByLabel('Nombre', { exact: false }).first().fill('Bono Reformer');
    await d.getByLabel('Precio', { exact: false }).first().fill('130');
    await d.getByRole('button', { name: /^Crear/ }).click();
    await expect(d).toBeHidden();

    expect(vinculos.map(v => v.tipo_clase_id)).toEqual(['tc-reformer']);
  });
});

test.describe('No perder lo escrito', () => {
  test('cerrar con cambios sin guardar pregunta antes de tirarlos', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    await d.getByLabel('Nombre', { exact: false }).first().fill('Casi terminado');
    await d.getByRole('button', { name: 'Cancelar' }).click();

    // No se ha ido a ninguna parte: primero pregunta.
    await expect(page.getByText('¿Descartar los cambios?')).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(d.getByLabel('Nombre', { exact: false }).first()).toHaveValue('Casi terminado');

    await d.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(d).toBeHidden();
  });

  test('sin haber tocado nada, cerrar no molesta con la pregunta', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirFormulario(page);
    const d = dialogo(page);

    await d.getByRole('button', { name: 'Cancelar' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText('¿Descartar los cambios?')).toHaveCount(0);
  });
});

test.describe('Editar una tarifa que ya existe', () => {
  const BONO_EXISTENTE = {
    id: 'plan-bono-10', studio_id: STUDIO_ID, nombre: 'Bono 10 Reformer',
    descripcion: 'Para quien viene dos veces por semana', precio: 130,
    tipo: 'BONO', sesiones: 10, validez_dias: 90, limite_semanal: null, activo: true,
  };

  test('llega con todo puesto y el botón dice que se guardan cambios', async ({ page }) => {
    const { planes } = await mockBackend(page, [BONO_EXISTENTE]);
    await seedSesionDeDuena(page);
    await page.goto('/productos');
    // La lista arranca en «Suscripciones»; el bono vive en «Bonos».
    // (Esa pestaña se llamaba «Paquetes» hasta que ese pasó a ser el nombre de
    // la sección entera y habría quedado un «Paquetes › Paquetes».)
    await page.getByRole('button', { name: 'Bonos', exact: true }).click();
    await page.getByRole('button', { name: /Editar/ }).first().click();

    const d = page.getByRole('dialog', { name: 'Editar tarifa' });
    await expect(d).toBeVisible();
    await expect(d.getByLabel('Nombre', { exact: false }).first()).toHaveValue('Bono 10 Reformer');
    await expect(d.getByLabel('Precio', { exact: false }).first()).toHaveValue('130');
    await expect(d.getByLabel('Sesiones que incluye')).toHaveValue('10');
    await expect(d.getByLabel('Caducidad')).toHaveValue('90');
    // Editar NO dice «Crear»: el botón nombra lo que va a pasar.
    await expect(d.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();

    await d.getByLabel('Precio', { exact: false }).first().fill('145,50');
    await d.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(d).toBeHidden();

    expect(planes[0].precio).toBe(145.5);
    // Lo que no se tocó, no se toca.
    expect(planes[0].sesiones).toBe(10);
    expect(planes[0].validez_dias).toBe(90);
  });

  test('⚠️ una clase suelta antigua sin sesiones se puede seguir guardando', async ({ page }) => {
    // Las creadas con el formulario viejo pueden tener `sesiones` a null. Aquí
    // el campo ya no se pinta (una clase suelta es UNA sesión), así que sin
    // normalizarlo al abrir, el botón se quedaría muerto por un campo
    // obligatorio que no está en pantalla — y nadie sabría por qué.
    const { planes } = await mockBackend(page, [{
      id: 'plan-suelta', studio_id: STUDIO_ID, nombre: 'Clase suelta', descripcion: null,
      precio: 15, tipo: 'PUNTUAL', sesiones: null, validez_dias: null,
      limite_semanal: null, activo: true,
    }]);
    await seedSesionDeDuena(page);
    await page.goto('/productos');
    await page.getByRole('button', { name: 'Bajo demanda' }).click();
    await page.getByRole('button', { name: /Editar/ }).first().click();

    const d = page.getByRole('dialog', { name: 'Editar tarifa' });
    await d.getByLabel('Precio', { exact: false }).first().fill('18');
    await d.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(d).toBeHidden();

    expect(planes[0].precio).toBe(18);
    expect(planes[0].sesiones).toBe(1);
  });
});
