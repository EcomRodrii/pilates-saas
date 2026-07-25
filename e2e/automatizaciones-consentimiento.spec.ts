import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Encender una automatización que escribe a las clientas es dar permiso para
// mandar mensajes en nombre del estudio. Antes no lo parecía:
//
//   · el botón "Cargar reglas sugeridas" insertaba 7 reglas con activa:true en
//     duro, de un clic y sin confirmación;
//   · el interruptor eran dos iconos monocromos del mismo tamaño — encendido y
//     apagado se veían idénticos.
//
// Lo primero y lo segundo ya se corrigieron en main (616b660): las sugeridas
// nacen apagadas y el interruptor es un switch relleno con role="switch". Lo
// que faltaba, y fija este test, es que ENCENDER una regla que escribe a las
// clientas pida permiso explícito y diga a cuánta gente va a alcanzar.
//
// Una clienta en prueba lo resumió: "descubrí que seis automatizaciones estaban
// encendidas escribiéndole a mis clientas sin que yo lo hubiera aprobado".
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const REGLA_QUE_ESCRIBE = {
  id: 'rule-1', studio_id: STUDIO_ID, nombre: 'Socia ausente',
  descripcion: 'Recuerda a las clientas que llevan días sin venir y ofrece una vuelta con descuento',
  icono: '👤', trigger: 'AUSENCIA_DIAS', condicion: { dias: 7 }, pasos: [],
  activa: false, ejecutada_veces: 0, ultima_ejecucion: null, creada_en: '2026-01-01T00:00:00Z',
};

// Dos de las tres pueden recibir un mensaje; la tercera no tiene ni email ni
// teléfono. El diálogo tiene que contar 2, no 3.
const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
  { id: 's2', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'López', email: null, telefono: '600000000', activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
  { id: 's3', studio_id: STUDIO_ID, nombre: 'Sin', apellidos: 'Contacto', email: null, telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarPantalla(page: Page) {
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

  // Playwright resuelve las rutas en orden INVERSO al de registro: comodines
  // primero, específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/automation_rules**', route =>
    json(route, route.request().method() === 'GET' ? [REGLA_QUE_ESCRIBE] : []));

  await page.goto('/automatizaciones');
  // La pantalla abre por el registro de acciones; las reglas están en la otra
  // pestaña (main 616b660 la renombró a "Reglas" e incluye las apagadas).
  await page.getByRole('button', { name: 'Reglas', exact: true }).click({ timeout: 30_000 });
}

test.describe('Activar una automatización que escribe a las clientas', () => {
  test('el estado se lee de un vistazo y encender pide permiso', async ({ page }) => {
    await montarPantalla(page);

    const interruptor = page.getByRole('switch');
    await expect(interruptor).toBeVisible({ timeout: 30_000 });

    // Estado legible para lectores de pantalla (el color lo pone el switch).
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(interruptor).toHaveAttribute('title', 'Desactivada — activar');

    await interruptor.click();

    // No se enciende sin decir qué implica y a cuánta gente alcanza.
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Esto va a escribir a tus clientas');
    await expect(dialogo).toContainText('Socia ausente');
    await expect(dialogo).toContainText('2 clientas');

    // Decir que no la deja como estaba.
    await dialogo.getByRole('button', { name: 'No, dejarla pausada' }).click();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  test('al aceptar se activa y se ve activada', async ({ page }) => {
    await montarPantalla(page);

    const interruptor = page.getByRole('switch');
    await expect(interruptor).toBeVisible({ timeout: 30_000 });
    await interruptor.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, activarla' }).click();

    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch')).toHaveAttribute('title', 'Activada — desactivar');
  });

  test('apagar no pregunta: dejar de escribir no necesita permiso', async ({ page }) => {
    await montarPantalla(page);

    const interruptor = page.getByRole('switch');
    await expect(interruptor).toBeVisible({ timeout: 30_000 });

    // Encender (con confirmación) y volver a apagar: la segunda vez, directo.
    await interruptor.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, activarla' }).click();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('switch').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
