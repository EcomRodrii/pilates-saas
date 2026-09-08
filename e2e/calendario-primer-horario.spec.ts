import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario de un estudio que todavía no tiene ninguna clase.
//
// El agujero que tapa: la pantalla más usada del panel NO tenía estado vacío.
// Un estudio recién creado —con sus salas y tipos de clase ya montados por el
// asistente— llegaba a una rejilla horaria en blanco sin un solo texto que le
// dijera qué hacer. Medido en producción: 10 de 10 estudios acaban con salas y
// solo 4 de 10 llegan a programar una clase; sin clases la página pública no
// tiene nada que enseñar y la primera reserva es imposible (2 de 10).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const TIPOS = [
  { id: 'tc-1', studioId: 's', nombre: 'Reformer', color: '#7FB2E5', duracionMinutos: 50, nivel: 'TODOS', activo: true },
  { id: 'tc-2', studioId: 's', nombre: 'Mat', color: '#8FC98A', duracionMinutos: 50, nivel: 'TODOS', activo: true },
];
const SALAS = [{ id: 'sala-1', studioId: 's', nombre: 'Sala', capacidad: 8, color: '#7FB2E5' }];

async function montar(page: Page, { conClases = false, tiposClase = TIPOS } = {}) {
  const importaciones: Record<string, unknown>[] = [];
  await page.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({
      access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
      user: { id: u, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // ⚠️ El catch-all va PRIMERO: Playwright resuelve las rutas en orden inverso
  // al de registro, así que la última gana. Al revés se traga las concretas.
  await page.route('**/api/**', r => json(r, {}));
  await page.route('**/api/layout**', r => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/**', r => json(r, { bloqueado: false, activo: true, plan: 'ESTUDIO', configurado: true }));
  await page.route('**/api/theme**', r => json(r, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  const SESION = {
    id: 'ses-1', studioId: 's', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: null,
    inicio: new Date(Date.now() + 864e5).toISOString(), fin: new Date(Date.now() + 864e5 + 3e6).toISOString(),
    aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, serieId: null,
  };
  await page.route('**/api/calendario**', r => json(r, {
    sesiones: conClases ? [SESION] : [], reservas: [], sustituciones: [], salas: SALAS, instructores: [],
    horaApertura: '07:00:00', horaCierre: '22:00:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await page.route('**/api/clases/import', r => {
    importaciones.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, { ok: true, creadas: 80, omitidas: 0, tiposCreados: 0, sinInstructor: 0, sinSala: 0, errores: [] });
  });
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/rest/v1/tipos_clase**', r => json(r, tiposClase));
  await page.route('**/rest/v1/salas**', r => json(r, SALAS));
  await page.route('**/rest/v1/studios**', r => json(r, {
    id: 's', nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID,
    bienvenida_vista_en: '2026-01-01T00:00:00Z', hora_apertura: '07:00:00', hora_cierre: '22:00:00',
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', r => json(r, 's'));

  await page.goto('/calendario');
  return { importaciones };
}

test('un estudio sin ninguna clase ya no recibe una rejilla en blanco', async ({ page }) => {
  await montar(page);
  await expect(page.getByRole('heading', { name: 'Tu horario todavía está vacío' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toBeVisible();
  // Y el otro camino real, para quien ya tiene su horario en un Excel.
  await expect(page.getByRole('link', { name: /Ya tengo mi horario/ })).toBeVisible();
});

// Sin tipos de clase no hay nada que proponer: lo primero es crearlos.
test('sin tipos de clase se ofrece crearlos, no un horario imposible', async ({ page }) => {
  await montar(page, { tiposClase: [] });
  await expect(page.getByRole('heading', { name: 'Tu horario todavía está vacío' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Crear tus tipos de clase' })).toBeVisible();
});

// Una semana vacía en un estudio en marcha es normal (vacaciones): el bloque
// solo sale con CERO clases. Y la comprobación es doble a propósito — si la
// lista completa de sesiones fallara al cargar, le diríamos «tu horario está
// vacío» a alguien con el calendario lleno delante.
test('un estudio con clases NO ve el bloque de primer horario', async ({ page }) => {
  await montar(page, { conClases: true });
  // `exact` porque «Semana» también casa con «Semana anterior» y «Semana
  // siguiente», y sin él Playwright falla por ambigüedad.
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Tu horario todavía está vacío' })).toHaveCount(0);
  // Y la clase del estudio sí se ve: la comprobación de arriba no pasa por
  // haberse quedado la pantalla a medias.
  await expect(page.getByRole('button', { name: /Reformer/ }).first()).toBeVisible();
});

test('la propuesta se ve antes de crear nada, y se puede quitar clases', async ({ page }) => {
  const { importaciones } = await montar(page);
  await page.getByRole('button', { name: 'Ver el horario propuesto' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toBeVisible();

  // Nada se ha creado por el mero hecho de mirarla.
  expect(importaciones).toHaveLength(0);

  const antes = await page.getByRole('button', { name: /^Quitar / }).count();
  expect(antes).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Quitar / }).first().click();
  expect(await page.getByRole('button', { name: /^Quitar / }).count()).toBe(antes - 1);
});

// ⚠️ Con contador de peticiones: un test que solo mire la pantalla pasaría
// aunque el horario no llegara a crearse nunca.
test('confirmar manda el horario por el importador, marcado como del onboarding', async ({ page }) => {
  const { importaciones } = await montar(page);
  await page.getByRole('button', { name: 'Ver el horario propuesto' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear este horario' }).click();

  await expect.poll(() => importaciones.length, { timeout: 15_000 }).toBe(1);
  const cuerpo = importaciones[0] as { rows: { diaSemana: number; horaInicio: string }[]; semanas: number; origen: string };
  expect(cuerpo.origen).toBe('onboarding');
  expect(cuerpo.semanas).toBeGreaterThan(0);
  expect(cuerpo.rows.length).toBeGreaterThan(0);
  // Filas recurrentes por día de la semana, no fechas sueltas.
  for (const f of cuerpo.rows) {
    expect(f.diaSemana).toBeGreaterThanOrEqual(0);
    expect(f.horaInicio).toMatch(/^\d{2}:\d{2}$/);
  }
});

test('«Lo monto yo» no crea nada', async ({ page }) => {
  const { importaciones } = await montar(page);
  await page.getByRole('button', { name: 'Ver el horario propuesto' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Lo monto yo' }).click();
  await expect(page.getByRole('heading', { name: 'Tu horario todavía está vacío' })).toBeVisible();
  expect(importaciones).toHaveLength(0);
});
