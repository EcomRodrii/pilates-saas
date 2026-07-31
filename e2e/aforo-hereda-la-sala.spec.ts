import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El aforo no sabía nada de la sala.
//
// El estudio configura "Sala Reformer, 8 plazas" en Configuración, y luego, al
// crear cada clase, tenía que volver a teclear el aforo a mano. El formulario ni
// siquiera RECIBÍA la capacidad: el prop `salas` estaba tipado como
// `{id, nombre}[]` y la capacidad se quedaba por el camino.
//
// Dos consecuencias, y la segunda cuesta dinero:
//   · teclear lo mismo en cada una de las 20 clases de la semana;
//   · si se despista, la clase sale con el aforo por defecto. Con 12 en una sala
//     de 8 se venden cuatro plazas que no existen, y el problema aparece con
//     cuatro clientas de pie en la puerta.
//
// Se avisa, no se bloquea: hay estudios que meten una colchoneta extra a
// propósito, y esa decisión es suya. Lo que no puede pasar es que nadie se lo
// diga hasta que llega la gente.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };

// Dos salas de tamaños MUY distintos: así se ve si el aforo sigue a la sala o
// se queda con el valor por defecto del formulario.
const SALAS = [
  { id: 'sala-reformer', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8, color: '#F7A6C4' },
  { id: 'sala-mat', studio_id: STUDIO_ID, nombre: 'Sala Mat', capacidad: 25, color: '#6D28D9' },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Rediseño del Calendario: la rejilla lee horaApertura/horaCierre/salas de
// /api/calendario — sin este mock, `datosVista` queda `{}` (por el catch-all
// de abajo) y la rejilla revienta al leer `horaApertura.slice(...)`.
function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email ?? null, telefono: r.telefono ?? null,
    color: r.color, activo: r.activo, avatar: r.avatar ?? null, fotoUrl: r.foto_url ?? null,
    rol: r.rol ?? 'INSTRUCTOR', authUserId: r.auth_user_id ?? null,
  };
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

async function mockBackend(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [], reservas: [], sustituciones: [],
    salas: SALAS.map(salaApi), instructores: EQUIPO.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
}

async function abrirNuevaClase(page: Page) {
  await page.goto('/calendario');
  await page.getByRole('button', { name: /Nueva clase|Crear primera clase/ })
    .first().click({ timeout: 30_000 });
}

test.describe('El aforo sabe cuántas plazas tiene la sala', () => {
  test('al elegir sala, el aforo pasa a ser el de esa sala', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirNuevaClase(page);

    const sala = page.getByRole('combobox', { name: 'Sala' });
    const aforo = page.getByRole('spinbutton', { name: /Aforo/i });
    await expect(sala).toBeVisible();

    await sala.selectOption('sala-reformer');
    await expect(aforo, 'la sala de reformer tiene 8').toHaveValue('8');

    // Y sigue a la sala si se cambia de idea.
    await sala.selectOption('sala-mat');
    await expect(aforo, 'la de mat tiene 25').toHaveValue('25');
  });

  test('si lo escribes a mano, cambiar de sala ya no te lo pisa', async ({ page }) => {
    // Una clase deliberadamente más pequeña (una recuperación, un taller) es
    // decisión del estudio. Heredar está bien; sobrescribir lo que alguien
    // acaba de escribir, no.
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirNuevaClase(page);

    const sala = page.getByRole('combobox', { name: 'Sala' });
    const aforo = page.getByRole('spinbutton', { name: /Aforo/i });

    await sala.selectOption('sala-mat');
    await expect(aforo).toHaveValue('25');

    await aforo.fill('6');
    await sala.selectOption('sala-reformer');
    await expect(aforo, 'lo escrito a mano manda').toHaveValue('6');
  });

  test('pasarse de la capacidad de la sala se avisa mientras escribes', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirNuevaClase(page);

    const sala = page.getByRole('combobox', { name: 'Sala' });
    const aforo = page.getByRole('spinbutton', { name: /Aforo/i });

    await sala.selectOption('sala-reformer');
    // Acotado al aviso propio: `role="alert"` lo usa también el anunciador de
    // rutas de Next, que está siempre presente y vacío.
    const avisoAforo = page.getByRole('alert').filter({ hasText: 'plaza' });
    await expect(avisoAforo, 'con el aforo de la sala no hay nada que avisar').toHaveCount(0);

    await aforo.fill('12');
    const aviso = page.getByRole('alert').filter({ hasText: 'Sala Reformer' });
    await expect(aviso).toContainText('8 plazas');
    await expect(aviso, 'dice cuántas sobran, no solo que hay un problema')
      .toContainText('4 más de las que caben');

    // Y no bloquea: hay estudios que meten una colchoneta extra a propósito.
    await expect(page.getByRole('button', { name: /Crear|Guardar/ }).first()).toBeEnabled();
  });
});
