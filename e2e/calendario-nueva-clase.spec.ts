import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Nueva clase» del calendario, rediseñado (fase 1, solo pantalla).
//
// Lo que se fija aquí, y por qué:
//  · Una clase que se repite choca en una semana POSTERIOR: antes solo se miraba
//    la primera, la base de datos rechazaba la serie entera y el aviso no decía
//    qué fecha. Ahora esa fecha se lista, se salta, y se crean las demás en UN
//    insert — con contador: «no mintió» no vale si no se intentó nada.
//  · Si la escritura falla, no se anuncia nada como creado.
//  · El texto de las plazas decía «entran en lista de espera» también donde no
//    la hay.
//  · La hora de fin sigue la duración del tipo HASTA que se toca a mano.
//
// Horas con zona en los datos y escritas a mano en las aserciones: el
// navegador pinta en hora del estudio (Europe/Madrid) sea cual sea la zona de
// la máquina que corre el test.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Miércoles 5 de agosto de 2026, mediodía en Madrid.
const AHORA = new Date('2026-08-05T12:00:00+02:00');

const TIPO_BASE = { studio_id: STUDIO_ID, color: '#F7A6C4', descripcion: null, nivel: 'TODOS', foto_url: null };
const TIPOS = [
  { ...TIPO_BASE, id: 'tc-1', nombre: 'Reformer', duracion_minutos: 45, aforo_por_defecto: 8 },
  // Este tipo no tiene lista de espera aunque el estudio sí.
  { ...TIPO_BASE, id: 'tc-2', nombre: 'Mat', duracion_minutos: 60, permite_lista_espera: false },
];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null }];

// La sala ya está ocupada el miércoles 19, dos semanas después.
const OCUPADA = {
  id: 'ses-ocupa', studio_id: STUDIO_ID, tipo_clase_id: 'tc-2', sala_id: 'sala-1', instructor_id: 'ins-otra',
  inicio: '2026-08-19T09:00:00+02:00', fin: '2026-08-19T10:00:00+02:00', aforo_maximo: 10, cancelada: false,
  notas: null, precio_puntual: null, serie_id: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Opciones {
  studio?: Record<string, unknown>;
  horario?: { dia_semana: number; abierto: boolean; hora_apertura: string | null; hora_cierre: string | null }[];
  /** Cómo contesta la base de datos al crear. */
  insert?: { status: number; body: unknown };
  tipos?: Record<string, unknown>[];
}

async function montar(page: Page, o: Opciones = {}) {
  await page.clock.setFixedTime(AHORA);
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
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
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, {
    id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, ...o.studio,
  }));
  if (o.horario) {
    const horario = o.horario;
    await page.route('**/rest/v1/studio_horario**', route => json(route, horario.map(h => ({ studio_id: STUDIO_ID, ...h }))));
  }
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, o.tipos ?? TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));

  const inserts: unknown[] = [];
  await page.route('**/rest/v1/sesiones**', route => {
    if (route.request().method() === 'GET') return json(route, [OCUPADA]);
    inserts.push(route.request().postDataJSON());
    const r = o.insert ?? { status: 201, body: [] };
    return json(route, r.body, r.status);
  });
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [], reservas: [], sustituciones: [],
    salas: SALAS.map(s => ({ id: s.id, studioId: s.studio_id, nombre: s.nombre, capacidad: s.capacidad, color: s.color })),
    instructores: INSTRUCTORES.map(i => ({ id: i.id, studioId: i.studio_id, nombre: i.nombre, email: null, telefono: null, color: i.color, activo: true, avatar: null, fotoUrl: null, rol: 'INSTRUCTOR', authUserId: null })),
    horaApertura: '08:00:00', horaCierre: '22:00:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));

  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Crear clase', exact: true }).first().click({ timeout: 30_000 });
  await page.getByTestId('crear-clase-suelta').click();
  const cajon = page.getByRole('dialog', { name: 'Nueva clase' });
  await expect(cajon).toBeVisible();
  return { cajon, inserts };
}

test.describe('Nueva clase: se repite', () => {
  test('un solape en una semana posterior se lista con fecha y motivo, se salta, y el resto se crea en un insert', async ({ page }) => {
    const { cajon, inserts } = await montar(page);

    await cajon.getByRole('switch', { name: 'Se repite' }).click();
    // Arranca con el día de la fecha (miércoles) y cuatro semanas: 5, 12, 19 y 26.
    await expect(cajon.getByRole('button', { name: 'Miércoles' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cajon.getByTestId('clases-repeticion')).toHaveText('· 4 clases');

    const saltos = cajon.getByTestId('fechas-saltadas');
    await expect(saltos).toContainText('1 fecha choca con otra clase');
    await expect(saltos).toContainText('mié 19 ago · Sala 1 ocupada 09:00–10:00 (Mat)');
    await expect(saltos).toContainText('Se crearán las otras 3 y te diremos cuáles se han saltado.');

    await cajon.getByRole('button', { name: 'Crear 3 clases' }).click();

    await expect(page.getByText('Serie creada · 3 clases · se ha saltado el mié 19 ago')).toBeVisible();
    // UN insert, con las tres fechas libres y sin la que choca.
    expect(inserts).toHaveLength(1);
    const filas = inserts[0] as { inicio: string; serie_id: string | null }[];
    expect(filas.map(f => f.inicio.slice(0, 10))).toEqual(['2026-08-05', '2026-08-12', '2026-08-26']);
    expect(new Set(filas.map(f => f.serie_id)).size, 'una sola serie').toBe(1);
    await expect(cajon).toBeHidden();
  });

  test('si la base de datos dice que no, no se anuncia nada como creado', async ({ page }) => {
    const { cajon, inserts } = await montar(page, {
      insert: { status: 409, body: { code: '23P01', message: 'conflicting key value violates exclusion constraint "sesiones_sala_sin_solape"', details: null, hint: null } },
    });

    await cajon.getByRole('switch', { name: 'Se repite' }).click();
    await cajon.getByRole('button', { name: 'Crear 3 clases' }).click();

    await expect(cajon.getByRole('alert').filter({ hasText: 'No se ha creado' }))
      .toHaveText('No se ha creado ninguna. Esa sala o instructora ya tiene una clase a esa hora. Elige otro hueco.');
    expect(inserts.length, 'tiene que haberlo intentado').toBeGreaterThan(0);
    await expect(page.getByText(/Serie creada/)).toHaveCount(0);
    // Sigue abierto con lo que había, para cambiarlo y volver a intentarlo.
    await expect(cajon.getByRole('button', { name: 'Crear 3 clases' })).toBeEnabled();
  });

  test('si todas las fechas chocan, no deja crear', async ({ page }) => {
    const { cajon, inserts } = await montar(page);

    await cajon.getByRole('switch', { name: 'Se repite' }).click();
    await cajon.getByLabel('Fecha', { exact: true }).fill('2026-08-19');
    await cajon.getByLabel('Hasta el').fill('2026-08-19');

    await expect(cajon.getByTestId('fechas-saltadas')).toContainText('No queda ninguna fecha libre');
    await expect(cajon.getByRole('button', { name: 'Crear clases' })).toBeDisabled();
    expect(inserts).toHaveLength(0);
  });
});

test.describe('Nueva clase: lo que se lee es lo que pasa', () => {
  test('sin lista de espera, el texto de las plazas no la promete', async ({ page }) => {
    const { cajon } = await montar(page, { studio: { permite_lista_espera: false } });

    const alLlenarse = cajon.getByTestId('al-llenarse');
    await expect(alLlenarse).toHaveText('Al llenarse, tus alumnas ya no pueden reservarla: tu estudio no tiene lista de espera.');
    await expect(alLlenarse).not.toContainText('entran en lista de espera');
    // Las plazas, las del tipo de clase y con la sala al lado.
    await expect(cajon.getByRole('spinbutton', { name: 'Plazas' })).toHaveValue('8');
    await expect(cajon.getByText('las del tipo de clase · la sala tiene 10')).toBeVisible();
  });

  test('un tipo sin lista de espera lo dice él, y sus reglas propias se ven en el plegable', async ({ page }) => {
    const { cajon } = await montar(page);

    await expect(cajon.getByTestId('al-llenarse')).toContainText('entran en lista de espera');
    await cajon.getByRole('combobox', { name: 'Tipo de clase' }).selectOption('tc-2');
    await expect(cajon.getByTestId('al-llenarse')).toHaveText('Al llenarse, tus alumnas ya no pueden reservarla: «Mat» no tiene lista de espera.');

    const reglas = cajon.locator('details').filter({ hasText: 'Cómo se reserva esta clase' });
    await expect(reglas).toContainText('Reglas propias de Mat');
    await reglas.getByText('Cómo se reserva esta clase').click();
    await expect(reglas).toContainText('Con la clase llena, nadie más puede apuntarse a la lista de espera.');
  });

  test('la hora de fin sigue al tipo hasta que se toca a mano', async ({ page }) => {
    const { cajon } = await montar(page);
    const empieza = cajon.getByRole('textbox', { name: 'Empieza' });
    const termina = cajon.getByRole('textbox', { name: 'Termina' });
    const duracion = cajon.getByTestId('duracion-clase');

    await expect(empieza).toHaveValue('09:00');
    await expect(termina).toHaveValue('09:45');
    await expect(duracion).toHaveText('(45 min)');

    // Automática: cambia con el tipo y con la hora de inicio.
    await cajon.getByRole('combobox', { name: 'Tipo de clase' }).selectOption('tc-2');
    await expect(termina).toHaveValue('10:00');
    await expect(duracion).toHaveText('(1 h)');

    // Escrita a mano: cambiar la hora de inicio ya no la pisa.
    await termina.fill('10:30');
    await empieza.fill('09:15');
    await expect(termina).toHaveValue('10:30');
    await expect(duracion).toHaveText('(1 h 15 min)');

    // Y se puede volver a la del tipo.
    await cajon.getByRole('button', { name: 'Volver a la duración del tipo (1 h)' }).click();
    await expect(termina).toHaveValue('10:15');
  });

  test('fuera del horario de ese día avisa, pero deja crear', async ({ page }) => {
    const horario = [0, 1, 2, 3, 4, 5, 6].map(d => ({
      dia_semana: d, abierto: d !== 0,
      hora_apertura: d === 0 ? null : d === 3 ? '09:30:00' : '08:00:00',
      hora_cierre: d === 0 ? null : '21:00:00',
    }));
    const { cajon } = await montar(page, { horario });

    await expect(cajon.getByTestId('aviso-horario')).toHaveText('Tu estudio abre a las 09:30 los miércoles. Puedes crearla igual.');
    await expect(cajon.getByRole('button', { name: 'Crear clase' })).toBeEnabled();

    await cajon.getByRole('textbox', { name: 'Empieza' }).fill('10:00');
    await expect(cajon.getByTestId('aviso-horario')).toHaveCount(0);
  });
});

// Un tipo archivado (migr 20260930215125) no programa clases nuevas: lo impide
// un trigger en `sesiones`. El selector no lo ofrece, y si otra pestaña lo
// archivó con este formulario abierto, lo que dice la base de datos se entiende.
test.describe('Nueva clase: tipos archivados', () => {
  // Primero en la lista a propósito: sin filtrar, sería el tipo por defecto.
  const ARCHIVADO = { ...TIPO_BASE, id: 'tc-0', nombre: 'Barre', duracion_minutos: 50, archivado_en: '2026-08-01T10:00:00+02:00' };

  test('no se ofrece, ni como tipo por defecto', async ({ page }) => {
    const { cajon } = await montar(page, { tipos: [ARCHIVADO, ...TIPOS] });
    const tipo = cajon.getByRole('combobox', { name: 'Tipo de clase' });
    await expect(tipo).toHaveValue('tc-1');
    await expect(tipo.locator('option')).toHaveText(['Reformer · 45 min · 8 plazas', 'Mat · 60 min']);
  });

  test('si lo archivaron mientras tanto, el aviso lo dice y no se anuncia nada', async ({ page }) => {
    const { cajon, inserts } = await montar(page, {
      insert: { status: 400, body: { code: 'P0001', message: 'TIPO_ARCHIVADO', details: null, hint: null } },
    });

    await cajon.getByRole('button', { name: 'Crear clase', exact: true }).click();

    await expect(cajon.getByRole('alert').filter({ hasText: 'No se ha creado' })).toHaveText(
      'No se ha creado. Ese tipo de clase está archivado: ya no se programan clases nuevas suyas. Elige otro, o recupéralo en Configuración → Mis clases y citas.',
    );
    expect(inserts.length, 'tiene que haberlo intentado').toBeGreaterThan(0);
    await expect(page.getByText('Clase creada')).toHaveCount(0);
    await expect(cajon.getByRole('button', { name: 'Crear clase', exact: true })).toBeEnabled();
  });
});
