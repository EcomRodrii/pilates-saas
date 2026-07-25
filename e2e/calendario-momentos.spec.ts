import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tres momentos del calendario que la dueña señaló en la prueba de usabilidad.
// Los tres tienen la misma forma: el programa sabe algo y no lo usa.
//
//   1. "Que la duración que configuro se use. Pongo 55 minutos y luego me
//      propones 09:00 a 09:00."  → `duracionMinutos` no se leía en ningún sitio
//      del calendario.
//   2. 🔴 "Que al cambiar la instructora me preguntes: ¿aviso a las 8 alumnas de
//      que hoy da Laura? Ese es el momento y no lo aprovechas."  → sí avisaba,
//      pero en silencio y sin decírselo.
//   3. "Que los números de arriba del calendario me hablen de la semana que
//      estoy mirando, no de hoy."  → filtraban por el día de hoy siempre.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// 55 minutos: el número exacto que ella puso de ejemplo.
const TIPOS = [
  { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null },
];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Laura', email: null, telefono: null, color: '#222', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `avisos` recoge las llamadas al endpoint que escribe a las alumnas. */
async function montarCalendario(page: Page, extra: { sesiones?: unknown[]; reservas?: unknown[] } = {}) {
  const avisos: string[] = [];

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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/clases/avisar-modificada**', route => {
    avisos.push(route.request().postData() ?? '');
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/rest/v1/sesiones**', route =>
    json(route, route.request().method() === 'GET' ? (extra.sesiones ?? []) : []));
  await page.route('**/rest/v1/reservas**', route =>
    json(route, route.request().method() === 'GET' ? (extra.reservas ?? []) : []));

  await page.goto('/calendario');
  return avisos;
}

test.describe('Momentos del calendario', () => {
  test('la duración configurada se usa: 55 min → 09:00 a 09:55', async ({ page }) => {
    await montarCalendario(page);

    await page.getByRole('button', { name: 'Nueva clase' }).first().click({ timeout: 30_000 });

    // El formulario abre ya con la duración del tipo aplicada, no con 09:00–09:00.
    const fin = page.locator('input[type="time"]').nth(1);
    await expect(page.locator('input[type="time"]').first()).toHaveValue('09:00');
    await expect(fin).toHaveValue('09:55');

    // Y al mover la hora de inicio, el fin la sigue manteniendo los 55 minutos.
    await page.locator('input[type="time"]').first().fill('18:30');
    await expect(fin).toHaveValue('19:25');
  });

  test('al cambiar solo la instructora, pregunta antes de avisar', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const avisos = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio: `${hoy}T09:00:00`, fin: `${hoy}T09:55:00`, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      reservas: [
        { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00` },
        { id: 'r2', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's2', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00` },
      ],
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();

    // Marta → Laura, sin tocar hora ni sala.
    await page.getByLabel('Instructora').selectOption({ label: 'Laura' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Pregunta, y nombra a quién afecta y quién da ahora la clase. (El panel de
    // detalle de la clase también es role="dialog": se filtra por el título.)
    const dialogo = page.getByRole('dialog').filter({ hasText: '¿Aviso a' });
    await expect(dialogo).toContainText('¿Aviso a las 2 alumnas?');
    await expect(dialogo).toContainText('Laura');

    // Nada se ha mandado todavía.
    expect(avisos).toHaveLength(0);

    // Y decir que no, no manda nada.
    await dialogo.getByRole('button', { name: 'No hace falta' }).click();
    await expect(dialogo).toHaveCount(0);
    expect(avisos).toHaveLength(0);
  });

  test('los números de arriba hablan de la semana que se está mirando', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio: `${hoy}T09:00:00`, fin: `${hoy}T09:55:00`, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
    });

    // En la semana actual: 1 clase, y lo dice.
    await expect(page.getByText('Clases esta semana')).toBeVisible({ timeout: 30_000 });

    // Al pasar a otra semana la etiqueta cambia y el número deja de ser el de hoy.
    await page.getByRole('button', { name: /Semana siguiente|Siguiente/ }).first().click();
    await expect(page.getByText('Clases esa semana')).toBeVisible();
  });

  test('cambiar solo el aforo NO avisa a nadie', async ({ page }) => {
    // Regresión: `cambioHora` comparaba `sesionActual.inicio` (Postgres:
    // "…T09:00:00+00:00") con `toISO(...)` ("…T09:00:00.000Z") como CADENAS.
    // Era siempre distinto, así que cualquier edición —una nota, el aforo—
    // mandaba a todas las apuntadas un aviso de que su clase había cambiado.
    const hoy = new Date().toISOString().slice(0, 10);
    const avisos = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio: `${hoy}T09:00:00+00:00`, fin: `${hoy}T09:55:00+00:00`, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      reservas: [
        { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00+00:00` },
      ],
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();

    await page.getByLabel('Aforo máximo').fill('12');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText('Clase actualizada')).toBeVisible();
    // Ni aviso automático ni pregunta: no ha cambiado nada que le importe a la alumna.
    await expect(page.getByRole('dialog').filter({ hasText: '¿Aviso a' })).toHaveCount(0);
    expect(avisos).toHaveLength(0);
  });
});
