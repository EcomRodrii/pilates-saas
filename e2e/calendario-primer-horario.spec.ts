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
// La propietaria que da clases ella misma: con UNA instructora la propuesta ya
// las asigna y no hay nada que preguntar. Los tests de «equipo vacío» pasan [].
const CARMEN = {
  id: 'ins-1', studioId: 's', nombre: 'Carmen Ruiz', email: null, telefono: null, color: '#7FB2E5',
  activo: true, rol: 'PROPIETARIO', authUserId: AUTH_UID,
};

async function montar(page: Page, { conClases = false, tiposClase = TIPOS, instructores = [CARMEN] as unknown[] } = {}) {
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
    sesiones: conClases ? [SESION] : [], reservas: [], sustituciones: [], salas: SALAS, instructores,
    horaApertura: '07:00:00', horaCierre: '22:00:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await page.route('**/api/clases/import', r => {
    importaciones.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, { ok: true, creadas: 80, omitidas: 0, tiposCreados: 0, sinInstructor: 0, sinSala: 0, errores: [] });
  });
  await page.route('**/rest/v1/**', r => json(r, []));
  // Las instructoras del contexto salen de Supabase (filas en snake_case), no de
  // /api/calendario: sin esto el equipo salía siempre vacío.
  await page.route('**/rest/v1/instructores**', r => json(r, (instructores as Record<string, unknown>[]).map(i => ({
    id: i.id, studio_id: i.studioId, nombre: i.nombre, email: i.email, telefono: i.telefono,
    color: i.color, activo: i.activo, rol: i.rol, auth_user_id: i.authUserId,
  }))));
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

// Sin tipos de clase el calendario ya NO es un callejón: pregunta lo mínimo ahí
// mismo (antes solo había un enlace a Configuración, y «Ahora no» del asistente
// dejaba a la propietaria justo aquí).
test('sin tipos de clase pregunta lo mínimo y no deja pulsar hasta contestar', async ({ page }) => {
  await montar(page, { tiposClase: [] });
  await expect(page.getByRole('heading', { name: 'Tu horario todavía está vacío' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('¿Qué clases das?')).toBeVisible();
  await expect(page.getByText('¿Cuánto dura una clase?')).toBeVisible();
  // Las salas ya existen: no se le vuelve a preguntar por ellas.
  await expect(page.getByText('¿Cuántas salas tienes?')).toHaveCount(0);
  // Sin respuesta no se inventa nada.
  await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toBeDisabled();
});

// ⚠️ Con contador: guardar lo elegido tiene que llegar de verdad al servidor.
test('contestar crea solo lo elegido (origen calendario) y sigue a la propuesta, sin programar ninguna clase', async ({ page }) => {
  const { importaciones } = await montar(page, { tiposClase: [] });
  const configuraciones: Record<string, unknown>[] = [];
  await page.route('**/api/onboarding/configurar', r => {
    configuraciones.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, { ok: true, salas: 0, tiposClase: 1, planes: 0 });
  });
  await expect(page.getByText('¿Qué clases das?')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Reformer', exact: true }).click();
  await page.getByRole('button', { name: '50 minutos' }).click();
  await page.getByRole('button', { name: 'Ver el horario propuesto' }).click();

  await expect.poll(() => configuraciones.length, { timeout: 15_000 }).toBe(1);
  expect(configuraciones[0]).toMatchObject({ tiposClase: ['Reformer'], duracionMinutos: 50, origen: 'calendario' });
  expect(configuraciones[0]).not.toHaveProperty('numSalas');
  await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toBeVisible();
  // Guardar el catálogo no programa ninguna clase: eso solo al confirmar.
  expect(importaciones).toHaveLength(0);
});

test('si el servidor dice que no, lo dice y no sigue a una propuesta imposible', async ({ page }) => {
  await montar(page, { tiposClase: [] });
  let intentos = 0;
  await page.route('**/api/onboarding/configurar', r => { intentos++; return json(r, { error: 'No se han podido crear tus tipos de clase.' }, 500); });
  await expect(page.getByText('¿Qué clases das?')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Reformer', exact: true }).click();
  await page.getByRole('button', { name: '50 minutos' }).click();
  await page.getByRole('button', { name: 'Ver el horario propuesto' }).click();

  // `getByText` y no `getByRole('alert')`: el anunciador de rutas de Next también es un alert.
  await expect(page.getByText('No se han podido crear tus tipos de clase.')).toBeVisible();
  // Sin este contador el test pasaría aunque no se hubiera intentado nada.
  expect(intentos).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toHaveCount(0);
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

// ─────────────────────────────────────────────────────────────────────────────
// ¿Quién da las clases? — el cuello de botella de las altas nuevas.
//
// Con el equipo vacío la propuesta creaba las clases SIN instructora (el estudio
// nuevo de un día tenía 80 clases y ninguna instructora) y la primera pantalla
// tras «crear» ya traía avisos que la propietaria no entendía. Ahora se pregunta
// antes, y las clases nacen a nombre de quien las da. Todos con contador: sin él,
// «las clases llevan su instructora» pasaría igual si la petición no saliera.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Con el equipo vacío se pregunta quién da las clases', () => {
  test('con una instructora en el equipo NO se pregunta', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText('¿Quién da las clases?')).toHaveCount(0);
  });

  test('sin equipo pregunta, y no deja seguir hasta contestar', async ({ page }) => {
    await montar(page, { instructores: [] });
    await expect(page.getByText('¿Quién da las clases?')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toBeDisabled();
    // «Otra persona» sin nombre tampoco vale.
    await page.getByRole('button', { name: 'Otra persona' }).click();
    await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Nombre de la instructora' }).fill('Marta López');
    await expect(page.getByRole('button', { name: 'Ver el horario propuesto' })).toBeEnabled();
  });

  test('«Otra persona»: se da de alta con su nombre y las clases salen a su nombre', async ({ page }) => {
    const altas: Record<string, unknown>[] = [];
    const { importaciones } = await montar(page, { instructores: [] });
    await page.route('**/api/equipo', r => {
      if (r.request().method() === 'POST') { altas.push(r.request().postDataJSON() as Record<string, unknown>); return json(r, { ok: true }); }
      return json(r, {});
    });
    await expect(page.getByText('¿Quién da las clases?')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Otra persona' }).click();
    await page.getByRole('textbox', { name: 'Nombre de la instructora' }).fill('Marta   López');
    await page.getByRole('button', { name: 'Ver el horario propuesto' }).click();

    await expect.poll(() => altas.length, { timeout: 15_000 }).toBe(1);
    expect(altas[0]).toMatchObject({ nombre: 'Marta López', rol: 'INSTRUCTOR', activo: true });
    await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear este horario' }).click();

    await expect.poll(() => importaciones.length, { timeout: 15_000 }).toBe(1);
    const filas = (importaciones[0] as { rows: { instructor: string | null }[] }).rows;
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) expect(f.instructor).toBe('Marta López');
  });

  test('si no se puede añadir a esa persona, lo dice y NO sigue a una propuesta sin instructora', async ({ page }) => {
    let intentos = 0;
    await montar(page, { instructores: [] });
    await page.route('**/api/equipo', r => { intentos++; return json(r, { error: 'No se ha podido guardar a esa persona.' }, 500); });
    await expect(page.getByText('¿Quién da las clases?')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Otra persona' }).click();
    await page.getByRole('textbox', { name: 'Nombre de la instructora' }).fill('Marta López');
    await page.getByRole('button', { name: 'Ver el horario propuesto' }).click();

    await expect.poll(() => intentos, { timeout: 15_000 }).toBeGreaterThan(0);
    // Sale el mensaje del servidor, no un «listo» mudo.
    await expect(page.getByText('No se ha podido guardar a esa persona.').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toHaveCount(0);
  });

  test('«Las doy yo»: la ficha la crea el servidor y las clases salen con ese nombre', async ({ page }) => {
    const configuraciones: Record<string, unknown>[] = [];
    const { importaciones } = await montar(page, { instructores: [] });
    await page.route('**/api/onboarding/configurar', r => {
      configuraciones.push(r.request().postDataJSON() as Record<string, unknown>);
      return json(r, { ok: true, salas: 0, tiposClase: 0, planes: 0, instructora: true, instructoraNombre: 'Carmen Ruiz' });
    });
    await expect(page.getByText('¿Quién da las clases?')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Las doy yo' }).click();
    await page.getByRole('button', { name: 'Ver el horario propuesto' }).click();

    await expect.poll(() => configuraciones.length, { timeout: 15_000 }).toBe(1);
    expect(configuraciones[0]).toMatchObject({ imparteClases: true, origen: 'calendario' });
    await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear este horario' }).click();

    await expect.poll(() => importaciones.length, { timeout: 15_000 }).toBe(1);
    const filas = (importaciones[0] as { rows: { instructor: string | null }[] }).rows;
    for (const f of filas) expect(f.instructor).toBe('Carmen Ruiz');
  });

  test('«Lo decido luego»: sigue sin llamar a nadie y avisa de lo que pasa', async ({ page }) => {
    let altas = 0;
    let configuraciones = 0;
    const { importaciones } = await montar(page, { instructores: [] });
    await page.route('**/api/equipo', r => { altas++; return json(r, { ok: true }); });
    await page.route('**/api/onboarding/configurar', r => { configuraciones++; return json(r, { ok: true }); });
    await expect(page.getByText('¿Quién da las clases?')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Lo decido luego' }).click();
    await expect(page.getByText(/Se crearán sin instructora/)).toBeVisible();
    await page.getByRole('button', { name: 'Ver el horario propuesto' }).click();
    await expect(page.getByRole('heading', { name: 'Este sería tu horario' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear este horario' }).click();

    await expect.poll(() => importaciones.length, { timeout: 15_000 }).toBe(1);
    expect(altas).toBe(0);
    expect(configuraciones).toBe(0);
    for (const f of (importaciones[0] as { rows: { instructor: string | null }[] }).rows) expect(f.instructor).toBeNull();
  });
});
